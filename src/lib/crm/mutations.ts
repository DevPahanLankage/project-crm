import "server-only";

import argon2 from "argon2";
import { Prisma, RetentionStatus } from "@prisma/client";
import { z } from "zod";
import { read, utils } from "xlsx";
import { getCountry, normalizeCountryCode } from "@/lib/countries";
import { db } from "@/lib/db";
import { RETENTION_STATUSES, type ActionState, type AuthenticatedLeadUser } from "@/lib/leads/types";

const ok = (message: string): ActionState => ({ ok: true, message });
const fail = (message: string, errors?: Record<string, string[]>): ActionState => ({ ok: false, message, errors });

const userFormSchema = z.object({
  userId: z.string().optional(),
  fullName: z.string().trim().min(1, "Full name is required.").max(120),
  email: z.string().trim().email("Enter a valid email.").transform((value) => value.toLowerCase()),
  password: z.string().max(256).optional(),
  role: z.enum(["ADMIN", "RETENTION_AGENT"]),
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

const statusSchema = z.object({ leadId: z.string().min(1), retentionStatus: z.enum(RETENTION_STATUSES as [RetentionStatus, ...RetentionStatus[]]) });
const assignmentSchema = z.object({ leadId: z.string().min(1), assignedAgentId: z.string().optional() });
const noteSchema = z.object({ leadId: z.string().min(1), body: z.string().trim().min(1).max(5000), isPinned: z.string().optional() });
const depositSchema = z.object({ leadId: z.string().min(1), amount: z.string().trim().min(1) });

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


async function ensureAgent(agentId: string | null) {
  if (!agentId) return null;
  const agent = await db.user.findFirst({ where: { id: agentId, role: "RETENTION_AGENT", active: true }, select: { id: true } });
  if (!agent) throw new Error("Choose an active Retention Agent.");
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

export async function updateLeadStatus(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Choose a valid Retention Status.", parsed.error.flatten().fieldErrors);
  const result = await db.lead.updateMany({
    where: { id: parsed.data.leadId, ...(user.role === "RETENTION_AGENT" ? { assignedAgentId: user.id } : {}) },
    data: { retentionStatus: parsed.data.retentionStatus },
  });
  if (result.count === 0) return fail("Lead not found or not accessible.");
  return ok("Status updated.");
}

export async function updateLeadAssignment(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  requireAdminUser(user);
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Assignment details need attention.", parsed.error.flatten().fieldErrors);
  const assignedAgentId = await ensureAgent(optional(parsed.data.assignedAgentId));
  await db.lead.update({ where: { id: parsed.data.leadId }, data: { assignedAgentId } });
  return ok(assignedAgentId ? "Lead assigned." : "Lead unassigned.");
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
  requireAdminUser(user);
  const parsed = depositSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Deposit details need attention.", parsed.error.flatten().fieldErrors);
  const amount = decimalFromInput(parsed.data.amount, "Deposit");
  const now = new Date();
  await db.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: parsed.data.leadId }, select: { totalBalance: true, firstDepositAt: true } });
    if (!lead) throw new Error("Lead not found.");
    await tx.deposit.create({ data: { leadId: parsed.data.leadId, amount, createdByUserId: user.id, createdAt: now } });
    await tx.lead.update({
      where: { id: parsed.data.leadId },
      data: {
        totalBalance: lead.totalBalance.plus(amount),
        firstDepositAt: lead.firstDepositAt ?? now,
        lastDepositAt: now,
      },
    });
  });
  return ok("Deposit added.");
}

export async function addNote(user: AuthenticatedLeadUser, formData: FormData): Promise<ActionState> {
  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Note details need attention.", parsed.error.flatten().fieldErrors);
  const now = new Date();
  await db.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({
      where: { id: parsed.data.leadId, ...(user.role === "RETENTION_AGENT" ? { assignedAgentId: user.id } : {}) },
      select: { id: true, firstNoteAt: true },
    });
    if (!lead) throw new Error("Lead not found or not accessible.");
    await tx.note.create({ data: { leadId: lead.id, body: parsed.data.body, isPinned: parsed.data.isPinned === "on", createdByUserId: user.id, createdAt: now } });
    await tx.lead.update({ where: { id: lead.id }, data: { firstNoteAt: lead.firstNoteAt ?? now, lastNoteAt: now } });
  });
  return ok("Note added.");
}

