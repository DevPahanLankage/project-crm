"use client";

import { Shuffle, Trash2, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { bulkAssignLeadsAction, bulkDeleteLeadsAction, bulkUnassignLeadsAction, distributeLeadsAction } from "@/app/(crm)/crm-actions";
import { ActionMessage } from "@/components/action-state";
import { CountryCode } from "@/components/country-code";
import { RETENTION_STATUSES, RETENTION_STATUS_LABELS, emptyActionState, type AgentOption, type LeadListItem, type LeadQuery, type LeadSort } from "@/lib/leads/types";
import { leadListHref, type LeadSearchParams } from "@/lib/leads/url";

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });

type Modal = "assign" | "distribute" | "unassign" | "delete" | null;

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
  if (!lead.firstDeposit) return <span className="muted">First: —<br />Last: —</span>;
  const line = (label: string, deposit: LeadListItem["firstDeposit"]) => deposit ? `${label}: ${money(deposit.amount)} · ${dateTime.format(deposit.at)}` : `${label}: —`;
  return <span className="deposit-cell">{line("First", lead.firstDeposit)}<br />{line("Last", lead.lastDeposit)}</span>;
}

function HiddenLeadIds({ selected }: { selected: string[] }) {
  return <>{selected.map((id) => <input key={id} type="hidden" name="leadIds" value={id} />)}</>;
}

function LeadLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [prefetch, setPrefetch] = useState(false);
  return (
    <Link
      className="client-link"
      href={href}
      prefetch={prefetch ? true : false}
      onFocus={() => setPrefetch(true)}
      onMouseEnter={() => setPrefetch(true)}
    >
      {children}
    </Link>
  );
}

export function LeadsTable({ items, agents, isAdmin, query, params }: { items: LeadListItem[]; agents: AgentOption[]; isAdmin: boolean; query: LeadQuery; params: LeadSearchParams }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [assignState, assignAction, assignPending] = useActionState(bulkAssignLeadsAction, emptyActionState);
  const [unassignState, unassignAction, unassignPending] = useActionState(bulkUnassignLeadsAction, emptyActionState);
  const [deleteState, deleteAction, deletePending] = useActionState(bulkDeleteLeadsAction, emptyActionState);
  const [distributeState, distributeAction, distributePending] = useActionState(distributeLeadsAction, emptyActionState);
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
          <button type="button" onClick={() => setModal("assign")}><UserPlus size={14} />Assign to agent</button>
          <button type="button" onClick={() => setModal("distribute")}><Shuffle size={14} />Distribute to agents</button>
          <button type="button" onClick={() => setModal("unassign")}><UserMinus size={14} />Unassign agent</button>
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
            {isAdmin && <th>Assigned Agent</th>}
            <SortHeader field="registration" label="Registration" query={query} params={params} />
            <SortHeader field="lastNote" label="Last Note" query={query} params={params} />
            <SortHeader field="retentionStatus" label="Retention Status" query={query} params={params} />
          </tr></thead>
          <tbody>{items.map((lead) => {
            return <tr key={lead.id}>
              {isAdmin && <td className="selection-column"><input type="checkbox" checked={selected.includes(lead.id)} aria-label={`Select ${lead.firstName} ${lead.lastName}`} onChange={(event) => toggleOne(lead.id, event.currentTarget.checked)} /></td>}
              <td><LeadLink href={`/leads/${lead.id}`}>{lead.firstName} {lead.lastName}</LeadLink><small className="lead-id">{lead.id}</small></td>
              <td><CountryCode code={lead.countryCode} /></td>
              <td className="numeric">{money(lead.totalBalance)}</td>
              <td><Deposits lead={lead} /></td>
              {isAdmin && <td>{lead.assignedAgent?.fullName ?? <span className="muted">Unassigned</span>}</td>}
              <td className="nowrap" title={dateTime.format(lead.createdAt)}>{relativeTime(lead.createdAt)}</td>
              <td>{lead.lastNote ? <span className="note-cell"><strong>{lead.lastNote.preview || "Note posted"}</strong><small>{dateTime.format(lead.lastNote.at)}{lead.lastNote.author ? ` · ${lead.lastNote.author}` : ""}</small></span> : <span className="muted">—</span>}</td>
              <td><span className={`status-box status-${lead.retentionStatus.toLocaleLowerCase().replaceAll("_", "-")}`}>{RETENTION_STATUS_LABELS[lead.retentionStatus]}</span></td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <div className="modal" role="dialog" aria-modal="true">
          {modal === "assign" && <form action={assignAction}>
            <h2>Assign to agent</h2>
            <p>{selectedCount} selected lead(s)</p>
            <HiddenLeadIds selected={selected} />
            <label className="filter-field"><span>RETENTION AGENT</span><select name="assignedAgentId" required>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</select></label>
            <ActionMessage state={assignState} />
            <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button className="compact-primary" disabled={assignPending}><UserPlus size={14} />Assign</button></div>
          </form>}
          {modal === "distribute" && <form action={distributeAction}>
            <h2>Distribute leads equally</h2>
            <p>{selectedCount} selected lead(s) will be assigned evenly between the selected agents.</p>
            <HiddenLeadIds selected={selected} />
            <label className="filter-field"><span>RETENTION STATUS SCOPE</span><select name="statusScope"><option value="all">All selected (any status)</option>{RETENTION_STATUSES.map((status) => <option key={status} value={status}>{RETENTION_STATUS_LABELS[status]}</option>)}</select></label>
            <div className="check-list">{agents.map((agent) => <label key={agent.id}><input type="checkbox" name="agentIds" value={agent.id} /> {agent.fullName}</label>)}</div>
            <ActionMessage state={distributeState} />
            <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button className="compact-primary" disabled={distributePending}><Shuffle size={14} />Distribute equally</button></div>
          </form>}
          {modal === "unassign" && <form action={unassignAction}>
            <h2>Unassign agent</h2>
            <p>{selectedCount} selected lead(s) will become unassigned and disappear from previous agents&apos; lead lists.</p>
            <HiddenLeadIds selected={selected} />
            <ActionMessage state={unassignState} />
            <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button className="compact-primary" disabled={unassignPending}><UserMinus size={14} />Unassign agent</button></div>
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
