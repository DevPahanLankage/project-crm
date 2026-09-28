import { getCountry, getCountryCodesMatching } from "@/lib/countries";
import type { AgentOption, AuthenticatedLeadUser, CountryFilterOption, LeadListItem, LeadPageResult, LeadQuery } from "@/lib/leads/types";

const MOCK_AGENTS: AgentOption[] = [
  { id: "dev-agent", fullName: "Retention Agent" },
  { id: "dev-agent-orbit", fullName: "Morgan Orbit" },
  { id: "dev-agent-quartz", fullName: "Riley Quartz" },
];
const MOCK_SALES_AGENTS: AgentOption[] = [
  { id: "dev-sales", fullName: "Sales Agent" },
  { id: "dev-sales-nova", fullName: "Nova Sales" },
];

const FIRST_NAMES = ["Avery", "Briar", "Cato", "Della", "Elio", "Fable", "Galen", "Hera", "Indie", "Juno", "Kestrel", "Lumi", "Miro", "Nova"];
const LAST_NAMES = ["Quill", "North", "Vale", "Ember", "Rune", "Morrow", "Lark", "Pine", "Solace", "Vesper", "Cinder"];
const COUNTRY_CODES = ["CA", "RO", "PT", "GB", "AU", "DE", "ES", "FR", "IE", "IT", "NL", "PL", "US", "ZA"];
const STATUSES = ["NEW", "NO_ANSWER", "NO_INTEREST", "POTENTIAL_LOW", "ACTIVE", "ACTIVE_VIP", "DEPOSITED"] as const;
const SALES_STATUSES = ["NEW", "CONTACTED", "NO_ANSWER", "INTERESTED", "PAYMENT_PENDING", "CONVERTED", "NO_INTEREST"] as const;
const NOTE_PREVIEWS = ["Requested a callback next week.", "Prefers communication by email.", "Reviewed account information.", "Follow-up window confirmed."];

type MockLead = LeadListItem & { balanceCents: number };

function mockAgent(index: number) {
  if (index % 5 === 0) return null;
  if (index % 2 === 0) return MOCK_AGENTS[0];
  return MOCK_AGENTS[(index % 4 === 1) ? 1 : 2];
}

function mockSalesAgent(index: number) {
  if (index % 6 !== 0) return null;
  return MOCK_SALES_AGENTS[index % MOCK_SALES_AGENTS.length];
}

function createMockLeads(): MockLead[] {
  return Array.from({ length: 112 }, (_, offset) => {
    const index = offset + 1;
    const createdAt = new Date(Date.UTC(2025 + (index % 2), index % 12, (index % 27) + 1, 8 + (index % 9), (index * 7) % 60));
    const firstDepositAt = index % 3 === 0 ? new Date(createdAt.getTime() + (index % 12 + 1) * 86_400_000) : null;
    const firstNoteAt = index % 4 !== 0 ? new Date(createdAt.getTime() + (index % 8 + 1) * 43_200_000) : null;
    const lastNoteAt = firstNoteAt ? new Date(firstNoteAt.getTime() + (index % 15) * 86_400_000) : null;
    const balanceCents = (index * 137_53) % 2_500_000;
    const firstDepositCents = firstDepositAt ? 10_000 + (index % 9) * 5_000 : 0;
    const lastDepositAt = firstDepositAt && index % 2 === 0 ? new Date(firstDepositAt.getTime() + (index % 20 + 2) * 86_400_000) : firstDepositAt;
    const lastDepositCents = firstDepositAt ? firstDepositCents + (index % 5) * 2_500 : 0;

    const retentionAgent = mockAgent(index);
    const salesStatus = SALES_STATUSES[index % SALES_STATUSES.length];
    const retentionStatus = STATUSES[offset % STATUSES.length];
    const salesAgent = mockSalesAgent(index);
    const activeTeam = retentionAgent || retentionStatus !== "NEW" ? "RETENTION" : salesStatus !== "NEW" ? "SALES" : "OPEN";
    return {
      id: `cmock${String(index).padStart(5, "0")}fictional`,
      firstName: FIRST_NAMES[offset % FIRST_NAMES.length],
      lastName: LAST_NAMES[(offset * 3) % LAST_NAMES.length],
      countryCode: COUNTRY_CODES[(offset * 5) % COUNTRY_CODES.length],
      balanceCents,
      totalBalance: (balanceCents / 100).toFixed(2),
      salesStatus,
      retentionStatus,
      activeTeam,
      salesAgent,
      retentionAgent,
      createdAt,
      firstDeposit: firstDepositAt ? { amount: (firstDepositCents / 100).toFixed(2), at: firstDepositAt } : null,
      lastDeposit: lastDepositAt ? { amount: (lastDepositCents / 100).toFixed(2), at: lastDepositAt } : null,
      firstNoteAt,
      lastNote: lastNoteAt ? { at: lastNoteAt, author: retentionAgent?.fullName ?? salesAgent?.fullName ?? "Administrator", preview: NOTE_PREVIEWS[index % NOTE_PREVIEWS.length] } : null,
    };
  });
}

const MOCK_LEADS = createMockLeads();

