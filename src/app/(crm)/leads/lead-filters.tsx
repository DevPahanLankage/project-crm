import Link from "next/link";
import { CountryFilter } from "@/app/(crm)/leads/country-filter";
import { leadWorkflowVisibility } from "@/lib/leads/permissions";
import { ACTIVE_TEAMS, ACTIVE_TEAM_LABELS, RETENTION_STATUSES, RETENTION_STATUS_LABELS, SALES_STATUSES, SALES_STATUS_LABELS, type AgentOption, type AuthenticatedLeadUser, type CountryFilterOption, type LeadQuery } from "@/lib/leads/types";

function dateInput(name: string, label: string, value: Date | null) {
  return <label className="filter-field"><span>{label}</span><input type="date" name={name} defaultValue={value?.toISOString().slice(0, 10) ?? ""} /></label>;
}

export function LeadFilters({ query, salesAgents, retentionAgents, countryOptions, viewer }: { query: LeadQuery; salesAgents: AgentOption[]; retentionAgents: AgentOption[]; countryOptions: CountryFilterOption[]; viewer: AuthenticatedLeadUser }) {
  const visibility = leadWorkflowVisibility(viewer);
  return (
    <form className="filter-form" action="/leads" method="get">
      <input type="hidden" name="search" value={query.search} />
      <input type="hidden" name="sort" value={query.sort} />
      <input type="hidden" name="direction" value={query.direction} />
      <input type="hidden" name="pageSize" value={query.pageSize} />
      <details className="filter-section" open>
        <summary>General information</summary>
        <div className="filter-grid">
          <label className="filter-field"><span>LEAD ID</span><input name="leadId" defaultValue={query.leadId} placeholder="Full or partial ID" /></label>
          <label className="filter-field"><span>COUNTRY</span><CountryFilter key={query.country.join(",")} options={countryOptions} selectedCodes={query.country} /></label>
          <label className="filter-field"><span>NAME</span><input name="name" defaultValue={query.name} placeholder="First or last name" /></label>
          {visibility.showSalesStatusFilter && <label className="filter-field"><span>SALES STATUS</span><select name="salesStatus" defaultValue={query.salesStatus ?? ""}><option value="">All sales statuses</option>{SALES_STATUSES.map((status) => <option key={status} value={status}>{SALES_STATUS_LABELS[status]}</option>)}</select></label>}
          {visibility.showRetentionStatusFilter && <label className="filter-field"><span>RETENTION STATUS</span><select name="retentionStatus" defaultValue={query.retentionStatus ?? ""}><option value="">All retention statuses</option>{RETENTION_STATUSES.map((status) => <option key={status} value={status}>{RETENTION_STATUS_LABELS[status]}</option>)}</select></label>}
          <label className="filter-field"><span>ACTIVE TEAM</span><select name="activeTeam" defaultValue={query.activeTeam ?? ""}><option value="">All teams</option>{ACTIVE_TEAMS.map((team) => <option key={team} value={team}>{ACTIVE_TEAM_LABELS[team]}</option>)}</select></label>
          {visibility.showSalesAgentFilter && <label className="filter-field"><span>SALES AGENT</span><select name="salesAgent" defaultValue={query.salesAgent}><option value="">All sales agents</option><option value="unassigned">Unassigned</option>{salesAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</select></label>}
          {visibility.showRetentionAgentFilter && <label className="filter-field"><span>RETENTION AGENT</span><select name="retentionAgent" defaultValue={query.retentionAgent}><option value="">All retention agents</option><option value="unassigned">Unassigned</option>{retentionAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</select></label>}
        </div>
      </details>
      <details className="filter-section">
        <summary>Filters by date</summary>
        <div className="date-filter-grid">
          <fieldset><legend>REGISTRATION DATE</legend>{dateInput("registrationFrom", "From", query.registrationFrom)}{dateInput("registrationTo", "To", query.registrationTo)}</fieldset>
          <fieldset><legend>FTD DATE</legend>{dateInput("ftdFrom", "From", query.ftdFrom)}{dateInput("ftdTo", "To", query.ftdTo)}</fieldset>
          <fieldset><legend>FIRST NOTE DATE</legend>{dateInput("firstNoteFrom", "From", query.firstNoteFrom)}{dateInput("firstNoteTo", "To", query.firstNoteTo)}</fieldset>
          <fieldset><legend>LAST NOTE DATE</legend>{dateInput("lastNoteFrom", "From", query.lastNoteFrom)}{dateInput("lastNoteTo", "To", query.lastNoteTo)}</fieldset>
        </div>
      </details>
      <div className="filter-actions"><Link className="secondary-button" href="/leads">Reset filters</Link><button className="compact-primary" type="submit">Apply filters</button></div>
    </form>
  );
}
