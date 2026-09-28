import assert from "node:assert/strict";
import { listMockLeads } from "../src/lib/leads/mock-repository";
import { canAddDeposit, canAddNote, canEditRetentionStatus, canEditSalesStatus, canUpdateActiveTeam, canViewLead } from "../src/lib/leads/permissions";
import { parseLeadQuery } from "../src/lib/leads/query";
import { ACTIVE_TEAMS, type AuthenticatedLeadUser } from "../src/lib/leads/types";
import { leadListHref } from "../src/lib/leads/url";

const admin: AuthenticatedLeadUser = { id: "dev-admin", role: "ADMIN" };
const agent: AuthenticatedLeadUser = { id: "dev-agent", role: "RETENTION_AGENT" };
const otherAgent: AuthenticatedLeadUser = { id: "dev-agent-orbit", role: "RETENTION_AGENT" };
const sales: AuthenticatedLeadUser = { id: "dev-sales", role: "SALES_AGENT" };
const otherSales: AuthenticatedLeadUser = { id: "dev-sales-nova", role: "SALES_AGENT" };

async function result(params: Record<string, string> = {}, user: AuthenticatedLeadUser = admin) {
  return listMockLeads(user, parseLeadQuery(params));
}

async function main() {
const allAdmin = await result();
assert.equal(allAdmin.total, 112);
assert.equal(allAdmin.items.length, 25);
assert.equal(allAdmin.page, 1);
assert.ok(allAdmin.retentionAgents.length >= 2);

assert.ok((await result({ search: "Avery" })).total > 0);
assert.ok((await result({ search: "Quill" })).total > 0);
assert.equal((await result({ search: "00001" })).total, 1);
assert.ok((await result({ search: "CA" })).total > 0);
assert.ok((await result({ search: "Canada" })).total > 0);
assert.ok((await result({ retentionStatus: "ACTIVE_VIP" })).total > 0);
assert.ok((await result({ salesStatus: "CONTACTED" })).total > 0);
assert.ok((await result({ activeTeam: "OPEN" })).items.every((lead) => lead.activeTeam === "OPEN"));
assert.ok((await result({ retentionAgent: "unassigned" })).items.every((lead) => !lead.retentionAgent));
assert.ok((await result({ retentionAgent: "dev-agent-orbit", pageSize: "all" })).items.every((lead) => lead.retentionAgent?.id === "dev-agent-orbit"));
assert.ok((await result({ registrationFrom: "2026-01-01" })).total < allAdmin.total);
assert.ok((await result({ ftdFrom: "2025-01-01" })).total > 0);
assert.ok((await result({ firstNoteFrom: "2025-01-01" })).total > 0);
assert.ok((await result({ lastNoteFrom: "2025-01-01" })).total > 0);

const sorted = await result({ sort: "balance", direction: "asc", pageSize: "all" });
assert.ok(sorted.items.every((lead, index) => index === 0 || Number(sorted.items[index - 1].totalBalance) <= Number(lead.totalBalance)));
assert.equal((await result({ pageSize: "50" })).items.length, 50);
assert.equal((await result({ pageSize: "100" })).items.length, 100);
assert.equal((await result({ pageSize: "all" })).items.length, 112);
assert.equal((await result({ page: "2" })).items.length, 25);

const agentAll = await result({ pageSize: "all" }, agent);
assert.ok(agentAll.total > 0 && agentAll.total <= allAdmin.total);
assert.ok(agentAll.items.every((lead) => lead.activeTeam === "OPEN" || lead.activeTeam === "SALES" || lead.retentionAgent?.id === agent.id));
assert.ok((await result({ retentionAgent: "unassigned", pageSize: "all" }, agent)).items.every((lead) => lead.activeTeam === "OPEN" || lead.activeTeam === "SALES" || lead.retentionAgent?.id === agent.id));
assert.ok((await result({ search: "Avery", pageSize: "all" }, agent)).items.every((lead) => lead.activeTeam === "OPEN" || lead.activeTeam === "SALES" || lead.retentionAgent?.id === agent.id));
assert.equal((await result({ search: "definitely-no-fictional-lead" }, agent)).total, 0);

const salesAll = await result({ pageSize: "all" }, sales);
assert.ok(salesAll.total > 0 && salesAll.total <= allAdmin.total);
assert.ok(salesAll.items.every((lead) => lead.activeTeam === "OPEN" || lead.salesAgent?.id === sales.id || (lead.activeTeam === "SALES" && !lead.salesAgent)));

const openUnassigned = { activeTeam: "OPEN" as const, salesAgentId: null, retentionAgentId: null };
assert.ok(canViewLead(sales, openUnassigned));
assert.ok(canViewLead(agent, openUnassigned));
assert.ok(canEditSalesStatus(sales, openUnassigned));
assert.ok(canEditRetentionStatus(agent, openUnassigned));
assert.ok(canAddNote(sales, openUnassigned));
assert.ok(canAddNote(agent, openUnassigned));
assert.ok(canAddDeposit(sales, openUnassigned));

const openAssignedSales = { activeTeam: "OPEN" as const, salesAgentId: sales.id, retentionAgentId: null };
assert.ok(canEditSalesStatus(sales, openAssignedSales));
assert.equal(canEditSalesStatus(otherSales, openAssignedSales), false);
assert.ok(canAddDeposit(sales, openAssignedSales));
assert.equal(canAddDeposit(otherSales, openAssignedSales), false);

const openAssignedRetention = { activeTeam: "OPEN" as const, salesAgentId: null, retentionAgentId: agent.id };
assert.ok(canEditRetentionStatus(agent, openAssignedRetention));
assert.equal(canEditRetentionStatus(otherAgent, openAssignedRetention), false);

const salesOwned = { activeTeam: "SALES" as const, salesAgentId: sales.id, retentionAgentId: null };
assert.ok(canEditSalesStatus(sales, salesOwned));
assert.equal(canEditSalesStatus(otherSales, salesOwned), false);
assert.ok(canAddDeposit(sales, salesOwned));
assert.equal(canAddDeposit(otherSales, salesOwned), false);
assert.equal(canAddNote(otherSales, salesOwned), false);
assert.equal(canEditSalesStatus(agent, salesOwned), false);
assert.equal(canAddDeposit(agent, salesOwned), false);
assert.ok(canEditRetentionStatus(agent, salesOwned));

const retentionOwned = { activeTeam: "RETENTION" as const, salesAgentId: sales.id, retentionAgentId: agent.id };
assert.ok(canViewLead(sales, retentionOwned));
assert.equal(canEditSalesStatus(sales, retentionOwned), false);
assert.equal(canAddDeposit(sales, retentionOwned), false);
assert.equal(canAddNote(sales, retentionOwned), false);
assert.ok(canEditRetentionStatus(agent, retentionOwned));
assert.equal(canEditRetentionStatus(otherAgent, retentionOwned), false);
assert.ok(canEditSalesStatus(admin, retentionOwned));
assert.ok(canEditRetentionStatus(admin, retentionOwned));
assert.ok(canAddDeposit(admin, retentionOwned));
assert.ok(canUpdateActiveTeam(admin));
assert.deepEqual([...ACTIVE_TEAMS], ["OPEN", "SALES", "RETENTION"]);
assert.equal(canUpdateActiveTeam(sales), false);
assert.equal(canUpdateActiveTeam(agent), false);

const refreshState = leadListHref({ search: "Avery", retentionStatus: "ACTIVE", sort: "client", direction: "asc", page: "2", pageSize: "50" }, {});
assert.match(refreshState, /search=Avery/);
assert.match(refreshState, /retentionStatus=ACTIVE/);
assert.match(refreshState, /sort=client/);
assert.match(refreshState, /page=2/);
assert.match(refreshState, /pageSize=50/);

console.log("Lead acceptance checks passed.");
}

main();