function includes(value: string, term: string) {
  return value.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

function inDateRange(date: Date | null, from: Date | null, to: Date | null) {
  if (!from && !to) return true;
  if (!date) return false;
  return (!from || date >= from) && (!to || date <= to);
}

function compare(a: MockLead, b: MockLead, query: LeadQuery) {
  let result = 0;
  if (query.sort === "client") result = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
  if (query.sort === "country") result = (a.countryCode ?? "").localeCompare(b.countryCode ?? "");
  if (query.sort === "balance") result = a.balanceCents - b.balanceCents;
  if (query.sort === "registration") result = a.createdAt.getTime() - b.createdAt.getTime();
  if (query.sort === "lastNote") result = (a.lastNote?.at.getTime() ?? 0) - (b.lastNote?.at.getTime() ?? 0);
  if (query.sort === "salesStatus") result = a.salesStatus.localeCompare(b.salesStatus);
  if (query.sort === "retentionStatus") result = a.retentionStatus.localeCompare(b.retentionStatus);
  if (query.sort === "activeTeam") result = a.activeTeam.localeCompare(b.activeTeam);
  return (query.direction === "asc" ? result : -result) || a.id.localeCompare(b.id);
}

function countryOptions(rows: MockLead[]): CountryFilterOption[] {
  const counts = new Map<string, number>();
  rows.forEach((lead) => {
    if (lead.countryCode && getCountry(lead.countryCode)) counts.set(lead.countryCode, (counts.get(lead.countryCode) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([code, count]) => ({ code, name: getCountry(code)?.name ?? code, count }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
}

function applyNonCountryFilters(rows: MockLead[], user: AuthenticatedLeadUser, query: LeadQuery) {
  let filtered = rows;

  if (query.search) {
    const countryCodes = getCountryCodesMatching(query.search);
    filtered = filtered.filter((lead) => includes(`${lead.firstName} ${lead.lastName}`, query.search) || includes(lead.id, query.search) || countryCodes.includes(lead.countryCode ?? ""));
  }
  if (query.leadId) filtered = filtered.filter((lead) => includes(lead.id, query.leadId));
  if (query.name) filtered = filtered.filter((lead) => includes(`${lead.firstName} ${lead.lastName}`, query.name));
  if (query.salesStatus) filtered = filtered.filter((lead) => lead.salesStatus === query.salesStatus);
  if (query.retentionStatus) filtered = filtered.filter((lead) => lead.retentionStatus === query.retentionStatus);
  if (query.activeTeam) filtered = filtered.filter((lead) => lead.activeTeam === query.activeTeam);
  if (user.role === "ADMIN" && query.salesAgent) {
    filtered = query.salesAgent === "unassigned" ? filtered.filter((lead) => !lead.salesAgent) : filtered.filter((lead) => lead.salesAgent?.id === query.salesAgent);
  }
  if (user.role === "ADMIN" && query.retentionAgent) {
    filtered = query.retentionAgent === "unassigned" ? filtered.filter((lead) => !lead.retentionAgent) : filtered.filter((lead) => lead.retentionAgent?.id === query.retentionAgent);
  }
  return filtered.filter((lead) =>
    inDateRange(lead.createdAt, query.registrationFrom, query.registrationTo) &&
    inDateRange(lead.firstDeposit?.at ?? null, query.ftdFrom, query.ftdTo) &&
    inDateRange(lead.firstNoteAt, query.firstNoteFrom, query.firstNoteTo) &&
    inDateRange(lead.lastNote?.at ?? null, query.lastNoteFrom, query.lastNoteTo),
  );
}

export async function listMockLeads(user: AuthenticatedLeadUser, query: LeadQuery): Promise<LeadPageResult> {
  // Authorization scope is deliberately applied before any browser-controlled filters.
  let rows = user.role === "ADMIN" ? MOCK_LEADS : user.role === "SALES_AGENT" ? MOCK_LEADS.filter((lead) => lead.activeTeam === "OPEN" || lead.salesAgent?.id === user.id || (lead.activeTeam === "SALES" && !lead.salesAgent)) : MOCK_LEADS.filter((lead) => lead.activeTeam === "OPEN" || lead.activeTeam === "SALES" || lead.retentionAgent?.id === user.id);
  rows = applyNonCountryFilters(rows, user, query);
  const options = countryOptions(rows);

  if (query.country.length) rows = rows.filter((lead) => query.country.includes(lead.countryCode ?? ""));

  rows = [...rows].sort((a, b) => compare(a, b, query));
  const total = rows.length;
  const totalPages = query.pageSize === "all" ? 1 : Math.max(1, Math.ceil(total / query.pageSize));
  const page = query.pageSize === "all" ? 1 : Math.min(query.page, totalPages);
  const items = query.pageSize === "all" ? rows : rows.slice((page - 1) * query.pageSize, page * query.pageSize);
  return { items, total, page, salesAgents: MOCK_SALES_AGENTS, retentionAgents: MOCK_AGENTS, countryOptions: options };
}

export function getMockLeadCountForAgent(agentId: string) {
  return MOCK_LEADS.filter((lead) => lead.retentionAgent?.id === agentId || lead.salesAgent?.id === agentId).length;
}

export function describeMockCountry(code: string | null) {
  return getCountry(code)?.name ?? code ?? "Unknown";
}

