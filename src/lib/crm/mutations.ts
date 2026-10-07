import "server-only";

import argon2 from "argon2";
import { Prisma, type LeadActiveTeam, RetentionStatus, SalesStatus } from "@prisma/client";
import { z } from "zod";
import { read, utils } from "xlsx";
import { getCountry, normalizeCountryCode } from "@/lib/countries";
import { calculateDepositSummary, depositBelongsToLead, formatUsdAmount } from "@/lib/crm/deposit-summary";
import {
  DEFAULT_IMPORT_BATCH_SIZE,
  buildLeadImportReport,
  buildLeadImportCreatePlan,
  chunkLeadImportRows,
  rejectExistingLeadDuplicates,
  rejectedImportRowFromValid,
  validateLeadImportRows,
  type ValidLeadImportRow,
} from "@/lib/crm/import-leads";
import { db } from "@/lib/db";
import { ACTIVE_TEAMS, RETENTION_STATUSES, SALES_STATUSES, type ActionState, type AuthenticatedLeadUser, type LeadImportRejectedRow } from "@/lib/leads/types";
import { canAddDeposit, canAddNote, canAssignRetentionAgent, canAssignSalesAgent, canDeleteDeposit, canEditRetentionStatus, canEditSalesStatus, canToggleNotePin, canUpdateActiveTeam } from "@/lib/leads/permissions";

const ok = (message: string): ActionState => ({ ok: true, message });
const fail = (message: string, errors?: Record<string, string[]>): ActionState => ({ ok: false, message, errors });

const userFormSchema = z.object({
  userId: z.string().optional(),
  fullName: z.string().trim().min(1, "Full name is required.").max(120),
  email: z.string().trim().email("Enter a valid email.").transform((value) => value.toLowerCase()),
  password: z.string().max(256).optional(),
  role: z.enum(["ADMIN", "SALES_AGENT", "RETENTION_AGENT"]),
});

const leadProfileSchema = z.object({
  leadId: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  prefix: z.string().trim().max(24).optional(),
  countryCode: z.string().trim().max(24).optional(),
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  alternateEmail: z.string().trim().max(160).optional(),
  phone: z.string().trim().min(1).max(60),
  alternatePhone: z.string().trim().max(60).optional(),
  dateOfBirth: z.string().trim().optional(),
  gender: z.string().trim().max(40).optional(),
  language: z.string().trim().max(60).optional(),
  timeZone: z.string().trim().max(80).optional(),
  additionalInfo: z.string().trim().max(2000).optional(),
  totalBalance: z.string().trim().min(1),
});

const salesStatusSchema = z.object({ leadId: z.string().min(1), salesStatus: z.enum(SALES_STATUSES as [SalesStatus, ...SalesStatus[]]) });
const retentionStatusSchema = z.object({ leadId: z.string().min(1), retentionStatus: z.enum(RETENTION_STATUSES as [RetentionStatus, ...RetentionStatus[]]) });
const activeTeamSchema = z.object({ leadId: z.string().min(1), activeTeam: z.enum(ACTIVE_TEAMS as [LeadActiveTeam, ...LeadActiveTeam[]]) });
const salesAssignmentSchema = z.object({ leadId: z.string().min(1), salesAgentId: z.string().optional() });
const retentionAssignmentSchema = z.object({ leadId: z.string().min(1), retentionAgentId: z.string().optional() });
const noteSchema = z.object({ leadId: z.string().min(1), body: z.string().trim().min(1).max(5000), isPinned: z.string().optional() });
const depositSchema = z.object({ leadId: z.string().min(1), amount: z.string().trim().min(1) });
const deleteDepositSchema = z.object({ leadId: z.string().min(1), depositId: z.string().min(1) });

function requireAdminUser(user: AuthenticatedLeadUser) {
  if (user.role !== "ADMIN") throw new Error("Forbidden");
}

function decimalFromInput(value: string, label: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error(`${label} must be a positive USD amount with up to 2 decimals.`);
  const decimal = new Prisma.Decimal(value);
  if (decimal.lte(0)) throw new Error(`${label} must be greater than 0.`);
  return decimal.toDecimalPlaces(2);
}

