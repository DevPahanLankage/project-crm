import { notFound } from "next/navigation";
import { LeadProfile } from "@/app/(crm)/leads/[leadId]/lead-profile";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getAuthorizedLead, getRetentionAgents } from "@/lib/leads/service";

export default async function LeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const [{ leadId }, user] = await Promise.all([params, requireAuthenticatedUser()]);
  const [lead, agents] = await Promise.all([
    getAuthorizedLead(user, leadId),
    user.role === "ADMIN" ? getRetentionAgents() : Promise.resolve([]),
  ]);

  if (!lead) notFound();
  return <LeadProfile lead={lead} agents={agents} isAdmin={user.role === "ADMIN"} />;
}
