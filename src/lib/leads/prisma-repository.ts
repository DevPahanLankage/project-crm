import { Prisma, type LeadActiveTeam, type RetentionStatus, type SalesStatus } from "@prisma/client";
import { getCountry, getCountryCodesMatching } from "@/lib/countries";
import { db } from "@/lib/db";
import type { AuthenticatedLeadUser, CountryFilterOption, DepositItem, LeadDetail, LeadPageResult, LeadQuery, NoteItem, UserListItem } from "@/lib/leads/types";
import { canViewLead } from "@/lib/leads/permissions";
import { startPerf, timed } from "@/lib/perf";

function leadAccessSql(user: AuthenticatedLeadUser) {
  if (user.role === "ADMIN") return Prisma.empty;
  if (user.role === "SALES_AGENT") return Prisma.sql`l."salesAgentId" = ${user.id}`;
  return Prisma.sql`l."retentionAgentId" = ${user.id}`;
}

function like(term: string) {
  return `%${term}%`;
}

function nameSearchSql(term: string) {
  const tokens = term.split(/\s+/).filter(Boolean);
  if (!tokens.length) return Prisma.empty;
  return Prisma.sql`(${Prisma.join(tokens.map((token) => Prisma.sql`(l."firstName" ILIKE ${like(token)} OR l."lastName" ILIKE ${like(token)})`), " AND ")})`;
}

function dateSql(column: Prisma.Sql, from: Date | null, to: Date | null) {
  const conditions: Prisma.Sql[] = [];
  if (from) conditions.push(Prisma.sql`${column} >= ${from}`);
  if (to) conditions.push(Prisma.sql`${column} <= ${to}`);
  return conditions;
}

function listWhereSql(user: AuthenticatedLeadUser, query: LeadQuery, options: { includeCountry?: boolean; requireCountry?: boolean } = {}) {
  const { includeCountry = true, requireCountry = false } = options;
  const conditions: Prisma.Sql[] = [];
  const access = leadAccessSql(user);
  if (access !== Prisma.empty) conditions.push(access);

  if (query.search) {
    const countryCodes = getCountryCodesMatching(query.search);
    const searchConditions: Prisma.Sql[] = [Prisma.sql`l.id ILIKE ${like(query.search)}`];
    const nameCondition = nameSearchSql(query.search);
    if (nameCondition !== Prisma.empty) searchConditions.push(nameCondition);
    if (countryCodes.length) searchConditions.push(Prisma.sql`l."countryCode" IN (${Prisma.join(countryCodes)})`);
    conditions.push(Prisma.sql`(${Prisma.join(searchConditions, " OR ")})`);
  }

  if (query.leadId) conditions.push(Prisma.sql`l.id ILIKE ${like(query.leadId)}`);
  if (query.name) {
    const nameCondition = nameSearchSql(query.name);
    if (nameCondition !== Prisma.empty) conditions.push(nameCondition);
  }
  if (includeCountry && query.country.length) conditions.push(Prisma.sql`l."countryCode" IN (${Prisma.join(query.country)})`);
  if (query.salesStatus) conditions.push(Prisma.sql`l."salesStatus" = ${query.salesStatus}::"SalesStatus"`);
  if (query.retentionStatus) conditions.push(Prisma.sql`l."retentionStatus" = ${query.retentionStatus}::"RetentionStatus"`);
  if (query.activeTeam) conditions.push(Prisma.sql`l."activeTeam" = ${query.activeTeam}::"LeadActiveTeam"`);
  if (user.role === "ADMIN" && query.salesAgent) {
    conditions.push(query.salesAgent === "unassigned" ? Prisma.sql`l."salesAgentId" IS NULL` : Prisma.sql`l."salesAgentId" = ${query.salesAgent}`);
  }
  if (user.role === "ADMIN" && query.retentionAgent) {
    conditions.push(query.retentionAgent === "unassigned" ? Prisma.sql`l."retentionAgentId" IS NULL` : Prisma.sql`l."retentionAgentId" = ${query.retentionAgent}`);
  }

  conditions.push(...dateSql(Prisma.sql`l."createdAt"`, query.registrationFrom, query.registrationTo));
  conditions.push(...dateSql(Prisma.sql`l."firstDepositAt"`, query.ftdFrom, query.ftdTo));
  conditions.push(...dateSql(Prisma.sql`l."firstNoteAt"`, query.firstNoteFrom, query.firstNoteTo));
  conditions.push(...dateSql(Prisma.sql`l."lastNoteAt"`, query.lastNoteFrom, query.lastNoteTo));
  if (requireCountry) conditions.push(Prisma.sql`l."countryCode" IS NOT NULL`);

  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
}

