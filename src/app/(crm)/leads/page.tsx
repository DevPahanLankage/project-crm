import Link from "next/link";
import { LeadFilters } from "@/app/(crm)/leads/lead-filters";
import { LeadsTable } from "@/app/(crm)/leads/leads-table";
import { RefreshButton } from "@/app/(crm)/leads/refresh-button";
import { requireAuthenticatedUser } from "@/lib/auth";
import { parseLeadQuery } from "@/lib/leads/query";
import { listAuthorizedLeads } from "@/lib/leads/service";
import { leadListHref, type LeadSearchParams } from "@/lib/leads/url";
import { startPerf } from "@/lib/perf";

function preservedInputs(params: LeadSearchParams, excluded: string[]) {
  return Object.entries(params).flatMap(([key, raw]) => {
    if (excluded.includes(key)) return [];
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return values.filter(Boolean).map((value, index) => <input key={`${key}-${index}-${value}`} type="hidden" name={key} value={value} />);
  });
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<LeadSearchParams> }) {
  const endPage = startPerf("leads page total");
  const user = await requireAuthenticatedUser();
  const params = await searchParams;
  const query = parseLeadQuery(params);
  const result = await listAuthorizedLeads(user, query);
  endPage();
  const isAdmin = user.role === "ADMIN";
  const totalPages = query.pageSize === "all" ? 1 : Math.max(1, Math.ceil(result.total / query.pageSize));
  const start = result.total === 0 ? 0 : query.pageSize === "all" ? 1 : (result.page - 1) * query.pageSize + 1;
  const end = query.pageSize === "all" ? result.total : Math.min(result.page * query.pageSize, result.total);

  return (
    <div className="leads-page">
      <div className="leads-heading"><h1>{result.total.toLocaleString("en-US")} Clients found</h1></div>
      <LeadFilters query={query} agents={result.agents} countryOptions={result.countryOptions} isAdmin={isAdmin} />
      <div className="table-panel">
        <div className="table-toolbar">
          <form className="global-search" action="/leads" method="get">
            {preservedInputs(params, ["search", "page"])}
            <input name="search" defaultValue={query.search} placeholder="Search by name, lead ID, or country (code or name)" aria-label="Search leads" />
            <button type="submit">Search</button>
          </form>
          <RefreshButton />
        </div>
        {result.items.length ? <LeadsTable items={result.items} agents={result.agents} isAdmin={isAdmin} query={query} params={params} /> : <div className="leads-empty"><strong>{isAdmin ? "No leads found" : "No assigned clients found."}</strong><span>Try changing or resetting the current filters.</span></div>}
        <div className="table-footer">
          <form className="page-size-form" action="/leads" method="get">
            {preservedInputs(params, ["page", "pageSize"])}
            <label htmlFor="page-size">Rows</label>
            <select id="page-size" name="pageSize" defaultValue={query.pageSize}><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="all">All</option></select>
            <button type="submit">Show</button>
          </form>
          <span className="page-summary">Page {result.page} of {totalPages} - Showing {start.toLocaleString("en-US")} to {end.toLocaleString("en-US")} of {result.total.toLocaleString("en-US")}</span>
          <nav className="pagination" aria-label="Leads pagination">
            {result.page > 1 ? <Link href={leadListHref(params, { page: String(result.page - 1) })}>Previous</Link> : <span aria-disabled="true">Previous</span>}
            {result.page < totalPages ? <Link href={leadListHref(params, { page: String(result.page + 1) })}>Next</Link> : <span aria-disabled="true">Next</span>}
          </nav>
        </div>
      </div>
    </div>
  );
}

