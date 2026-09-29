import type { LeadActiveTeam, Role } from "@prisma/client";
import type { AuthenticatedLeadUser } from "@/lib/leads/types";

export type LeadAccessShape = {
  activeTeam: LeadActiveTeam;
  salesAgentId: string | null;
  retentionAgentId: string | null;
};

export function isAdmin(user: AuthenticatedLeadUser) {
  return user.role === "ADMIN";
}

export function canViewLead(user: AuthenticatedLeadUser, lead: LeadAccessShape) {
  if (isAdmin(user)) return true;
  if (user.role === "SALES_AGENT") return lead.salesAgentId === user.id;
  if (user.role === "RETENTION_AGENT") return lead.retentionAgentId === user.id;
  return false;
}

export function canEditSalesStatus(user: AuthenticatedLeadUser, lead: LeadAccessShape) {
  if (isAdmin(user)) return true;
  if (user.role !== "SALES_AGENT") return false;
  if (!canViewLead(user, lead)) return false;
  if (lead.activeTeam === "RETENTION") return false;
  return true;
}

export function canEditRetentionStatus(user: AuthenticatedLeadUser, lead: LeadAccessShape) {
  if (isAdmin(user)) return true;
  if (user.role !== "RETENTION_AGENT") return false;
  return canViewLead(user, lead);
}

export function canAddNote(user: AuthenticatedLeadUser, lead: LeadAccessShape) {
  if (isAdmin(user)) return true;
  if (!canViewLead(user, lead)) return false;
  if (user.role === "SALES_AGENT") return lead.activeTeam !== "RETENTION";
  return user.role === "RETENTION_AGENT";
}

export function canToggleNotePin(user: AuthenticatedLeadUser, lead: LeadAccessShape) {
  return canAddNote(user, lead);
}

export function canAddDeposit(user: AuthenticatedLeadUser, lead: LeadAccessShape) {
  if (isAdmin(user)) return true;
  if (user.role !== "SALES_AGENT") return false;
  if (!canViewLead(user, lead)) return false;
  if (lead.activeTeam !== "OPEN" && lead.activeTeam !== "SALES") return false;
  return true;
}

export function canEditProfile(user: AuthenticatedLeadUser) {
  return isAdmin(user);
}

export function canAssignSalesAgent(user: AuthenticatedLeadUser) {
  return isAdmin(user);
}

export function canAssignRetentionAgent(user: AuthenticatedLeadUser) {
  return isAdmin(user);
}

export function canUpdateActiveTeam(user: AuthenticatedLeadUser) {
  return isAdmin(user);
}

export function roleCanBeSalesAgent(role: Role) {
  return role === "SALES_AGENT";
}

export function roleCanBeRetentionAgent(role: Role) {
  return role === "RETENTION_AGENT";
}