function listOrderSql(query: LeadQuery) {
  const direction = query.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  if (query.sort === "client") return Prisma.sql`l."firstName" ${direction}, l."lastName" ${direction}, l.id ASC`;
  if (query.sort === "country") return Prisma.sql`l."countryCode" ${direction}, l.id ASC`;
  if (query.sort === "balance") return Prisma.sql`l."totalBalance" ${direction}, l.id ASC`;
  if (query.sort === "lastNote") return Prisma.sql`l."lastNoteAt" ${direction} NULLS LAST, l.id ASC`;
  if (query.sort === "salesStatus") return Prisma.sql`l."salesStatus" ${direction}, l.id ASC`;
  if (query.sort === "retentionStatus") return Prisma.sql`l."retentionStatus" ${direction}, l.id ASC`;
  if (query.sort === "activeTeam") return Prisma.sql`l."activeTeam" ${direction}, l.id ASC`;
  return Prisma.sql`l."createdAt" ${direction}, l.id ASC`;
}

function preview(body: string) {
  return body.length > 92 ? `${body.slice(0, 89)}...` : body;
}

function mapDeposit(deposit: { id: string; amount: Prisma.Decimal; createdAt: Date; createdBy: { id: string; fullName: string } }): DepositItem {
  return { id: deposit.id, amount: deposit.amount.toFixed(2), createdAt: deposit.createdAt, createdBy: deposit.createdBy };
}

function mapNote(note: { id: string; body: string; kind: "USER" | "SYSTEM"; isPinned: boolean; createdAt: Date; createdBy: { id: string; fullName: string; role: "ADMIN" | "SALES_AGENT" | "RETENTION_AGENT" } | null }): NoteItem {
  return { id: note.id, body: note.body, kind: note.kind, isPinned: note.isPinned, createdAt: note.createdAt, createdBy: note.createdBy };
}

type LeadListRow = {
  id: string;
  firstName: string;
  lastName: string;
  countryCode: string | null;
  totalBalance: string;
  salesStatus: SalesStatus;
  retentionStatus: RetentionStatus;
  activeTeam: LeadActiveTeam;
  salesAgentId: string | null;
  salesAgentFullName: string | null;
  retentionAgentId: string | null;
  retentionAgentFullName: string | null;
  createdAt: Date;
  firstNoteAt: Date | null;
  firstDepositAmount: string | null;
  firstDepositAt: Date | null;
  lastDepositAmount: string | null;
  lastDepositAt: Date | null;
  lastNoteAt: Date | null;
  lastNoteAuthor: string | null;
  lastNoteBody: string | null;
  totalCount: number | bigint;
};

type CountryCountRow = { countryCode: string | null; count: number | bigint };

function mapCountryOptions(rows: CountryCountRow[]): CountryFilterOption[] {
  return rows
    .map((row) => {
      const country = getCountry(row.countryCode);
      return country ? { code: country.code, name: country.name, count: Number(row.count) } : null;
    })
    .filter((option): option is CountryFilterOption => Boolean(option))
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
}