function optional(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function parseDate(value: string | undefined) {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  const date = new Date(`${cleaned}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Date of birth is invalid.");
  return date;
}

function normalizeOptionalCountry(value: string | undefined) {
  const code = normalizeCountryCode(value);
  if (!code) return null;
  if (!getCountry(code)) throw new Error("Country code must be a known ISO alpha-2 code.");
  return code;
}

async function findExistingImportLeadIdentities(rows: readonly ValidLeadImportRow[]) {
  const existingLeads: Array<{ email: string; phone: string }> = [];
  for (const batch of chunkLeadImportRows(rows, DEFAULT_IMPORT_BATCH_SIZE)) {
    const leads = await db.lead.findMany({
      where: { OR: [{ email: { in: batch.map((row) => row.email) } }, { phone: { in: batch.map((row) => row.phone) } }] },
      select: { email: true, phone: true },
    });
    existingLeads.push(...leads);
  }
  return existingLeads;
}

async function createLeadImportBatch(tx: Prisma.TransactionClient, rows: readonly ValidLeadImportRow[], createdByUserId: string) {
  const importedAt = new Date();
  const plans = rows.map((row) => ({ row, ...buildLeadImportCreatePlan(row, importedAt, createdByUserId) }));
  const createdLeads = await tx.lead.createManyAndReturn({
    data: plans.map((plan) => plan.lead),
    select: { id: true, email: true },
  });
  const leadIdsByEmail = new Map(createdLeads.map((lead) => [lead.email, lead.id]));
  const depositData = plans.flatMap((plan) => {
    if (!plan.deposit) return [];
    const leadId = leadIdsByEmail.get(plan.row.email);
    if (!leadId) throw new Error("Imported lead lookup failed.");
    return [{ leadId, ...plan.deposit }];
  });
  if (depositData.length) await tx.deposit.createMany({ data: depositData });
  return { leadCount: createdLeads.length, depositCount: depositData.length };
}


async function ensureAgent(agentId: string | null, role: "SALES_AGENT" | "RETENTION_AGENT") {
  if (!agentId) return null;
  const agent = await db.user.findFirst({ where: { id: agentId, role, active: true }, select: { id: true } });
  if (!agent) throw new Error(`Choose an active ${role === "SALES_AGENT" ? "Sales" : "Retention"} Agent.`);
  return agent.id;
}

export async function createOrUpdateUser(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  requireAdminUser(user);
  const parsed = userFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("User details need attention.", parsed.error.flatten().fieldErrors);
  const { userId, fullName, email, role } = parsed.data;
  const password = parsed.data.password?.trim() ?? "";

  if (!userId && !password) return fail("Password is required.", { password: ["Password is required."] });

  try {
    if (userId) {
      const existing = await db.user.findUnique({ where: { id: userId } });
      if (!existing) return fail("User not found.");
      const passwordHash = password ? await argon2.hash(password, { type: argon2.argon2id }) : undefined;
      await db.user.update({
        where: { id: userId },
        data: { fullName, role, ...(passwordHash ? { passwordHash } : {}) },
      });
      return ok("User updated.");
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await db.user.create({ data: { fullName, email, passwordHash, role } });
    return ok("User created.");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail("Email is already in use.", { email: ["Email is already in use."] });
    throw error;
  }
}

export async function deleteUser(user: AuthenticatedLeadUser, userId: string): Promise<ActionState> {
  requireAdminUser(user);
  if (user.id === userId) return fail("You cannot delete your own signed-in user.");
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!target) return fail("User not found.");
  if (target.role === "ADMIN") {
    const adminCount = await db.user.count({ where: { role: "ADMIN", active: true, id: { not: userId } } });
    if (adminCount === 0) return fail("Cannot delete the final remaining Admin account.");
  }
  try {
    await db.$transaction([
      db.lead.updateMany({ where: { assignedAgentId: userId }, data: { assignedAgentId: null } }),
      db.lead.updateMany({ where: { salesAgentId: userId }, data: { salesAgentId: null } }),
      db.lead.updateMany({ where: { retentionAgentId: userId }, data: { retentionAgentId: null } }),
      db.note.updateMany({ where: { createdByUserId: userId }, data: { createdByUserId: user.id } }),
      db.deposit.updateMany({ where: { createdByUserId: userId }, data: { createdByUserId: user.id } }),
      db.user.delete({ where: { id: userId } }),
    ]);
    return ok("User deleted. Assigned leads were unassigned and activity history was preserved.");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2025"].includes(error.code)) {
      return fail("User could not be deleted because related records changed. Refresh and try again.");
    }
    throw error;
  }
}

export async function updateSalesStatus(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  const parsed = salesStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Choose a valid Sales Status.", parsed.error.flatten().fieldErrors);
  const lead = await db.lead.findUnique({
    where: { id: parsed.data.leadId },
    select: { id: true, activeTeam: true, salesAgentId: true, retentionAgentId: true, firstNoteAt: true },
  });
  if (!lead || !canEditSalesStatus(user, lead)) return fail("Lead not found or not accessible.");

  const data: Prisma.LeadUpdateInput = { salesStatus: parsed.data.salesStatus };
  if (lead.activeTeam === "OPEN" && parsed.data.salesStatus !== "NEW") data.activeTeam = "SALES";
  if (user.role === "SALES_AGENT" && !lead.salesAgentId && parsed.data.salesStatus !== "NEW") data.salesAgent = { connect: { id: user.id } };

  await db.lead.update({ where: { id: lead.id }, data });
  return ok("Sales status updated.");
}

export async function updateRetentionStatus(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  const parsed = retentionStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Choose a valid Retention Status.", parsed.error.flatten().fieldErrors);
  const lead = await db.lead.findUnique({
    where: { id: parsed.data.leadId },
    select: { id: true, activeTeam: true, salesAgentId: true, retentionAgentId: true, firstNoteAt: true },
  });
  if (!lead || !canEditRetentionStatus(user, lead)) return fail("Lead not found or not accessible.");

  const now = new Date();
  const previousTeam = lead.activeTeam;
  const takeover = parsed.data.retentionStatus !== "NEW" && previousTeam !== "RETENTION";
  await db.$transaction(async (tx) => {
    const data: Prisma.LeadUpdateInput = { retentionStatus: parsed.data.retentionStatus };
    if (takeover) data.activeTeam = "RETENTION";
    if (user.role === "RETENTION_AGENT" && !lead.retentionAgentId && parsed.data.retentionStatus !== "NEW") data.retentionAgent = { connect: { id: user.id } };
    await tx.lead.update({ where: { id: lead.id }, data });

    if (takeover) {
      const actor = await tx.user.findUnique({ where: { id: user.id }, select: { fullName: true, role: true } });
      const roleLabel = actor?.role === "RETENTION_AGENT" ? "Retention Agent" : actor?.role === "SALES_AGENT" ? "Sales Agent" : "Admin";
      const body = `Lead taken over by ${actor?.fullName ?? "System"} (${roleLabel}). Previous active team: ${previousTeam}.`;
      await tx.note.create({ data: { leadId: lead.id, body, kind: "SYSTEM", createdAt: now } });
      await tx.lead.update({
        where: { id: lead.id },
        data: { firstNoteAt: lead.firstNoteAt ?? now, lastNoteAt: now },
      });
    }
  });
  return ok(takeover ? "Retention status updated. Lead moved to Retention." : "Retention status updated.");
}

export async function updateActiveTeam(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  if (!canUpdateActiveTeam(user)) throw new Error("Forbidden");
  const parsed = activeTeamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Choose a valid active team.", parsed.error.flatten().fieldErrors);
  await db.lead.update({ where: { id: parsed.data.leadId }, data: { activeTeam: parsed.data.activeTeam } });
  return ok("Active team updated.");
}

export async function updateSalesAssignment(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  if (!canAssignSalesAgent(user)) throw new Error("Forbidden");
  const parsed = salesAssignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Sales assignment details need attention.", parsed.error.flatten().fieldErrors);
  const salesAgentId = await ensureAgent(optional(parsed.data.salesAgentId), "SALES_AGENT");
  await db.lead.update({ where: { id: parsed.data.leadId }, data: { salesAgentId } });
  return ok(salesAgentId ? "Sales agent assigned." : "Sales agent unassigned.");
}

export async function updateRetentionAssignment(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  if (!canAssignRetentionAgent(user)) throw new Error("Forbidden");
  const parsed = retentionAssignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Retention assignment details need attention.", parsed.error.flatten().fieldErrors);
  const retentionAgentId = await ensureAgent(optional(parsed.data.retentionAgentId), "RETENTION_AGENT");
  await db.lead.update({ where: { id: parsed.data.leadId }, data: { retentionAgentId, assignedAgentId: retentionAgentId } });
  return ok(retentionAgentId ? "Retention agent assigned." : "Retention agent unassigned.");
}

export async function updateLeadProfile(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  requireAdminUser(user);
  const parsed = leadProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Lead profile needs attention.", parsed.error.flatten().fieldErrors);
  const data = parsed.data;
  const countryCode = normalizeOptionalCountry(data.countryCode);
  const totalBalance = decimalFromInput(data.totalBalance, "Total balance");
  await db.lead.update({
    where: { id: data.leadId },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      prefix: optional(data.prefix),
      countryCode,
      email: data.email,
      alternateEmail: optional(data.alternateEmail),
      phone: data.phone,
      alternatePhone: optional(data.alternatePhone),
      dateOfBirth: parseDate(data.dateOfBirth),
      gender: optional(data.gender),
      language: optional(data.language),
      timeZone: optional(data.timeZone),
      additionalInfo: optional(data.additionalInfo),
      totalBalance,
    },
  });
  return ok("Lead profile updated.");
}

export async function addDeposit(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  const parsed = depositSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Deposit details need attention.", parsed.error.flatten().fieldErrors);
  const amount = decimalFromInput(parsed.data.amount, "Deposit");
  const now = new Date();
  await db.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: parsed.data.leadId }, select: { id: true, totalBalance: true, firstDepositAt: true, activeTeam: true, salesAgentId: true, retentionAgentId: true } });
    if (!lead || !canAddDeposit(user, lead)) throw new Error("Lead not found or not accessible.");
    await tx.deposit.create({ data: { leadId: parsed.data.leadId, amount, createdByUserId: user.id, createdAt: now } });
    await tx.lead.update({
      where: { id: parsed.data.leadId },
      data: {
        totalBalance: lead.totalBalance.plus(amount),
        firstDepositAt: lead.firstDepositAt ?? now,
        lastDepositAt: now,
        ...(user.role === "SALES_AGENT" && !lead.salesAgentId ? { salesAgentId: user.id } : {}),
      },
    });
  });
  return ok("Deposit added.");
}

export async function deleteDeposit(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  if (!canDeleteDeposit(user)) return fail("Only Admins can delete deposits.");
  const parsed = deleteDepositSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Deposit details need attention.", parsed.error.flatten().fieldErrors);
  const now = new Date();

  try {
    return await db.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id: parsed.data.leadId },
        select: { id: true, firstNoteAt: true },
      });
      const deposit = await tx.deposit.findUnique({
        where: { id: parsed.data.depositId },
        select: { id: true, leadId: true, amount: true },
      });
      if (!lead || !depositBelongsToLead(deposit, parsed.data.leadId)) return fail("Deposit not found for this lead.");

      await tx.deposit.delete({ where: { id: deposit.id } });
      const remainingDeposits = await tx.deposit.findMany({
        where: { leadId: lead.id },
        select: { amount: true, createdAt: true },
      });
      const summary = calculateDepositSummary(remainingDeposits);
      const actor = await tx.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
      await tx.note.create({
        data: {
          leadId: lead.id,
          body: `Deposit of ${formatUsdAmount(deposit.amount)} deleted by ${actor?.fullName ?? "Administrator"}.`,
          kind: "SYSTEM",
          createdAt: now,
        },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          totalBalance: summary.totalBalance,
          firstDepositAt: summary.firstDepositAt,
          lastDepositAt: summary.lastDepositAt,
          firstNoteAt: lead.firstNoteAt ?? now,
          lastNoteAt: now,
        },
      });
      return ok("Deposit deleted. Lead balance recalculated.");
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return fail("Deposit was already deleted. Refresh and try again.");
    throw error;
  }
}

export async function addNote(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Note details need attention.", parsed.error.flatten().fieldErrors);
  const now = new Date();
  await db.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: parsed.data.leadId },
      select: { id: true, firstNoteAt: true, activeTeam: true, salesAgentId: true, retentionAgentId: true },
    });
    if (!lead || !canAddNote(user, lead)) throw new Error("Lead not found or not accessible.");
    await tx.note.create({ data: { leadId: lead.id, body: parsed.data.body, kind: "USER", isPinned: parsed.data.isPinned === "on", createdByUserId: user.id, createdAt: now } });
    await tx.lead.update({ where: { id: lead.id }, data: { firstNoteAt: lead.firstNoteAt ?? now, lastNoteAt: now } });
  });
  return ok("Note added.");
}

export async function toggleNotePin(user: AuthenticatedLeadUser, noteId: string): Promise<ActionState> {
  const note = await db.note.findFirst({
    where: { id: noteId },
    select: { id: true, kind: true, isPinned: true, lead: { select: { activeTeam: true, salesAgentId: true, retentionAgentId: true } } },
  });
  if (!note || note.kind === "SYSTEM" || !canToggleNotePin(user, note.lead)) return fail("Note not found or not accessible.");
  await db.note.update({ where: { id: note.id }, data: { isPinned: !note.isPinned } });
  return ok(note.isPinned ? "Note unpinned." : "Note pinned.");
}

export async function deletePinnedNote(user: AuthenticatedLeadUser, noteId: string): Promise<ActionState> {
  if (user.role !== "ADMIN") return fail("Only Admins can delete pinned notes.");
  const note = await db.note.findUnique({ where: { id: noteId }, select: { id: true, leadId: true, isPinned: true } });
  if (!note || !note.isPinned) return fail("Pinned note not found.");

  try {
    await db.$transaction(async (tx) => {
      await tx.note.delete({ where: { id: note.id } });
      const [firstNote, lastNote] = await Promise.all([
        tx.note.findFirst({ where: { leadId: note.leadId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { createdAt: true } }),
        tx.note.findFirst({ where: { leadId: note.leadId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true } }),
      ]);
      await tx.lead.update({
        where: { id: note.leadId },
        data: {
          firstNoteAt: firstNote?.createdAt ?? null,
          lastNoteAt: lastNote?.createdAt ?? null,
        },
      });
    });
    return ok("Pinned note deleted.");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return fail("Pinned note was already deleted. Refresh and try again.");
    throw error;
  }
}

export async function deleteLead(user: AuthenticatedLeadUser, leadId: string): Promise<ActionState> {
  requireAdminUser(user);
  await db.lead.delete({ where: { id: leadId } });
  return ok("Lead deleted.");
}

export async function bulkAssignLeads(user: AuthenticatedLeadUser, leadIds: string[], agentId: string): Promise<ActionState> {
  requireAdminUser(user);
  const assignedAgentId = await ensureAgent(agentId, "RETENTION_AGENT");
  if (!leadIds.length) return fail("Select at least one lead.");
  await db.lead.updateMany({ where: { id: { in: leadIds } }, data: { retentionAgentId: assignedAgentId, assignedAgentId } });
  return ok(`${leadIds.length} lead(s) assigned to Retention.`);
}

export async function bulkUnassignLeads(user: AuthenticatedLeadUser, leadIds: string[]): Promise<ActionState> {
  requireAdminUser(user);
  if (!leadIds.length) return fail("Select at least one lead.");
  await db.lead.updateMany({ where: { id: { in: leadIds } }, data: { retentionAgentId: null, assignedAgentId: null } });
  return ok(`${leadIds.length} lead(s) unassigned from Retention.`);
}

export async function bulkDeleteLeads(user: AuthenticatedLeadUser, leadIds: string[]): Promise<ActionState> {
  requireAdminUser(user);
  if (!leadIds.length) return fail("Select at least one lead.");
  await db.lead.deleteMany({ where: { id: { in: leadIds } } });
  return ok(`${leadIds.length} lead(s) deleted.`);
}

export async function distributeLeads(user: AuthenticatedLeadUser, leadIds: string[], agentIds: string[], statusScope?: RetentionStatus | "all"): Promise<ActionState> {
  requireAdminUser(user);
  if (!leadIds.length) return fail("Select at least one lead.");
  if (!agentIds.length) return fail("Select at least one Retention Agent.");
  const agents = await db.user.findMany({ where: { id: { in: agentIds }, role: "RETENTION_AGENT", active: true }, select: { id: true } });
  if (agents.length !== agentIds.length) return fail("One or more selected agents are unavailable.");

  const eligible = await db.lead.findMany({
    where: { id: { in: leadIds }, ...(statusScope && statusScope !== "all" ? { retentionStatus: statusScope } : {}) },
    select: { id: true },
  });
  if (!eligible.length) return fail("No selected leads match the chosen distribution scope.");

  const shuffled = [...eligible.map((lead) => lead.id)].sort(() => Math.random() - 0.5);
  await db.$transaction(shuffled.map((leadId, index) => db.lead.update({ where: { id: leadId }, data: { retentionAgentId: agents[index % agents.length].id, assignedAgentId: agents[index % agents.length].id } })));
  return ok(`${shuffled.length} lead(s) distributed equally.`);
}

export async function importLeadsFromExcel(user: AuthenticatedLeadUser, file: File): Promise<ActionState> {
  requireAdminUser(user);
  if (!file.name.match(/\.(xlsx|xls|csv)$/i)) return fail("Choose a .xlsx, .xls, or .csv file.");
  const importStartedAt = Date.now();
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = read(buffer, { type: "buffer", raw: false, cellText: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return fail("Excel file has no readable sheets.");
  const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!rows.length) return fail("Excel contains no valid rows.");
  console.info(`[import] parsed rows: ${rows.length}`);

  const { headers, missing, validRows, rejected, rejectedRows: validationRejectedRows } = validateLeadImportRows(rows);
  if (missing.length) return fail(`Missing required header(s): ${missing.join(", ")}.`);

  if (!validRows.length) {
    const report = buildLeadImportReport({
      headers,
      totalRows: rows.length,
      createdLeads: 0,
      createdDeposits: 0,
      duplicateRows: 0,
      failedRows: 0,
      rejectedRows: validationRejectedRows,
    });
    return { ...fail(`Import failed. 0 valid rows. ${rejected.slice(0, 5).join(" ")}`), importReport: report };
  }

  const existingLeads = await findExistingImportLeadIdentities(validRows);
  const duplicateResult = rejectExistingLeadDuplicates(validRows, existingLeads);
  rejected.push(...duplicateResult.rejected);
  const rejectedDetails: LeadImportRejectedRow[] = [...validationRejectedRows, ...duplicateResult.rejectedRows];

  if (!duplicateResult.creatableRows.length) {
    const report = buildLeadImportReport({
      headers,
      totalRows: rows.length,
      createdLeads: 0,
      createdDeposits: 0,
      duplicateRows: duplicateResult.duplicateRows,
      failedRows: 0,
      rejectedRows: rejectedDetails,
    });
    return { ...fail(`Import completed with 0 created; rejected rows: ${report.rejectedRows}; duplicate rows: ${report.duplicateRows}; failed rows: 0.`), importReport: report };
  }

  let createdLeads = 0;
  let createdDeposits = 0;
  let failedRows = 0;
  const batches = chunkLeadImportRows(duplicateResult.creatableRows, DEFAULT_IMPORT_BATCH_SIZE);

  for (const [index, batch] of batches.entries()) {
    const batchStartedAt = Date.now();
    try {
      const result = await db.$transaction((tx) => createLeadImportBatch(tx, batch, user.id));
      createdLeads += result.leadCount;
      createdDeposits += result.depositCount;
      console.info(`[import] batch ${index + 1}/${batches.length}: ${batch.length} rows, ${Date.now() - batchStartedAt}ms`);
    } catch {
      failedRows += batch.length;
      const firstRow = batch[0]?.rowNumber;
      const lastRow = batch[batch.length - 1]?.rowNumber;
      const batchFailures = batch.map((row) => rejectedImportRowFromValid(row, "Import batch failed. Please retry these rows"));
      rejectedDetails.push(...batchFailures);
      rejected.push(`Rows ${firstRow}-${lastRow}: import batch failed.`);
      console.warn(`[import] batch ${index + 1}/${batches.length}: ${batch.length} rows failed, ${Date.now() - batchStartedAt}ms`);
    }
  }

  const report = buildLeadImportReport({
    headers,
    totalRows: rows.length,
    createdLeads,
    createdDeposits,
    duplicateRows: duplicateResult.duplicateRows,
    failedRows,
    rejectedRows: rejectedDetails,
  });
  const summary = `Import completed. Total rows: ${rows.length}; created leads: ${createdLeads}; created deposits: ${createdDeposits}; rejected rows: ${report.rejectedRows}; duplicate rows: ${duplicateResult.duplicateRows}; failed rows: ${failedRows}.`;
  console.info(`[import] completed: ${rows.length} rows in ${((Date.now() - importStartedAt) / 1000).toFixed(1)}s`);

  if (!createdLeads) return { ...fail(`${summary} ${rejected.slice(0, 3).join(" ")}`.trim()), importReport: report };
  return { ...ok(`${summary} ${rejected.slice(0, 3).join(" ")}`.trim()), importReport: report };
}
