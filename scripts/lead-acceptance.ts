import assert from "node:assert/strict";
import { calculateDepositSummary, depositBelongsToLead } from "../src/lib/crm/deposit-summary";
import { buildLeadImportCreatePlan, validateLeadImportRows } from "../src/lib/crm/import-leads";
import { listMockLeads } from "../src/lib/leads/mock-repository";
import { canAddDeposit, canAddNote, canDeleteDeposit, canEditRetentionStatus, canEditSalesStatus, canUpdateActiveTeam, canViewLead } from "../src/lib/leads/permissions";
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

function countryCountMap(leads: Array<{ countryCode: string | null }>) {
  const counts = new Map<string, number>();
  leads.forEach((lead) => {
    if (lead.countryCode) counts.set(lead.countryCode, (counts.get(lead.countryCode) ?? 0) + 1);
  });
  return counts;
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
assert.ok(agentAll.items.every((lead) => lead.retentionAgent?.id === agent.id));
assert.equal(agentAll.total, agentAll.items.length);
assert.equal(agentAll.items.some((lead) => !lead.retentionAgent), false);
assert.equal(agentAll.items.some((lead) => lead.retentionAgent?.id === otherAgent.id), false);
assert.equal((await result({ search: "definitely-no-fictional-lead" }, agent)).total, 0);
const otherRetentionLead = (await result({ retentionAgent: otherAgent.id, pageSize: "all" })).items[0];
assert.ok(otherRetentionLead);
assert.equal((await result({ search: otherRetentionLead.id, pageSize: "all" }, agent)).total, 0);
assert.equal((await result({ retentionStatus: otherRetentionLead.retentionStatus, pageSize: "all" }, agent)).items.every((lead) => lead.retentionAgent?.id === agent.id), true);
const agentCountryCounts = countryCountMap(agentAll.items);
assert.deepEqual(new Map(agentAll.countryOptions.map((option) => [option.code, option.count])), agentCountryCounts);

const salesAll = await result({ pageSize: "all" }, sales);
assert.ok(salesAll.total > 0 && salesAll.total <= allAdmin.total);
assert.ok(salesAll.items.every((lead) => lead.salesAgent?.id === sales.id));
assert.equal(salesAll.total, salesAll.items.length);
assert.equal(salesAll.items.some((lead) => !lead.salesAgent), false);
assert.equal(salesAll.items.some((lead) => lead.salesAgent?.id === otherSales.id), false);
const otherSalesLead = (await result({ salesAgent: otherSales.id, pageSize: "all" })).items[0];
assert.ok(otherSalesLead);
assert.equal((await result({ search: otherSalesLead.id, pageSize: "all" }, sales)).total, 0);
const unassignedLead = (await result({ salesAgent: "unassigned", pageSize: "all" })).items.find((lead) => !lead.salesAgent && !lead.retentionAgent);
assert.ok(unassignedLead);
assert.equal((await result({ search: unassignedLead.id, pageSize: "all" }, sales)).total, 0);
assert.equal((await result({ search: unassignedLead.id, pageSize: "all" }, agent)).total, 0);
const salesCountryCounts = countryCountMap(salesAll.items);
assert.deepEqual(new Map(salesAll.countryOptions.map((option) => [option.code, option.count])), salesCountryCounts);

const openUnassigned = { activeTeam: "OPEN" as const, salesAgentId: null, retentionAgentId: null };
assert.ok(canViewLead(admin, openUnassigned));
assert.equal(canViewLead(sales, openUnassigned), false);
assert.equal(canViewLead(agent, openUnassigned), false);
assert.equal(canEditSalesStatus(sales, openUnassigned), false);
assert.equal(canEditRetentionStatus(agent, openUnassigned), false);
assert.equal(canAddNote(sales, openUnassigned), false);
assert.equal(canAddNote(agent, openUnassigned), false);
assert.equal(canAddDeposit(sales, openUnassigned), false);

const openAssignedSales = { activeTeam: "OPEN" as const, salesAgentId: sales.id, retentionAgentId: null };
assert.ok(canViewLead(sales, openAssignedSales));
assert.equal(canViewLead(agent, openAssignedSales), false);
assert.ok(canEditSalesStatus(sales, openAssignedSales));
assert.equal(canEditSalesStatus(otherSales, openAssignedSales), false);
assert.ok(canAddDeposit(sales, openAssignedSales));
assert.equal(canAddDeposit(otherSales, openAssignedSales), false);

const openAssignedRetention = { activeTeam: "OPEN" as const, salesAgentId: null, retentionAgentId: agent.id };
assert.ok(canViewLead(agent, openAssignedRetention));
assert.equal(canViewLead(sales, openAssignedRetention), false);
assert.ok(canEditRetentionStatus(agent, openAssignedRetention));
assert.equal(canEditRetentionStatus(otherAgent, openAssignedRetention), false);

const salesOwned = { activeTeam: "SALES" as const, salesAgentId: sales.id, retentionAgentId: null };
assert.ok(canViewLead(sales, salesOwned));
assert.equal(canViewLead(otherSales, salesOwned), false);
assert.equal(canViewLead(agent, salesOwned), false);
assert.ok(canEditSalesStatus(sales, salesOwned));
assert.equal(canEditSalesStatus(otherSales, salesOwned), false);
assert.ok(canAddDeposit(sales, salesOwned));
assert.equal(canAddDeposit(otherSales, salesOwned), false);
assert.equal(canAddNote(otherSales, salesOwned), false);
assert.equal(canEditSalesStatus(agent, salesOwned), false);
assert.equal(canAddDeposit(agent, salesOwned), false);
assert.equal(canEditRetentionStatus(agent, salesOwned), false);

const salesAndRetentionAssignedDuringSales = { activeTeam: "SALES" as const, salesAgentId: sales.id, retentionAgentId: agent.id };
assert.ok(canViewLead(sales, salesAndRetentionAssignedDuringSales));
assert.ok(canViewLead(agent, salesAndRetentionAssignedDuringSales));
assert.ok(canEditRetentionStatus(agent, salesAndRetentionAssignedDuringSales));

const retentionOwned = { activeTeam: "RETENTION" as const, salesAgentId: sales.id, retentionAgentId: agent.id };
assert.ok(canViewLead(sales, retentionOwned));
assert.ok(canViewLead(agent, retentionOwned));
assert.equal(canViewLead(otherSales, retentionOwned), false);
assert.equal(canViewLead(otherAgent, retentionOwned), false);
assert.equal(canEditSalesStatus(sales, retentionOwned), false);
assert.equal(canAddDeposit(sales, retentionOwned), false);
assert.equal(canAddNote(sales, retentionOwned), false);
assert.ok(canEditRetentionStatus(agent, retentionOwned));
assert.equal(canEditRetentionStatus(otherAgent, retentionOwned), false);
assert.ok(canEditSalesStatus(admin, retentionOwned));
assert.ok(canEditRetentionStatus(admin, retentionOwned));
assert.ok(canAddDeposit(admin, retentionOwned));
assert.ok(canDeleteDeposit(admin));
assert.equal(canDeleteDeposit(sales), false);
assert.equal(canDeleteDeposit(agent), false);
assert.ok(canUpdateActiveTeam(admin));
assert.deepEqual([...ACTIVE_TEAMS], ["OPEN", "SALES", "RETENTION"]);
assert.equal(canUpdateActiveTeam(sales), false);
assert.equal(canUpdateActiveTeam(agent), false);

const depositOne = { id: "deposit-1", leadId: "lead-1", amount: "100.00", createdAt: new Date("2026-01-01T10:00:00.000Z") };
const depositTwo = { id: "deposit-2", leadId: "lead-1", amount: "200.00", createdAt: new Date("2026-01-02T10:00:00.000Z") };
const depositThree = { id: "deposit-3", leadId: "lead-1", amount: "300.00", createdAt: new Date("2026-01-03T10:00:00.000Z") };
const deposits = [depositOne, depositTwo, depositThree];
const onlyDepositDeleted = calculateDepositSummary([]);
assert.equal(onlyDepositDeleted.totalBalance.toFixed(2), "0.00");
assert.equal(onlyDepositDeleted.firstDepositAt, null);
assert.equal(onlyDepositDeleted.lastDepositAt, null);
const firstDepositDeleted = calculateDepositSummary(deposits.filter((deposit) => deposit.id !== depositOne.id));
assert.equal(firstDepositDeleted.totalBalance.toFixed(2), "500.00");
assert.equal(firstDepositDeleted.firstDepositAt?.getTime(), depositTwo.createdAt.getTime());
assert.equal(firstDepositDeleted.lastDepositAt?.getTime(), depositThree.createdAt.getTime());
const latestDepositDeleted = calculateDepositSummary(deposits.filter((deposit) => deposit.id !== depositThree.id));
assert.equal(latestDepositDeleted.totalBalance.toFixed(2), "300.00");
assert.equal(latestDepositDeleted.firstDepositAt?.getTime(), depositOne.createdAt.getTime());
assert.equal(latestDepositDeleted.lastDepositAt?.getTime(), depositTwo.createdAt.getTime());
const middleDepositDeleted = calculateDepositSummary(deposits.filter((deposit) => deposit.id !== depositTwo.id));
assert.equal(middleDepositDeleted.totalBalance.toFixed(2), "400.00");
assert.equal(middleDepositDeleted.firstDepositAt?.getTime(), depositOne.createdAt.getTime());
assert.equal(middleDepositDeleted.lastDepositAt?.getTime(), depositThree.createdAt.getTime());
assert.equal(depositBelongsToLead(null, "lead-1"), false);
assert.equal(depositBelongsToLead({ id: "deposit-404", leadId: "lead-2" }, "lead-1"), false);
assert.ok(depositBelongsToLead({ id: "deposit-1", leadId: "lead-1" }, "lead-1"));

const importRows = [
  { "First Name": "pecovaliz", "Last Name": "Walklerden", "E-mail": "pecovaliz@gmail.com", Number: "61429032508", Country: "AU", Source: "amoslimited", USD: "248.31" },
  { "First Name": "blank", "Last Name": "Amount", "E-mail": "blank@example.com", Number: "61429032509", Country: "GB", Source: "blanksource", USD: "" },
  { "First Name": "zero", "Last Name": "Amount", "E-mail": "zero@example.com", Number: "61429032510", Country: "US", Source: "zerosource", USD: "0.00" },
  { "First Name": "alias", "Last Name": "Amount", "E-mail": "alias@example.com", Number: "61429032511", Country: "CA", Source: "aliassource", Amount: "1,250.50" },
];
const importValidation = validateLeadImportRows(importRows);
assert.deepEqual(importValidation.missing, []);
assert.deepEqual(importValidation.rejected, []);
assert.equal(importValidation.validRows.length, 4);
assert.equal(importValidation.validRows[0].affiliate, "amoslimited");
assert.equal(importValidation.validRows[0].initialDepositAmount?.toFixed(2), "248.31");
const importedAt = new Date("2026-10-07T12:00:00.000Z");
const firstImportPlan = buildLeadImportCreatePlan(importValidation.validRows[0], importedAt, admin.id);
assert.equal(firstImportPlan.lead.affiliate, "amoslimited");
assert.equal(firstImportPlan.lead.totalBalance.toFixed(2), "248.31");
assert.equal(firstImportPlan.lead.firstDepositAt?.getTime(), importedAt.getTime());
assert.equal(firstImportPlan.lead.lastDepositAt?.getTime(), importedAt.getTime());
assert.equal(firstImportPlan.deposit?.amount.toFixed(2), "248.31");
assert.equal(firstImportPlan.deposit?.createdByUserId, admin.id);
assert.equal(firstImportPlan.deposit?.createdAt.getTime(), importedAt.getTime());
assert.equal("salesStatus" in firstImportPlan.lead, false);
assert.equal("retentionStatus" in firstImportPlan.lead, false);
assert.equal("activeTeam" in firstImportPlan.lead, false);
assert.equal(buildLeadImportCreatePlan(importValidation.validRows[1], importedAt, admin.id).deposit, null);
assert.equal(buildLeadImportCreatePlan(importValidation.validRows[1], importedAt, admin.id).lead.totalBalance.toFixed(2), "0.00");
assert.equal(buildLeadImportCreatePlan(importValidation.validRows[2], importedAt, admin.id).deposit, null);
assert.equal(buildLeadImportCreatePlan(importValidation.validRows[3], importedAt, admin.id).deposit?.amount.toFixed(2), "1250.50");
assert.equal(buildLeadImportCreatePlan(importValidation.validRows[3], importedAt, admin.id).lead.affiliate, "aliassource");
assert.equal(validateLeadImportRows([{ "First Name": "bad", "Last Name": "Amount", "E-mail": "bad@example.com", Number: "61429032512", Country: "AU", Source: "badsource", USD: "12.345" }]).rejected[0], "Row 2: Invalid initial deposit amount.");
const duplicateImportValidation = validateLeadImportRows([
  { "First Name": "dupe", "Last Name": "One", "E-mail": "dupe@example.com", Number: "61429032513", Country: "AU", Source: "dupesource", USD: "10" },
  { "First Name": "dupe", "Last Name": "Two", "E-mail": "dupe@example.com", Number: "61429032514", Country: "AU", Source: "dupesource", USD: "20" },
]);
assert.equal(duplicateImportValidation.validRows.length, 1);
assert.match(duplicateImportValidation.rejected[0], /duplicate email or phone/);
assert.equal(buildLeadImportCreatePlan(duplicateImportValidation.validRows[0], importedAt, admin.id).deposit?.amount.toFixed(2), "10.00");

const refreshState = leadListHref({ search: "Avery", retentionStatus: "ACTIVE", sort: "client", direction: "asc", page: "2", pageSize: "50" }, {});
assert.match(refreshState, /search=Avery/);
assert.match(refreshState, /retentionStatus=ACTIVE/);
assert.match(refreshState, /sort=client/);
assert.match(refreshState, /page=2/);
assert.match(refreshState, /pageSize=50/);

console.log("Lead acceptance checks passed.");
}

main();
