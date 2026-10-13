"use client";

import { Shuffle, Trash2, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  bulkAssignRetentionLeadsAction,
  bulkAssignSalesLeadsAction,
  bulkDeleteLeadsAction,
  bulkUnassignRetentionLeadsAction,
  bulkUnassignSalesLeadsAction,
  distributeRetentionLeadsAction,
  distributeSalesLeadsAction,
} from "@/app/(crm)/crm-actions";
import { ActionMessage } from "@/components/action-state";
import { CountryCode } from "@/components/country-code";
import { leadWorkflowVisibility } from "@/lib/leads/permissions";
import { ACTIVE_TEAM_LABELS, RETENTION_STATUSES, RETENTION_STATUS_LABELS, SALES_STATUS_LABELS, emptyActionState, type AgentOption, type AuthenticatedLeadUser, type LeadListItem, type LeadQuery, type LeadSort } from "@/lib/leads/types";
import { leadListHref, type LeadSearchParams } from "@/lib/leads/url";

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });

type Modal = "assignSales" | "distributeSales" | "unassignSales" | "assignRetention" | "distributeRetention" | "unassignRetention" | "delete" | null;

function money(value: string) {
  const [whole, decimal = "00"] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimal.padEnd(2, "0").slice(0, 2)} USD`;
}

function relativeTime(date: Date) {
  const diffMs = Math.max(0, Date.now() - new Date(date).getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  const months = Math.floor(days / 30);
  return `${months} ${months === 1 ? "month" : "months"} ago`;
}

function SortHeader({ field, label, query, params }: { field: LeadSort; label: string; query: LeadQuery; params: LeadSearchParams }) {
  const active = query.sort === field;
  const direction = active && query.direction === "asc" ? "desc" : "asc";
  return <th><Link className="sort-link" href={leadListHref(params, { sort: field, direction, page: null })}>{label}<span aria-hidden="true">{active ? (query.direction === "asc" ? "↑" : "↓") : "↕"}</span></Link></th>;
}

function Deposits({ lead }: { lead: LeadListItem }) {
  if (!lead.firstDeposit) return <span className="muted">First: -<br />Last: -</span>;
  const line = (label: string, deposit: LeadListItem["firstDeposit"]) => deposit ? `${label}: ${money(deposit.amount)} - ${dateTime.format(deposit.at)}` : `${label}: -`;
  return <span className="deposit-cell">{line("First", lead.firstDeposit)}<br />{line("Last", lead.lastDeposit)}</span>;
}

function HiddenLeadIds({ selected }: { selected: string[] }) {
  return <>{selected.map((id) => <input key={id} type="hidden" name="leadIds" value={id} />)}</>;
}

function LeadLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [prefetch, setPrefetch] = useState(false);
  return (
    <Link className="client-link" href={href} prefetch={prefetch ? true : false} onFocus={() => setPrefetch(true)} onMouseEnter={() => setPrefetch(true)}>
      {children}
    </Link>
  );
}

function statusClass(status: string) {
  return `status-${status.toLocaleLowerCase().replaceAll("_", "-")}`;
}

export function LeadsTable({ items, salesAgents, retentionAgents, viewer, query, params }: { items: LeadListItem[]; salesAgents: AgentOption[]; retentionAgents: AgentOption[]; viewer: AuthenticatedLeadUser; query: LeadQuery; params: LeadSearchParams }) {
  const visibility = leadWorkflowVisibility(viewer);
  const isAdmin = viewer.role === "ADMIN";
  const [selected, setSelected] = useState<string[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [assignSalesState, assignSalesAction, assignSalesPending] = useActionState(bulkAssignSalesLeadsAction, emptyActionState);
  const [assignRetentionState, assignRetentionAction, assignRetentionPending] = useActionState(bulkAssignRetentionLeadsAction, emptyActionState);
  const [unassignSalesState, unassignSalesAction, unassignSalesPending] = useActionState(bulkUnassignSalesLeadsAction, emptyActionState);
  const [unassignRetentionState, unassignRetentionAction, unassignRetentionPending] = useActionState(bulkUnassignRetentionLeadsAction, emptyActionState);
  const [deleteState, deleteAction, deletePending] = useActionState(bulkDeleteLeadsAction, emptyActionState);
  const [distributeSalesState, distributeSalesAction, distributeSalesPending] = useActionState(distributeSalesLeadsAction, emptyActionState);
  const [distributeRetentionState, distributeRetentionAction, distributeRetentionPending] = useActionState(distributeRetentionLeadsAction, emptyActionState);
  const allIds = useMemo(() => items.map((item) => item.id), [items]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  const selectedCount = selected.length;

  function toggleAll(checked: boolean) {
    setSelected(checked ? allIds : []);
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id));
  }

  return (
    <>
      {isAdmin && selectedCount > 0 && (
        <div className="bulk-bar">
          <strong>{selectedCount} selected</strong>
          <div className="bulk-action-group" aria-label="Sales bulk actions">
            <span>Sales</span>
            <button type="button" onClick={() => setModal("assignSales")}><UserPlus size={14} />Assign</button>
            <button type="button" onClick={() => setModal("distributeSales")}><Shuffle size={14} />Distribute</button>
            <button type="button" onClick={() => setModal("unassignSales")}><UserMinus size={14} />Unassign</button>
          </div>
          <div className="bulk-action-group" aria-label="Retention bulk actions">
            <span>Retention</span>
            <button type="button" onClick={() => setModal("assignRetention")}><UserPlus size={14} />Assign</button>
            <button type="button" onClick={() => setModal("distributeRetention")}><Shuffle size={14} />Distribute</button>
            <button type="button" onClick={() => setModal("unassignRetention")}><UserMinus size={14} />Unassign</button>
          </div>
          <button className="danger-button" type="button" onClick={() => setModal("delete")}><Trash2 size={14} />Delete selected</button>
        </div>
      )}
      <div className="table-scroll">
        <table className="leads-table">
          <thead><tr>
            {isAdmin && <th className="selection-column"><input type="checkbox" aria-label="Select all leads on this page" checked={allSelected} onChange={(event) => toggleAll(event.currentTarget.checked)} /></th>}
            <SortHeader field="client" label="Client" query={query} params={params} />
            <SortHeader field="country" label="Country" query={query} params={params} />
            <SortHeader field="balance" label="Balance" query={query} params={params} />
            <th>Deposits</th>
            {visibility.showSalesStatus && <SortHeader field="salesStatus" label="Sales Status" query={query} params={params} />}
            {visibility.showRetentionStatus && <SortHeader field="retentionStatus" label="Retention Status" query={query} params={params} />}
            <SortHeader field="activeTeam" label="Active Team" query={query} params={params} />
            {visibility.showSalesAgent && <th>Sales Agent</th>}
            {visibility.showRetentionAgent && <th>Retention Agent</th>}
            <SortHeader field="registration" label="Registration" query={query} params={params} />
            <SortHeader field="lastNote" label="Last Note" query={query} params={params} />
          </tr></thead>
          <tbody>{items.map((lead) => <tr key={lead.id}>
            {isAdmin && <td className="selection-column"><input type="checkbox" checked={selected.includes(lead.id)} aria-label={`Select ${lead.firstName} ${lead.lastName}`} onChange={(event) => toggleOne(lead.id, event.currentTarget.checked)} /></td>}
            <td><LeadLink href={`/leads/${lead.id}`}>{lead.firstName} {lead.lastName}</LeadLink><small className="lead-id">{lead.id}</small></td>
            <td><CountryCode code={lead.countryCode} /></td>
            <td className="numeric">{money(lead.totalBalance)}</td>
            <td><Deposits lead={lead} /></td>
            {visibility.showSalesStatus && <td><span className={`status-box ${statusClass(lead.salesStatus)}`}>{SALES_STATUS_LABELS[lead.salesStatus]}</span></td>}
            {visibility.showRetentionStatus && <td><span className={`status-box ${statusClass(lead.retentionStatus)}`}>{RETENTION_STATUS_LABELS[lead.retentionStatus]}</span></td>}
            <td><span className="status-box">{ACTIVE_TEAM_LABELS[lead.activeTeam]}</span></td>
            {visibility.showSalesAgent && <td>{lead.salesAgent?.fullName ?? <span className="muted">Unassigned</span>}</td>}
            {visibility.showRetentionAgent && <td>{lead.retentionAgent?.fullName ?? <span className="muted">Unassigned</span>}</td>}
            <td className="nowrap" title={dateTime.format(lead.createdAt)}>{relativeTime(lead.createdAt)}</td>
            <td>{lead.lastNote ? <span className="note-cell"><strong>{lead.lastNote.preview || "Note posted"}</strong><small>{dateTime.format(lead.lastNote.at)}{lead.lastNote.author ? ` - ${lead.lastNote.author}` : ""}</small></span> : <span className="muted">-</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>

      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <div className="modal" role="dialog" aria-modal="true">
          {modal === "assignSales" && <form action={assignSalesAction}>
            <h2>Assign to Sales agent</h2>
            <p>{selectedCount} selected lead(s)</p>
            <HiddenLeadIds selected={selected} />
            <label className="filter-field"><span>SALES AGENT</span><select name="salesAgentId" required>{salesAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</select></label>
            <ActionMessage state={assignSalesState} />
            <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button className="compact-primary" disabled={assignSalesPending}><UserPlus size={14} />Assign</button></div>
          </form>}
          {modal === "distributeSales" && <form action={distributeSalesAction}>
            <h2>Distribute leads equally to Sales</h2>
            <p>{selectedCount} selected lead(s) will be assigned evenly between the selected Sales agents.</p>
            <HiddenLeadIds selected={selected} />
            <div className="check-list">{salesAgents.map((agent) => <label key={agent.id}><input type="checkbox" name="agentIds" value={agent.id} /> {agent.fullName}</label>)}</div>
            <ActionMessage state={distributeSalesState} />
            <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button className="compact-primary" disabled={distributeSalesPending}><Shuffle size={14} />Distribute equally</button></div>
          </form>}
          {modal === "unassignSales" && <form action={unassignSalesAction}>
            <h2>Unassign Sales agent</h2>
            <p>{selectedCount} selected lead(s) will become unassigned from Sales. Retention assignment will be preserved.</p>
            <HiddenLeadIds selected={selected} />
            <ActionMessage state={unassignSalesState} />
            <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button className="compact-primary" disabled={unassignSalesPending}><UserMinus size={14} />Unassign Sales</button></div>
          </form>}
          {modal === "assignRetention" && <form action={assignRetentionAction}>
            <h2>Assign to Retention agent</h2>
            <p>{selectedCount} selected lead(s)</p>
            <HiddenLeadIds selected={selected} />
            <label className="filter-field"><span>RETENTION AGENT</span><select name="retentionAgentId" required>{retentionAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</select></label>
            <ActionMessage state={assignRetentionState} />
            <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button className="compact-primary" disabled={assignRetentionPending}><UserPlus size={14} />Assign</button></div>
          </form>}
          {modal === "distributeRetention" && <form action={distributeRetentionAction}>
            <h2>Distribute leads equally to Retention</h2>
            <p>{selectedCount} selected lead(s) will be assigned evenly between the selected Retention agents.</p>
            <HiddenLeadIds selected={selected} />
            <label className="filter-field"><span>RETENTION STATUS SCOPE</span><select name="statusScope"><option value="all">All selected (any status)</option>{RETENTION_STATUSES.map((status) => <option key={status} value={status}>{RETENTION_STATUS_LABELS[status]}</option>)}</select></label>
            <div className="check-list">{retentionAgents.map((agent) => <label key={agent.id}><input type="checkbox" name="agentIds" value={agent.id} /> {agent.fullName}</label>)}</div>
            <ActionMessage state={distributeRetentionState} />
            <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button className="compact-primary" disabled={distributeRetentionPending}><Shuffle size={14} />Distribute equally</button></div>
          </form>}
          {modal === "unassignRetention" && <form action={unassignRetentionAction}>
            <h2>Unassign Retention agent</h2>
            <p>{selectedCount} selected lead(s) will become unassigned from Retention. Sales assignment will be preserved.</p>
            <HiddenLeadIds selected={selected} />
            <ActionMessage state={unassignRetentionState} />
            <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button className="compact-primary" disabled={unassignRetentionPending}><UserMinus size={14} />Unassign Retention</button></div>
          </form>}
          {modal === "delete" && <form action={deleteAction}>
            <h2>Delete selected</h2>
            <p>{selectedCount} selected lead(s) and their notes/deposits will be deleted. This cannot be undone.</p>
            <HiddenLeadIds selected={selected} />
            <ActionMessage state={deleteState} />
            <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button className="danger-button" disabled={deletePending}><Trash2 size={14} />Delete selected</button></div>
          </form>}
        </div>
      </div>}
    </>
  );
}