export async function toggleNotePin(user: AuthenticatedLeadUser, noteId: string): Promise<ActionState> {
  const note = await db.note.findFirst({
    where: { id: noteId, ...(user.role === "RETENTION_AGENT" ? { lead: { assignedAgentId: user.id } } : {}) },
    select: { id: true, isPinned: true },
  });
  if (!note) return fail("Note not found or not accessible.");
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
  const assignedAgentId = await ensureAgent(agentId);
  if (!leadIds.length) return fail("Select at least one lead.");
  await db.lead.updateMany({ where: { id: { in: leadIds } }, data: { assignedAgentId } });
  return ok(`${leadIds.length} lead(s) assigned.`);
}

export async function bulkUnassignLeads(user: AuthenticatedLeadUser, leadIds: string[]): Promise<ActionState> {
  requireAdminUser(user);
  if (!leadIds.length) return fail("Select at least one lead.");
  await db.lead.updateMany({ where: { id: { in: leadIds } }, data: { assignedAgentId: null } });
  return ok(`${leadIds.length} lead(s) unassigned.`);
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
  await db.$transaction(shuffled.map((leadId, index) => db.lead.update({ where: { id: leadId }, data: { assignedAgentId: agents[index % agents.length].id } })));
  return ok(`${shuffled.length} lead(s) distributed equally.`);
}

type ImportRow = Record<string, unknown>;

function readString(row: ImportRow, header: string) {
  const value = row[header];
  return value == null ? "" : String(value).trim();
}

function affiliateFromFileName(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "").trim();
}

export async function importLeadsFromExcel(user: AuthenticatedLeadUser, file: File): Promise<ActionState> {
  requireAdminUser(user);
  if (!file.name.match(/\.(xlsx|xls|csv)$/i)) return fail("Choose a .xlsx, .xls, or .csv file.");
  const affiliate = affiliateFromFileName(file.name);
  if (!affiliate) return fail("Uploaded file name must include an affiliate/source name.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = read(buffer, { type: "buffer", raw: false, cellText: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return fail("Excel file has no readable sheets.");
  const rows = utils.sheet_to_json<ImportRow>(sheet, { defval: "" });
  if (!rows.length) return fail("Excel contains no valid rows.");

  const required = ["First Name", "Last Name", "Email", "Phone", "Country"];
  const headers = Object.keys(rows[0] ?? {});
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) return fail(`Missing required header(s): ${missing.join(", ")}.`);

  const validRows: Array<{ firstName: string; lastName: string; email: string; phone: string; countryCode: string | null; affiliate: string }> = [];
  const rejected: string[] = [];
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const firstName = readString(row, "First Name");
    const lastName = readString(row, "Last Name");
    const email = readString(row, "Email").toLowerCase();
    const phone = readString(row, "Phone");
    const countryCode = normalizeCountryCode(readString(row, "Country"));
    if (!firstName || !lastName || !email || !phone) {
      rejected.push(`Row ${rowNumber}: missing required field.`);
      return;
    }
    if (!z.string().email().safeParse(email).success) {
      rejected.push(`Row ${rowNumber}: invalid email.`);
      return;
    }
    if (!/^\+?[0-9 ()-]{5,32}$/.test(phone)) {
      rejected.push(`Row ${rowNumber}: invalid phone.`);
      return;
    }
    if (countryCode && !getCountry(countryCode)) {
      rejected.push(`Row ${rowNumber}: invalid country code.`);
      return;
    }
    if (seenEmails.has(email) || seenPhones.has(phone)) {
      rejected.push(`Row ${rowNumber}: duplicate email or phone in file.`);
      return;
    }
    seenEmails.add(email);
    seenPhones.add(phone);
    validRows.push({ firstName, lastName, email, phone, countryCode, affiliate });
  });

  if (!validRows.length) return fail(`Import failed. 0 valid rows. ${rejected.slice(0, 5).join(" ")}`);

  const duplicates = await db.lead.findMany({
    where: { OR: [{ email: { in: validRows.map((row) => row.email) } }, { phone: { in: validRows.map((row) => row.phone) } }] },
    select: { email: true, phone: true },
  });
  const duplicateEmails = new Set(duplicates.map((lead) => lead.email));
  const duplicatePhones = new Set(duplicates.map((lead) => lead.phone));
  const creatable = validRows.filter((row, index) => {
    const duplicate = duplicateEmails.has(row.email) || duplicatePhones.has(row.phone);
    if (duplicate) rejected.push(`Row ${index + 2}: duplicate email or phone already exists.`);
    return !duplicate;
  });

  if (!creatable.length) return fail(`Import completed with 0 created and ${rejected.length} rejected rows.`);
  await db.lead.createMany({ data: creatable });
  return ok(`Import completed. Created ${creatable.length}; rejected ${rejected.length}. ${rejected.slice(0, 3).join(" ")}`.trim());
}
