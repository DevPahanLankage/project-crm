"use client";

import { BadgeDollarSign, FileText, MessageSquarePlus, NotebookText, ShieldAlert, Trash2, UserRoundCog } from "lucide-react";
import { useActionState, useState } from "react";
import { addDepositAction, addNoteAction, deleteLeadAction, deletePinnedNoteAction, toggleNotePinAction, updateActiveTeamAction, updateLeadProfileAction, updateRetentionAssignmentAction, updateRetentionStatusAction, updateSalesAssignmentAction, updateSalesStatusAction } from "@/app/(crm)/crm-actions";
import { ActionMessage } from "@/components/action-state";
import { CopyableValue } from "@/components/copyable-value";
import { CountryCode } from "@/components/country-code";
import { SubmitButton } from "@/components/submit-button";
import { canAddDeposit, canAddNote, canEditProfile, canEditRetentionStatus, canEditSalesStatus, canToggleNotePin, canUpdateActiveTeam } from "@/lib/leads/permissions";
import { ACTIVE_TEAMS, ACTIVE_TEAM_LABELS, RETENTION_STATUSES, RETENTION_STATUS_LABELS, ROLE_LABELS, SALES_STATUSES, SALES_STATUS_LABELS, emptyActionState, type AgentOption, type AuthenticatedLeadUser, type LeadDetail } from "@/lib/leads/types";

const exactDateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });
const longDateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const accountStatusLabels = { NOT_VERIFIED: "NOT VERIFIED" } as const;

type Tab = "profile" | "payments" | "notes";

function money(value: string) {
  const [whole, decimal = "00"] = value.split(".");
  return `USD ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${decimal === "00" ? "" : `.${decimal}`}`;
}

function relative(date: Date) {
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
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

function currentTime(timeZone: string | null) {
  if (!timeZone) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date());
  } catch {
    return null;
  }
}

function dash(value: React.ReactNode) {
  return value || <span className="muted">-</span>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="info-row"><span>{label}</span><strong>{dash(value)}</strong></div>;
}

function SummaryCard({ label, value, detail, icon }: { label: string; value: React.ReactNode; detail?: React.ReactNode; icon?: React.ReactNode }) {
  return <section className="summary-card"><span>{icon}{label}</span><strong>{dash(value)}</strong>{detail && <small>{detail}</small>}</section>;
}

function ActionPanel({ state }: { state: { ok: boolean; message: string } }) {
  return <ActionMessage state={state} />;
}

function statusClass(status: string) {
  return `status-${status.toLocaleLowerCase().replaceAll("_", "-")}`;
}

function PinnedNoteCard({ note, leadId, canPin }: { note: LeadDetail["pinnedNotes"][number]; leadId: string; canPin: boolean }) {
  const [deleteState, deleteAction, pending] = useActionState(deletePinnedNoteAction, emptyActionState);
  const author = note.createdBy ? `${note.createdBy.fullName} - ${ROLE_LABELS[note.createdBy.role]}` : "System";

  return (
    <article className="pinned-note">
      <header className="pinned-note-header">
        <small>{author} - {longDateTime.format(note.createdAt)}</small>
        {canPin && <form action={deleteAction} onSubmit={(event) => { if (!confirm("Delete pinned note?\n\nAre you sure you want to permanently delete this note?")) event.preventDefault(); }}>
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="noteId" value={note.id} />
          <button className="note-delete-button" type="submit" title="Delete pinned note" aria-label="Delete pinned note" disabled={pending}>
            <Trash2 size={13} aria-hidden="true" />
          </button>
        </form>}
      </header>
      <p>{note.body}</p>
      <ActionPanel state={deleteState} />
    </article>
  );
}

