import "server-only";

import { isDevMockAuthEnabled } from "@/lib/auth";
import type { AuthenticatedLeadUser, LeadDetail, LeadPageResult, LeadQuery, UserListItem } from "@/lib/leads/types";

export async function listAuthorizedLeads(user: AuthenticatedLeadUser, query: LeadQuery): Promise<LeadPageResult> {
  if (isDevMockAuthEnabled()) {
    const { listMockLeads } = await import("@/lib/leads/mock-repository");
    return listMockLeads(user, query);
  }

  const { listPrismaLeads } = await import("@/lib/leads/prisma-repository");
  return listPrismaLeads(user, query);
}

export async function getAuthorizedLead(user: AuthenticatedLeadUser, leadId: string): Promise<LeadDetail | null> {
  const { getAuthorizedLeadDetail } = await import("@/lib/leads/prisma-repository");
  return getAuthorizedLeadDetail(user, leadId);
}

export async function getRetentionAgents() {
  const { listActiveRetentionAgents } = await import("@/lib/leads/prisma-repository");
  return listActiveRetentionAgents();
}

export async function getUsersForAdmin(): Promise<UserListItem[]> {
  const { listUsersForAdmin } = await import("@/lib/leads/prisma-repository");
  return listUsersForAdmin();
}
