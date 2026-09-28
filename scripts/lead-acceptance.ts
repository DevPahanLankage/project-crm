import assert from "node:assert/strict";
import { listMockLeads } from "../src/lib/leads/mock-repository";
import { parseLeadQuery } from "../src/lib/leads/query";
import type { AuthenticatedLeadUser } from "../src/lib/leads/types";
import { leadListHref } from "../src/lib/leads/url";

const admin: AuthenticatedLeadUser = { id: "dev-admin", role: "ADMIN" };
const agent: AuthenticatedLeadUser = { id: "dev-agent", role: "RETENTION_AGENT" };

async function result(params: Record<string, string> = {}, user: AuthenticatedLeadUser = admin) {
  return listMockLeads(user, parseLeadQuery(params));
}

async function main() {
const allAdmin = await result();
assert.equal(allAdmin.total, 112);
assert.equal(allAdmin.items.length, 25);
assert.equal(allAdmin.page, 1);
assert.ok(allAdmin.agents.length >= 2);

assert.ok((await result({ search: "Avery" })).total > 0);
assert.ok((await result({ search: "Quill" })).total > 0);
assert.equal((await result({ search: "00001" })).total, 1);
assert.ok((await result({ search: "CA" })).total > 0);
assert.ok((await result({ search: "Canada" })).total > 0);
assert.ok((await result({ status: "ACTIVE_VIP" })).total > 0);
assert.ok((await result({ agent: "unassigned" })).items.every((lead) => !lead.assignedAgent));
assert.ok((await result({ agent: "dev-agent-orbit", pageSize: "all" })).items.every((lead) => lead.assignedAgent?.id === "dev-agent-orbit"));
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
assert.ok(agentAll.total > 0 && agentAll.total < allAdmin.total);
assert.ok(agentAll.items.every((lead) => lead.assignedAgent?.id === agent.id));
assert.ok((await result({ agent: "unassigned", pageSize: "all" }, agent)).items.every((lead) => lead.assignedAgent?.id === agent.id));
assert.ok((await result({ search: "Avery", pageSize: "all" }, agent)).items.every((lead) => lead.assignedAgent?.id === agent.id));
assert.equal((await result({ search: "definitely-no-fictional-lead" }, agent)).total, 0);

const refreshState = leadListHref({ search: "Avery", status: "ACTIVE", sort: "client", direction: "asc", page: "2", pageSize: "50" }, {});
assert.match(refreshState, /search=Avery/);
assert.match(refreshState, /status=ACTIVE/);
assert.match(refreshState, /sort=client/);
assert.match(refreshState, /page=2/);
assert.match(refreshState, /pageSize=50/);

console.log("Lead acceptance checks passed.");
}

main();
