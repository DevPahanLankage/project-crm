import { ACTIVE_TEAMS, RETENTION_STATUSES, SALES_STATUSES, type LeadQuery, type LeadSort, type PageSize } from "@/lib/leads/types";
import { getCountry, getCountryCodesMatching, normalizeCountryCode } from "@/lib/countries";

type RawSearchParams = Record<string, string | string[] | undefined>;

function value(params: RawSearchParams, key: string) {
  const raw = params[key];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
}

function values(params: RawSearchParams, key: string) {
  const raw = params[key];
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean);
}

function countryValues(params: RawSearchParams) {
  const selected = new Set<string>();
  for (const raw of values(params, "country")) {
    const normalized = normalizeCountryCode(raw);
    if (normalized && getCountry(normalized)) {
      selected.add(normalized);
      continue;
    }
    getCountryCodesMatching(raw).forEach((code) => selected.add(code));
  }
  return [...selected].slice(0, 250);
}

function dateValue(raw: string, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseLeadQuery(params: RawSearchParams): LeadQuery {
  const salesStatusValue = value(params, "salesStatus");
  const retentionStatusValue = value(params, "retentionStatus") || value(params, "status");
  const activeTeamValue = value(params, "activeTeam");
  const sortValue = value(params, "sort") as LeadSort;
  const pageSizeValue = value(params, "pageSize");
  const parsedPage = Number.parseInt(value(params, "page"), 10);
  const validSorts: LeadSort[] = ["client", "country", "balance", "registration", "lastNote", "salesStatus", "retentionStatus", "activeTeam"];
  const pageSize: PageSize = pageSizeValue === "all" ? "all" : [25, 50, 100].includes(Number(pageSizeValue)) ? Number(pageSizeValue) as 25 | 50 | 100 : 25;

  return {
    search: value(params, "search").slice(0, 120),
    leadId: value(params, "leadId").slice(0, 120),
    country: countryValues(params),
    name: value(params, "name").slice(0, 120),
    salesStatus: SALES_STATUSES.includes(salesStatusValue as never) ? salesStatusValue as LeadQuery["salesStatus"] : null,
    retentionStatus: RETENTION_STATUSES.includes(retentionStatusValue as never) ? retentionStatusValue as LeadQuery["retentionStatus"] : null,
    activeTeam: ACTIVE_TEAMS.includes(activeTeamValue as never) ? activeTeamValue as LeadQuery["activeTeam"] : null,
    salesAgent: value(params, "salesAgent").slice(0, 120),
    retentionAgent: (value(params, "retentionAgent") || value(params, "agent")).slice(0, 120),
    registrationFrom: dateValue(value(params, "registrationFrom")),
    registrationTo: dateValue(value(params, "registrationTo"), true),
    ftdFrom: dateValue(value(params, "ftdFrom")),
    ftdTo: dateValue(value(params, "ftdTo"), true),
    firstNoteFrom: dateValue(value(params, "firstNoteFrom")),
    firstNoteTo: dateValue(value(params, "firstNoteTo"), true),
    lastNoteFrom: dateValue(value(params, "lastNoteFrom")),
    lastNoteTo: dateValue(value(params, "lastNoteTo"), true),
    sort: validSorts.includes(sortValue) ? sortValue : "registration",
    direction: value(params, "direction") === "asc" ? "asc" : "desc",
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize,
  };
}