function leadRowsQuery(where: Prisma.Sql, orderBy: Prisma.Sql, limit: Prisma.Sql) {
  return db.$queryRaw<LeadListRow[]>`
    SELECT
      l.id,
      l."firstName",
      l."lastName",
      l."countryCode",
      l."totalBalance"::text AS "totalBalance",
      l."salesStatus",
      l."retentionStatus",
      l."activeTeam",
      l."salesAgentId",
      sales_agent."fullName" AS "salesAgentFullName",
      l."retentionAgentId",
      retention_agent."fullName" AS "retentionAgentFullName",
      l."createdAt",
      l."firstNoteAt",
      first_deposit.amount::text AS "firstDepositAmount",
      first_deposit."createdAt" AS "firstDepositAt",
      last_deposit.amount::text AS "lastDepositAmount",
      last_deposit."createdAt" AS "lastDepositAt",
      last_note."createdAt" AS "lastNoteAt",
      note_author."fullName" AS "lastNoteAuthor",
      last_note.body AS "lastNoteBody",
      COUNT(*) OVER()::int AS "totalCount"
    FROM "Lead" l
    LEFT JOIN "User" sales_agent ON sales_agent.id = l."salesAgentId"
    LEFT JOIN "User" retention_agent ON retention_agent.id = l."retentionAgentId"
    LEFT JOIN LATERAL (
      SELECT amount, "createdAt"
      FROM "Deposit"
      WHERE "leadId" = l.id
      ORDER BY "createdAt" ASC
      LIMIT 1
    ) first_deposit ON TRUE
    LEFT JOIN LATERAL (
      SELECT amount, "createdAt"
      FROM "Deposit"
      WHERE "leadId" = l.id
      ORDER BY "createdAt" DESC
      LIMIT 1
    ) last_deposit ON TRUE
    LEFT JOIN LATERAL (
      SELECT body, "createdAt", "createdByUserId"
      FROM "Note"
      WHERE "leadId" = l.id
      ORDER BY "createdAt" DESC, id DESC
      LIMIT 1
    ) last_note ON TRUE
    LEFT JOIN "User" note_author ON note_author.id = last_note."createdByUserId"
    ${where}
    ORDER BY ${orderBy}
    ${limit}
  `;
}

