"use client";

import { Edit3, Trash2, UploadCloud, UserPlus } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { createOrUpdateUserAction, deleteUserAction, importLeadsAction } from "@/app/(crm)/crm-actions";
import { ActionMessage } from "@/components/action-state";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_LABELS, emptyActionState, type UserListItem } from "@/lib/leads/types";

type EditingUser = Pick<UserListItem, "id" | "fullName" | "email" | "role"> | null;

export function AdminSettings({ users, currentUserId }: { users: UserListItem[]; currentUserId: string }) {
  const [editing, setEditing] = useState<EditingUser>(null);
  const [fileName, setFileName] = useState("");
  const [userState, userAction] = useActionState(createOrUpdateUserAction, emptyActionState);
  const [deleteState, deleteAction] = useActionState(deleteUserAction, emptyActionState);
  const [importState, importAction] = useActionState(importLeadsAction, emptyActionState);
  const userFormKey = useMemo(() => editing?.id ?? "new", [editing?.id]);

  return (
    <div className="admin-page">
      <section className="settings-section">
        <h2><UploadCloud size={16} />Upload leads (Excel/CSV)</h2>
        <form action={importAction} className="settings-form">
          <label className="filter-field"><span>CHOOSE LEAD FILE</span><input name="file" type="file" accept=".xlsx,.xls,.csv" required onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? "")} /></label>
          {fileName && <p className="muted">{fileName}</p>}
          <ActionMessage state={importState} />
          <SubmitButton pendingText="Uploading...">Upload</SubmitButton>
        </form>
      </section>

      <section className="settings-section">
        <h2>{editing ? <><Edit3 size={16} />Edit user</> : <><UserPlus size={16} />Create user</>}</h2>
        <form key={userFormKey} action={userAction} className="settings-grid-form">
          {editing && <input type="hidden" name="userId" value={editing.id} />}
          <label className="filter-field"><span>FULL NAME</span><input name="fullName" defaultValue={editing?.fullName ?? ""} required /></label>
          <label className="filter-field"><span>EMAIL</span><input name="email" type="email" defaultValue={editing?.email ?? ""} readOnly={Boolean(editing)} required /></label>
          <label className="filter-field"><span>PASSWORD</span><input name="password" type="password" placeholder={editing ? "Leave blank to keep current password" : "Enter password"} required={!editing} /></label>
          <label className="filter-field"><span>ROLE</span><select name="role" defaultValue={editing?.role ?? "RETENTION_AGENT"}><option value="ADMIN">Admin</option><option value="RETENTION_AGENT">Retention Agent</option></select></label>
          <div className="form-row-actions"><ActionMessage state={userState} />{editing && <button type="button" onClick={() => setEditing(null)}>Cancel edit</button>}<SubmitButton>{editing ? "Save changes" : "Create user"}</SubmitButton></div>
        </form>
      </section>

      <section className="settings-section">
        <h2>Users</h2>
        <ActionMessage state={deleteState} />
        <div className="table-scroll">
          <table className="users-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Assigned</th><th>Actions</th></tr></thead>
            <tbody>{users.map((user) => {
              const isCurrentUser = user.id === currentUserId;
              return <tr key={user.id}>
              <td>{user.fullName}{!user.active && <small className="muted">Inactive</small>}</td>
              <td>{user.email}</td>
              <td><span className={`role-badge role-${user.role.toLocaleLowerCase().replaceAll("_", "-")}`}>{ROLE_LABELS[user.role]}</span></td>
              <td>{user.assignedLeadCount}</td>
              <td className="actions-cell">
                <button type="button" onClick={() => setEditing(user)}><Edit3 size={13} />Edit</button>
                {isCurrentUser ? <span className="muted">Current user</span> : <form action={deleteAction} onSubmit={(event) => { if (!confirm(`${user.assignedLeadCount} lead(s) will become unassigned. Delete ${user.fullName}?`)) event.preventDefault(); }}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button className="danger-link" type="submit"><Trash2 size={13} />Delete</button>
                </form>}
              </td>
            </tr>;
            })}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}


