import type { Role } from "@prisma/client";

export type BulkAssignmentTeam = "SALES" | "RETENTION";

export function bulkAssignmentAgentRole(team: BulkAssignmentTeam): Extract<Role, "SALES_AGENT" | "RETENTION_AGENT"> {
  return team === "SALES" ? "SALES_AGENT" : "RETENTION_AGENT";
}

export function bulkAssignmentLabel(team: BulkAssignmentTeam) {
  return team === "SALES" ? "Sales" : "Retention";
}

export function bulkAssignData(team: BulkAssignmentTeam, agentId: string) {
  return team === "SALES"
    ? { salesAgentId: agentId }
    : { retentionAgentId: agentId, assignedAgentId: agentId };
}

export function bulkUnassignData(team: BulkAssignmentTeam) {
  return team === "SALES"
    ? { salesAgentId: null }
    : { retentionAgentId: null, assignedAgentId: null };
}
