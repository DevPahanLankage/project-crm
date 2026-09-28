import { Prisma } from "@prisma/client";
import { getCountry, getCountryCodesMatching } from "@/lib/countries";
import { db } from "@/lib/db";
import type { AuthenticatedLeadUser, CountryFilterOption, DepositItem, LeadDetail, LeadListItem, LeadPageResult, LeadQuery, NoteItem, UserListItem } from "@/lib/leads/types";

function leadAccessWhere(user: AuthenticatedLeadUser, leadId?: string): Prisma.LeadWhereInput {
  return {
    ...(leadId ? { id: leadId } : {}),
    ...(user.role === "RETENTION_AGENT" ? { assignedAgentId: user.id } : {}),
  };
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

  if (user.role === "RETENTION_AGENT") conditions.push(Prisma.sql`l."assignedAgentId" = ${user.id}`);

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
  if (includeCountry && query.country.length) {
    conditions.push(Prisma.sql`l."countryCode" IN (${Prisma.join(query.country)})`);
  }
  if (query.status) conditions.push(Prisma.sql`l."retentionStatus" = ${query.status}::"RetentionStatus"`);
  if (user.role === "ADMIN" && query.agent) {
    conditions.push(query.agent === "unassigned" ? Prisma.sql`l."assignedAgentId" IS NULL` : Prisma.sql`l."assignedAgentId" = ${query.agent}`);
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
  if (query.sort === "retentionStatus") return Prisma.sql`l."retentionStatus" ${direction}, l.id ASC`;
  return Prisma.sql`l."createdAt" ${direction}, l.id ASC`;
}
function preview(body: string) {
  return body.length > 92 ? `${body.slice(0, 89)}...` : body;
}

function mapDeposit(deposit: { id: string; amount: Prisma.Decimal; createdAt: Date; createdBy: { id: string; fullName: string } }): DepositItem {
  return {
    id: deposit.id,
    amount: deposit.amount.toFixed(2),
    createdAt: deposit.createdAt,
    createdBy: deposit.createdBy,
  };
}

function mapNote(note: { id: string; body: string; isPinned: boolean; createdAt: Date; createdBy: { id: string; fullName: string; role: "ADMIN" | "RETENTION_AGENT" } }): NoteItem {
  return {
    id: note.id,
    body: note.body,
    isPinned: note.isPinned,
    createdAt: note.createdAt,
    createdBy: note.createdBy,
  };
}

type LeadListRow = {
  id: string;
  firstName: string;
  lastName: string;
  countryCode: string | null;
  totalBalance: string;
  retentionStatus: LeadListItem["retentionStatus"];
  assignedAgentId: string | null;
  assignedAgentFullName: string | null;
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

type CountryCountRow = {
  countryCode: string | null;
  count: number | bigint;
};

function mapCountryOptions(rows: CountryCountRow[]): CountryFilterOption[] {
  return rows
    .map((row) => {
      const country = getCountry(row.countryCode);
      return country ? { code: country.code, name: country.name, count: Number(row.count) } : null;
    })
    .filter((option): option is CountryFilterOption => Boolean(option))
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
}

export async function listPrismaLeads(user: AuthenticatedLeadUser, query: LeadQuery): Promise<LeadPageResult> {
  const where = listWhereSql(user, query);
  const orderBy = listOrderSql(query);
  const requestedPage = query.pageSize === "all" ? 1 : query.page;
  const limit = query.pageSize === "all" ? Prisma.empty : Prisma.sql`LIMIT ${query.pageSize} OFFSET ${(requestedPage - 1) * query.pageSize}`;

  const agentsPromise = user.role === "ADMIN" ? db.user.findMany({
    where: { role: "RETENTION_AGENT", active: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  }) : Promise.resolve([]);

  const countryOptionsPromise = db.$queryRaw<CountryCountRow[]>`
    SELECT l."countryCode", COUNT(*)::int AS count
    FROM "Lead" l
    ${listWhereSql(user, query, { includeCountry: false, requireCountry: true })}
    GROUP BY l."countryCode"
    ORDER BY l."countryCode" ASC
  `.then(mapCountryOptions);

  const rowsPromise = db.$queryRaw<LeadListRow[]>`
    SELECT
      l.id,
      l."firstName",
      l."lastName",
      l."countryCode",
      l."totalBalance"::text AS "totalBalance",
      l."retentionStatus",
      l."assignedAgentId",
      agent."fullName" AS "assignedAgentFullName",
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
    LEFT JOIN "User" agent ON agent.id = l."assignedAgentId"
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

  const [agents, countryOptions, initialRows] = await Promise.all([agentsPromise, countryOptionsPromise, rowsPromise]);
  const initialTotal = Number(initialRows[0]?.totalCount ?? 0);
  const total = initialRows.length || requestedPage === 1 ? initialTotal : Number((await db.$queryRaw<Array<{ total: number | bigint }>>`SELECT COUNT(*)::int AS total FROM "Lead" l ${where}`)[0]?.total ?? 0);
  const totalPages = query.pageSize === "all" ? 1 : Math.max(1, Math.ceil(total / query.pageSize));
  const page = query.pageSize === "all" ? 1 : Math.min(query.page, totalPages);
  const rows = page === requestedPage ? initialRows : await db.$queryRaw<LeadListRow[]>`
    SELECT
      l.id,
      l."firstName",
      l."lastName",
      l."countryCode",
      l."totalBalance"::text AS "totalBalance",
      l."retentionStatus",
      l."assignedAgentId",
      agent."fullName" AS "assignedAgentFullName",
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
    LEFT JOIN "User" agent ON agent.id = l."assignedAgentId"
    LEFT JOIN LATERAL (SELECT amount, "createdAt" FROM "Deposit" WHERE "leadId" = l.id ORDER BY "createdAt" ASC LIMIT 1) first_deposit ON TRUE
    LEFT JOIN LATERAL (SELECT amount, "createdAt" FROM "Deposit" WHERE "leadId" = l.id ORDER BY "createdAt" DESC LIMIT 1) last_deposit ON TRUE
    LEFT JOIN LATERAL (SELECT body, "createdAt", "createdByUserId" FROM "Note" WHERE "leadId" = l.id ORDER BY "createdAt" DESC, id DESC LIMIT 1) last_note ON TRUE
    LEFT JOIN "User" note_author ON note_author.id = last_note."createdByUserId"
    ${where}
    ORDER BY ${orderBy}
    LIMIT ${query.pageSize === "all" ? total : query.pageSize} OFFSET ${(page - 1) * (query.pageSize === "all" ? total : query.pageSize)}
  `;

  return {
    total,
    page,
    agents,
    countryOptions,
    items: rows.map((lead) => ({
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      countryCode: lead.countryCode,
      totalBalance: lead.totalBalance,
      retentionStatus: lead.retentionStatus,
      assignedAgent: lead.assignedAgentId && lead.assignedAgentFullName ? { id: lead.assignedAgentId, fullName: lead.assignedAgentFullName } : null,
      createdAt: lead.createdAt,
      firstDeposit: lead.firstDepositAmount && lead.firstDepositAt ? { amount: lead.firstDepositAmount, at: lead.firstDepositAt } : null,
      lastDeposit: lead.lastDepositAmount && lead.lastDepositAt ? { amount: lead.lastDepositAmount, at: lead.lastDepositAt } : null,
      firstNoteAt: lead.firstNoteAt,
      lastNote: lead.lastNoteAt ? { at: lead.lastNoteAt, author: lead.lastNoteAuthor, preview: lead.lastNoteBody ? preview(lead.lastNoteBody) : null } : null,
    })),
  };
}
export async function getAuthorizedLeadDetail(user: AuthenticatedLeadUser, leadId: string): Promise<LeadDetail | null> {
  const lead = await db.lead.findFirst({
    where: leadAccessWhere(user, leadId),
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
      retentionStatus: true,
      assignedAgent: { select: { id: true, fullName: true } },
      totalBalance: true,
      createdAt: true,
      updatedAt: true,
      deposits: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, amount: true, createdAt: true, createdBy: { select: { id: true, fullName: true } } },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        select: { id: true, body: true, isPinned: true, createdAt: true, createdBy: { select: { id: true, fullName: true, role: true } } },
      },
    },
  });
  if (!lead) return null;
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
    retentionStatus: lead.retentionStatus,
    assignedAgent: lead.assignedAgent,
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

export async function listActiveRetentionAgents() {
  return db.user.findMany({
    where: { role: "RETENTION_AGENT", active: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });
}

export async function listUsersForAdmin(): Promise<UserListItem[]> {
  const users = await db.user.findMany({
    orderBy: [{ active: "desc" }, { fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      _count: { select: { assignedLeads: true } },
    },
  });
  return users.map((user) => ({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    active: user.active,
    assignedLeadCount: user._count.assignedLeads,
    createdAt: user.createdAt,
  }));
}
