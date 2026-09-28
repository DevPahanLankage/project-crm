"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  addDeposit,
  addNote,
  bulkAssignLeads,
  bulkDeleteLeads,
  bulkUnassignLeads,
  createOrUpdateUser,
  deleteLead,
  deletePinnedNote,
  deleteUser,
  distributeLeads,
  importLeadsFromExcel,
  toggleNotePin,
  updateActiveTeam,
  updateLeadProfile,
  updateRetentionAssignment,
  updateRetentionStatus,
  updateSalesAssignment,
  updateSalesStatus,
} from "@/lib/crm/mutations";
import type { ActionState } from "@/lib/leads/types";

function selectedIds(formData: FormData) {
  return formData.getAll("leadIds").map(String).filter(Boolean);
}

function selectedAgentIds(formData: FormData) {
  return formData.getAll("agentIds").map(String).filter(Boolean);
}

function revalidateLead(leadId?: string | null) {
  revalidatePath("/leads");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

export async function createOrUpdateUserAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await createOrUpdateUser(user, formData);
  revalidatePath("/admin");
  return result;
}

export async function deleteUserAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await deleteUser(user, String(formData.get("userId") ?? ""));
  revalidatePath("/admin");
  revalidatePath("/leads");
  return result;
}

export async function importLeadsAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a lead file." };
  const result = await importLeadsFromExcel(user, file);
  revalidatePath("/admin");
  revalidatePath("/leads");
  return result;
}

export async function updateSalesStatusAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await updateSalesStatus(user, formData);
  revalidateLead(String(formData.get("leadId") ?? ""));
  return result;
}

export async function updateRetentionStatusAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await updateRetentionStatus(user, formData);
  revalidateLead(String(formData.get("leadId") ?? ""));
  return result;
}

export async function updateActiveTeamAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await updateActiveTeam(user, formData);
  revalidateLead(String(formData.get("leadId") ?? ""));
  return result;
}

export async function updateSalesAssignmentAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await updateSalesAssignment(user, formData);
  revalidateLead(String(formData.get("leadId") ?? ""));
  return result;
}

export async function updateRetentionAssignmentAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await updateRetentionAssignment(user, formData);
  revalidateLead(String(formData.get("leadId") ?? ""));
  return result;
}

export async function updateLeadProfileAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await updateLeadProfile(user, formData);
  revalidateLead(String(formData.get("leadId") ?? ""));
  return result;
}

export async function addDepositAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await addDeposit(user, formData);
  revalidateLead(String(formData.get("leadId") ?? ""));
  return result;
}

export async function addNoteAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await addNote(user, formData);
  revalidateLead(String(formData.get("leadId") ?? ""));
  return result;
}

export async function toggleNotePinAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await toggleNotePin(user, String(formData.get("noteId") ?? ""));
  revalidateLead(String(formData.get("leadId") ?? ""));
}

export async function deletePinnedNoteAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await deletePinnedNote(user, String(formData.get("noteId") ?? ""));
  revalidateLead(String(formData.get("leadId") ?? ""));
  return result;
}

export async function deleteLeadAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await deleteLead(user, String(formData.get("leadId") ?? ""));
  revalidatePath("/leads");
  redirect("/leads");
}

export async function bulkAssignLeadsAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await bulkAssignLeads(user, selectedIds(formData), String(formData.get("assignedAgentId") ?? ""));
  revalidatePath("/leads");
  return result;
}

export async function bulkUnassignLeadsAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await bulkUnassignLeads(user, selectedIds(formData));
  revalidatePath("/leads");
  return result;
}

export async function bulkDeleteLeadsAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const result = await bulkDeleteLeads(user, selectedIds(formData));
  revalidatePath("/leads");
  return result;
}

export async function distributeLeadsAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const scope = String(formData.get("statusScope") ?? "all");
  const result = await distributeLeads(user, selectedIds(formData), selectedAgentIds(formData), scope === "all" ? "all" : scope as never);
  revalidatePath("/leads");
  return result;
}