export function LeadProfile({ lead, salesAgents, retentionAgents, viewer }: { lead: LeadDetail; salesAgents: AgentOption[]; retentionAgents: AgentOption[]; viewer: AuthenticatedLeadUser }) {
  const latestNote = lead.notes[0] ?? null;
  const lastActivityAt = latestNote?.createdAt ?? lead.lastDeposit?.createdAt ?? lead.updatedAt;
  const [tab, setTab] = useState<Tab>("profile");
  const [noteOpen, setNoteOpen] = useState(false);
  const [salesStatusState, salesStatusAction] = useActionState(updateSalesStatusAction, emptyActionState);
  const [retentionStatusState, retentionStatusAction] = useActionState(updateRetentionStatusAction, emptyActionState);
  const [activeTeamState, activeTeamAction] = useActionState(updateActiveTeamAction, emptyActionState);
  const [salesAssignmentState, salesAssignmentAction] = useActionState(updateSalesAssignmentAction, emptyActionState);
  const [retentionAssignmentState, retentionAssignmentAction] = useActionState(updateRetentionAssignmentAction, emptyActionState);
  const [profileState, profileAction] = useActionState(updateLeadProfileAction, emptyActionState);
  const [depositState, depositAction] = useActionState(addDepositAction, emptyActionState);
  const [noteState, setNoteState] = useState(emptyActionState);

  const accessLead = { activeTeam: lead.activeTeam, salesAgentId: lead.salesAgent?.id ?? null, retentionAgentId: lead.retentionAgent?.id ?? null };
  const isAdmin = viewer.role === "ADMIN";
  const activeTeamEditable = canUpdateActiveTeam(viewer);
  const salesStatusEditable = canEditSalesStatus(viewer, accessLead);
  const retentionStatusEditable = canEditRetentionStatus(viewer, accessLead);
  const depositEditable = canAddDeposit(viewer, accessLead);
  const notesEditable = canAddNote(viewer, accessLead);
  const profileEditable = canEditProfile(viewer);
  const pinEditable = canToggleNotePin(viewer, accessLead);

  async function noteAction(formData: FormData) {
    const result = await addNoteAction(emptyActionState, formData);
    setNoteState(result);
    if (result.ok) setNoteOpen(false);
  }

  return (
    <div className="lead-profile">
      <div className="profile-header lead-header-card">
        <div><h1>{lead.firstName} {lead.lastName}</h1><small><CopyableValue value={lead.id} label="Player ID" /></small></div>
        <div className="profile-header-actions">
          {isAdmin && <form action={deleteLeadAction} onSubmit={(event) => { if (!confirm(`Delete ${lead.firstName} ${lead.lastName}?`)) event.preventDefault(); }}><input type="hidden" name="leadId" value={lead.id} /><button className="danger-button"><Trash2 size={14} />Delete lead</button></form>}
          <button type="button" onClick={() => document.getElementById("status-card")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Change acquisition status</button>
          <button className="compact-primary" type="button" onClick={() => setNoteOpen(true)} disabled={!notesEditable}><MessageSquarePlus size={14} />Add note</button>
        </div>
      </div>

      <div className="summary-grid">
        <SummaryCard label="ACCOUNT STATUS" icon={<ShieldAlert size={14} />} value={<span className="status-warning">{accountStatusLabels[lead.accountStatus]}</span>} />
        <SummaryCard label="ACTIVE TEAM" value={ACTIVE_TEAM_LABELS[lead.activeTeam]} />
        <SummaryCard label="TOTAL BALANCE" icon={<BadgeDollarSign size={14} />} value={money(lead.totalBalance)} />
        <SummaryCard label="AFFILIATE" value={lead.affiliate} />
        <SummaryCard label="LAST ACTIVITY" value={relative(lastActivityAt)} detail={exactDateTime.format(lastActivityAt)} />
        <SummaryCard label="REGISTERED" value={relative(lead.createdAt)} detail={exactDateTime.format(lead.createdAt)} />
      </div>

      {isAdmin && <section className="profile-section assignment-panel">
        <h2><UserRoundCog size={16} />Assignments</h2>
        <p className="muted">Sales and Retention assignments indicate the primary responsible user for each department.</p>
        <form action={salesAssignmentAction} className="inline-form">
          <input type="hidden" name="leadId" value={lead.id} />
          <select name="salesAgentId" defaultValue={lead.salesAgent?.id ?? ""}><option value="">Unassigned Sales</option>{salesAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</select>
          <SubmitButton>Update Sales</SubmitButton>
        </form>
        <ActionPanel state={salesAssignmentState} />
        <form action={retentionAssignmentAction} className="inline-form">
          <input type="hidden" name="leadId" value={lead.id} />
          <select name="retentionAgentId" defaultValue={lead.retentionAgent?.id ?? ""}><option value="">Unassigned Retention</option>{retentionAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</select>
          <SubmitButton>Update Retention</SubmitButton>
        </form>
        <ActionPanel state={retentionAssignmentState} />
      </section>}

      <div className="overview-grid">
        <section className="profile-section personal-overview">
          <h2><FileText size={16} />Personal information</h2>
          <div className="info-grid">
            <InfoRow label="Date of birth" value={lead.dateOfBirth ? exactDateTime.format(lead.dateOfBirth).split(",")[0] : null} />
            <InfoRow label="Gender" value={lead.gender} />
            <InfoRow label="Prefix" value={lead.prefix} />
            <InfoRow label="Phone" value={<CopyableValue value={lead.phone} label="Phone" />} />
            <InfoRow label="Phone (alt)" value={lead.alternatePhone} />
            <InfoRow label="E-mail" value={<CopyableValue value={lead.email} label="Email" />} />
            <InfoRow label="E-mail (alt)" value={lead.alternateEmail} />
            <InfoRow label="Country" value={lead.countryCode ? <CountryCode code={lead.countryCode} /> : null} />
            <InfoRow label="Current time" value={currentTime(lead.timeZone)} />
            <InfoRow label="Language" value={lead.language} />
            <InfoRow label="Additional info" value={lead.additionalInfo} />
          </div>
        </section>

        <section className="profile-section status-card" id="status-card">
          <h2>Acquisition status</h2>
          <div className="status-group">
            <span>ACTIVE TEAM</span>
            <div className="status-current-line">
              <span className="status-box">{ACTIVE_TEAM_LABELS[lead.activeTeam]}</span>
            </div>
            <form action={activeTeamAction} className="status-form">
              <input type="hidden" name="leadId" value={lead.id} />
              <select name="activeTeam" defaultValue={lead.activeTeam} disabled={!activeTeamEditable}>{ACTIVE_TEAMS.map((team) => <option key={team} value={team}>{ACTIVE_TEAM_LABELS[team]}</option>)}</select>
              <SubmitButton disabled={!activeTeamEditable}>Update active team</SubmitButton>
            </form>
          </div>
          <div className="status-group">
            <span>SALES</span>
            <div className="status-current-line">
              <span className={`status-box ${statusClass(lead.salesStatus)}`}>{SALES_STATUS_LABELS[lead.salesStatus]}</span>
              {lead.salesAgent && <small>{lead.salesAgent.fullName}</small>}
            </div>
            <form action={salesStatusAction} className="status-form">
              <input type="hidden" name="leadId" value={lead.id} />
              <select name="salesStatus" defaultValue={lead.salesStatus} disabled={!salesStatusEditable}>{SALES_STATUSES.map((status) => <option key={status} value={status}>{SALES_STATUS_LABELS[status]}</option>)}</select>
              <SubmitButton disabled={!salesStatusEditable}>Update sales</SubmitButton>
            </form>
          </div>
          <div className="status-group">
            <span>RETENTION</span>
            <div className="status-current-line">
              <span className={`status-box ${statusClass(lead.retentionStatus)}`}>{RETENTION_STATUS_LABELS[lead.retentionStatus]}</span>
              {lead.retentionAgent && <small>{lead.retentionAgent.fullName}</small>}
            </div>
            <form action={retentionStatusAction} className="status-form">
              <input type="hidden" name="leadId" value={lead.id} />
              <select name="retentionStatus" defaultValue={lead.retentionStatus} disabled={!retentionStatusEditable}>{RETENTION_STATUSES.map((status) => <option key={status} value={status}>{RETENTION_STATUS_LABELS[status]}</option>)}</select>
              <SubmitButton disabled={!retentionStatusEditable}>Update retention</SubmitButton>
            </form>
          </div>
          <ActionPanel state={activeTeamState} />
          <ActionPanel state={salesStatusState} />
          <ActionPanel state={retentionStatusState} />
        </section>

        <section className="profile-section ip-panel"><h2>Last 10 IPs</h2><p className="empty-inline">-</p></section>

        <aside className="pinned-panel">
          <h2><NotebookText size={16} />Pinned notes</h2>
          {lead.pinnedNotes.length ? lead.pinnedNotes.map((note) => <PinnedNoteCard key={note.id} note={note} leadId={lead.id} canPin={pinEditable} />) : <p className="empty-inline">No pinned notes.</p>}
        </aside>
      </div>

      <section className="profile-section latest-note-panel">
        <h2><NotebookText size={16} />Latest note</h2>
        {latestNote ? <article className="latest-note"><small>{latestNote.createdBy ? `${latestNote.createdBy.fullName} - ${ROLE_LABELS[latestNote.createdBy.role]}` : "System"} - {longDateTime.format(latestNote.createdAt)}</small><p>{latestNote.body}</p></article> : <p className="empty-inline">No notes.</p>}
      </section>

      <div className="tabs" role="tablist">
        <button type="button" className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profile</button>
        <button type="button" className={tab === "payments" ? "active" : ""} onClick={() => setTab("payments")}>Payments</button>
        <button type="button" className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")}>Notes</button>
      </div>

      {tab === "profile" && <section className="profile-section tab-panel">
        <h2><FileText size={16} />{profileEditable ? "Edit profile & balance" : "Profile details"}</h2>
        {profileEditable ? <form action={profileAction} className="profile-form">
          <input type="hidden" name="leadId" value={lead.id} />
          <label><span>First name</span><input name="firstName" defaultValue={lead.firstName} required /></label>
          <label><span>Last name</span><input name="lastName" defaultValue={lead.lastName} required /></label>
          <label><span>Prefix</span><input name="prefix" defaultValue={lead.prefix ?? ""} /></label>
          <label><span>Country code</span><input name="countryCode" defaultValue={lead.countryCode ?? ""} /></label>
          <label><span>Email</span><input name="email" type="email" defaultValue={lead.email} required /></label>
          <label><span>Alternate email</span><input name="alternateEmail" type="email" defaultValue={lead.alternateEmail ?? ""} /></label>
          <label><span>Phone</span><input name="phone" defaultValue={lead.phone} required /></label>
          <label><span>Alternate phone</span><input name="alternatePhone" defaultValue={lead.alternatePhone ?? ""} /></label>
          <label><span>Date of birth</span><input name="dateOfBirth" type="date" defaultValue={lead.dateOfBirth ? new Date(lead.dateOfBirth).toISOString().slice(0, 10) : ""} /></label>
          <label><span>Gender</span><input name="gender" defaultValue={lead.gender ?? ""} /></label>
          <label><span>Language</span><input name="language" defaultValue={lead.language ?? ""} /></label>
          <label><span>Time zone</span><input name="timeZone" defaultValue={lead.timeZone ?? ""} /></label>
          <label><span>Total balance</span><input name="totalBalance" inputMode="decimal" defaultValue={lead.totalBalance} required /></label>
          <label className="wide"><span>Additional info</span><textarea name="additionalInfo" defaultValue={lead.additionalInfo ?? ""} /></label>
          <div className="form-row-actions wide"><ActionPanel state={profileState} /><SubmitButton>Save profile</SubmitButton></div>
        </form> : <div className="info-grid">
          <InfoRow label="Date of birth" value={lead.dateOfBirth ? exactDateTime.format(lead.dateOfBirth).split(",")[0] : null} />
          <InfoRow label="Gender" value={lead.gender} />
          <InfoRow label="Prefix" value={lead.prefix} />
          <InfoRow label="Phone" value={<CopyableValue value={lead.phone} label="Phone" />} />
          <InfoRow label="Alternate phone" value={lead.alternatePhone} />
          <InfoRow label="Email" value={<CopyableValue value={lead.email} label="Email" />} />
          <InfoRow label="Alternate email" value={lead.alternateEmail} />
          <InfoRow label="Country" value={lead.countryCode ? <CountryCode code={lead.countryCode} /> : null} />
          <InfoRow label="Language" value={lead.language} />
          <InfoRow label="Additional info" value={lead.additionalInfo} />
        </div>}
      </section>}

      {tab === "payments" && <section className="profile-section tab-panel">
        <h2><BadgeDollarSign size={16} />Balance & deposits</h2>
        <div className="payment-summary">
          <InfoRow label="Total balance" value={money(lead.totalBalance)} />
          <InfoRow label="First deposit" value={lead.firstDeposit ? `${money(lead.firstDeposit.amount)} - ${exactDateTime.format(lead.firstDeposit.createdAt)}` : null} />
          <InfoRow label="Last deposit" value={lead.lastDeposit ? `${money(lead.lastDeposit.amount)} - ${exactDateTime.format(lead.lastDeposit.createdAt)}` : null} />
        </div>
        <form action={depositAction} className="inline-form add-deposit-form">
          <input type="hidden" name="leadId" value={lead.id} />
          <label><span>Add deposit (USD)</span><input name="amount" inputMode="decimal" placeholder="700.00" required disabled={!depositEditable} /></label>
          <SubmitButton disabled={!depositEditable}>Add deposit</SubmitButton>
          <ActionPanel state={depositState} />
        </form>
        {lead.deposits.length ? <table className="history-table"><thead><tr><th>Amount</th><th>Date/time</th><th>Added by</th></tr></thead><tbody>{lead.deposits.map((deposit) => <tr key={deposit.id}><td>{money(deposit.amount)}</td><td>{exactDateTime.format(deposit.createdAt)}</td><td>{deposit.createdBy.fullName}</td></tr>)}</tbody></table> : <p className="empty-inline">No deposits.</p>}
      </section>}

      {tab === "notes" && <section className="profile-section tab-panel">
        <h2><NotebookText size={16} />Notes</h2>
        {lead.notes.length ? <div className="note-list">{lead.notes.map((note) => <article key={note.id} className={note.isPinned ? "note pinned" : "note"}>
          <header><strong>{note.createdBy?.fullName ?? "System"}</strong><span>{note.createdBy ? ROLE_LABELS[note.createdBy.role] : "System"} - {longDateTime.format(note.createdAt)}</span></header>
          <p>{note.body}</p>
          <form action={toggleNotePinAction}><input type="hidden" name="leadId" value={lead.id} /><input type="hidden" name="noteId" value={note.id} /><button type="submit" disabled={!pinEditable || note.kind === "SYSTEM"}>{note.isPinned ? "Unpin" : "Pin"}</button></form>
        </article>)}</div> : <p className="empty-inline">No notes.</p>}
      </section>}

      {noteOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNoteOpen(false); }}>
        <div className="modal" role="dialog" aria-modal="true">
          <form action={noteAction}>
            <h2>Add note</h2>
            <input type="hidden" name="leadId" value={lead.id} />
            <label className="filter-field"><span>NOTE</span><textarea name="body" required /></label>
            <label className="checkbox-line"><input type="checkbox" name="isPinned" /> Pin this note</label>
            {!noteState.ok && <ActionPanel state={noteState} />}
            <div className="modal-actions"><button type="button" onClick={() => setNoteOpen(false)}>Cancel</button><SubmitButton pendingText="Adding...">Add note</SubmitButton></div>
          </form>
        </div>
      </div>}
    </div>
  );
}
