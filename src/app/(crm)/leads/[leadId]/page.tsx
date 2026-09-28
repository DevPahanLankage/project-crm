import { notFound } from "next/navigation";
import { LeadProfile } from "@/app/(crm)/leads/[leadId]/lead-profile";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getAuthorizedLead, getRetentionAgents, getSalesAgents } from "@/lib/leads/service";

export default async function LeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const [{ leadId }, user] = await Promise.all([params, requireAuthenticatedUser()]);
  const [lead, salesAgents, retentionAgents] = await Promise.all([
    getAuthorizedLead(user, leadId),
    user.role === "ADMIN" ? getSalesAgents() : Promise.resolve([]),
    user.role === "ADMIN" ? getRetentionAgents() : Promise.resolve([]),
  ]);

  if (!lead) notFound();
  return <LeadProfile lead={lead} salesAgents={salesAgents} retentionAgents={retentionAgents} viewer={user} />;
}