async function listAgents(role: "SALES_AGENT" | "RETENTION_AGENT") {
  return db.user.findMany({
    where: { role, active: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });
}

export async function listPrismaLeads(user: AuthenticatedLeadUser, query: LeadQuery): Promise<LeadPageResult> {
  const endRepository = startPerf("leads repository total");
  const where = listWhereSql(user, query);
  const orderBy = listOrderSql(query);
  const requestedPage = query.pageSize === "all" ? 1 : query.page;
  const limit = query.pageSize === "all" ? Prisma.empty : Prisma.sql`LIMIT ${query.pageSize} OFFSET ${(requestedPage - 1) * query.pageSize}`;

  const salesAgentsPromise = user.role === "ADMIN" ? timed("leads sales agents query", () => listAgents("SALES_AGENT")) : Promise.resolve([]);
  const retentionAgentsPromise = user.role === "ADMIN" ? timed("leads retention agents query", () => listAgents("RETENTION_AGENT")) : Promise.resolve([]);
  const countryOptionsPromise = timed("lead country counts", () => db.$queryRaw<CountryCountRow[]>`
    SELECT l."countryCode", COUNT(*)::int AS count
    FROM "Lead" l
    ${listWhereSql(user, query, { includeCountry: false, requireCountry: true })}
    GROUP BY l."countryCode"
    ORDER BY l."countryCode" ASC
  `).then(mapCountryOptions);
  const rowsPromise = timed("leads query", () => leadRowsQuery(where, orderBy, limit));

  const [salesAgents, retentionAgents, countryOptions, initialRows] = await Promise.all([salesAgentsPromise, retentionAgentsPromise, countryOptionsPromise, rowsPromise]);
  const initialTotal = Number(initialRows[0]?.totalCount ?? 0);
  const total = initialRows.length || requestedPage === 1 ? initialTotal : Number((await timed("leads fallback count", () => db.$queryRaw<Array<{ total: number | bigint }>>`SELECT COUNT(*)::int AS total FROM "Lead" l ${where}`))[0]?.total ?? 0);
  const totalPages = query.pageSize === "all" ? 1 : Math.max(1, Math.ceil(total / query.pageSize));
  const page = query.pageSize === "all" ? 1 : Math.min(query.page, totalPages);
  const correctedLimit = Prisma.sql`LIMIT ${query.pageSize === "all" ? total : query.pageSize} OFFSET ${(page - 1) * (query.pageSize === "all" ? total : query.pageSize)}`;
  const rows = page === requestedPage ? initialRows : await timed("leads corrected page query", () => leadRowsQuery(where, orderBy, correctedLimit));

  const result = {
    total,
    page,
    salesAgents,
    retentionAgents,
    countryOptions,
    items: rows.map((lead) => ({
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      countryCode: lead.countryCode,
      totalBalance: lead.totalBalance,
      salesStatus: lead.salesStatus,
      retentionStatus: lead.retentionStatus,
      activeTeam: lead.activeTeam,
      salesAgent: lead.salesAgentId && lead.salesAgentFullName ? { id: lead.salesAgentId, fullName: lead.salesAgentFullName } : null,
      retentionAgent: lead.retentionAgentId && lead.retentionAgentFullName ? { id: lead.retentionAgentId, fullName: lead.retentionAgentFullName } : null,
      createdAt: lead.createdAt,
      firstDeposit: lead.firstDepositAmount && lead.firstDepositAt ? { amount: lead.firstDepositAmount, at: lead.firstDepositAt } : null,
      lastDeposit: lead.lastDepositAmount && lead.lastDepositAt ? { amount: lead.lastDepositAmount, at: lead.lastDepositAt } : null,
      firstNoteAt: lead.firstNoteAt,
      lastNote: lead.lastNoteAt ? { at: lead.lastNoteAt, author: lead.lastNoteAuthor, preview: lead.lastNoteBody ? preview(lead.lastNoteBody) : null } : null,
    })),
  };
  endRepository();
  return result;
}

export async function getAuthorizedLeadDetail(user: AuthenticatedLeadUser, leadId: string): Promise<LeadDetail | null> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      alternateEmail: true,
      phone: true,
      alternatePhone: true,
      countryCode: true,
      prefix: true,
      dateOfBirth: true,
      gender: true,
      language: true,
      timeZone: true,
      additionalInfo: true,
      affiliate: true,
      accountStatus: true,
      salesStatus: true,
      retentionStatus: true,
      activeTeam: true,
      salesAgentId: true,
      retentionAgentId: true,
      salesAgent: { select: { id: true, fullName: true } },
      retentionAgent: { select: { id: true, fullName: true } },
      totalBalance: true,
      createdAt: true,
      updatedAt: true,
      deposits: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, amount: true, createdAt: true, createdBy: { select: { id: true, fullName: true } } },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        select: { id: true, body: true, kind: true, isPinned: true, createdAt: true, createdBy: { select: { id: true, fullName: true, role: true } } },
      },
    },
  });
  if (!lead || !canViewLead(user, lead)) return null;
  const deposits = lead.deposits.map(mapDeposit);
  const notes = lead.notes.map(mapNote);
  return {
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    alternateEmail: lead.alternateEmail,
    phone: lead.phone,
    alternatePhone: lead.alternatePhone,
    countryCode: lead.countryCode,
    prefix: lead.prefix,
    dateOfBirth: lead.dateOfBirth,
    gender: lead.gender,
    language: lead.language,
    timeZone: lead.timeZone,
    additionalInfo: lead.additionalInfo,
    affiliate: lead.affiliate,
    accountStatus: lead.accountStatus,
    salesStatus: lead.salesStatus,
    retentionStatus: lead.retentionStatus,
    activeTeam: lead.activeTeam,
    salesAgent: lead.salesAgent,
    retentionAgent: lead.retentionAgent,
    totalBalance: lead.totalBalance.toFixed(2),
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    firstDeposit: deposits.at(-1) ?? null,
    lastDeposit: deposits[0] ?? null,
    deposits,
    notes,
    pinnedNotes: notes.filter((note) => note.isPinned),
  };
}

export async function listActiveSalesAgents() {
  return listAgents("SALES_AGENT");
}

export async function listActiveRetentionAgents() {
  return listAgents("RETENTION_AGENT");
}

export async function listUsersForAdmin(): Promise<UserListItem[]> {
  const users = await timed("settings users query", () =>
    db.user.findMany({
      orderBy: [{ active: "desc" }, { fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        _count: { select: { assignedSalesLeads: true, assignedRetentionLeads: true } },
      },
    }),
  );
  return users.map((user) => ({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    active: user.active,
    assignedSalesLeadCount: user._count.assignedSalesLeads,
    assignedRetentionLeadCount: user._count.assignedRetentionLeads,
    createdAt: user.createdAt,
  }));
}
