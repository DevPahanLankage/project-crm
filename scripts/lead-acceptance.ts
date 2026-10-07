import assert from "node:assert/strict";
import { calculateDepositSummary, depositBelongsToLead } from "../src/lib/crm/deposit-summary";
import { DEFAULT_IMPORT_BATCH_SIZE, REJECTED_ROW_PREVIEW_LIMIT, buildLeadImportCreatePlan, buildLeadImportReport, buildRejectedRowsCsv, chunkLeadImportRows, rejectExistingLeadDuplicates, rejectedImportRowFromValid, validateLeadImportRows } from "../src/lib/crm/import-leads";
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

function makeImportRow(index: number, overrides: Record<string, unknown> = {}) {
  return {
    "First Name": `Lead${index}`,
    "Last Name": "Import",
    "E-mail": `lead${index}@example.com`,
    Number: `61429${String(index).padStart(6, "0")}`,
    Country: "AU",
    Source: "batchsource",
    USD: "",
    ...overrides,
  };
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
const invalidAmountValidation = validateLeadImportRows([{ "First Name": "bad", "Last Name": "Amount", "E-mail": "bad@example.com", Number: "61429032512", Country: "AU", Source: "badsource", USD: "12.345" }]);
assert.equal(invalidAmountValidation.rejectedRows[0].rowNumber, 2);
assert.equal(invalidAmountValidation.rejectedRows[0].email, "bad@example.com");
assert.equal(invalidAmountValidation.rejectedRows[0].reason, "Invalid initial deposit amount");
assert.equal(invalidAmountValidation.rejected[0], "Row 2: Invalid initial deposit amount.");
const missingEmailValidation = validateLeadImportRows([{ "First Name": "missing", "Last Name": "Email", "E-mail": "", Number: "61429032515", Country: "AU", Source: "missingsource", USD: "" }]);
assert.equal(missingEmailValidation.rejectedRows[0].rowNumber, 2);
assert.equal(missingEmailValidation.rejectedRows[0].email, null);
assert.equal(missingEmailValidation.rejectedRows[0].reason, "Missing required email");
const duplicateImportValidation = validateLeadImportRows([
  { "First Name": "dupe", "Last Name": "One", "E-mail": "dupe@example.com", Number: "61429032513", Country: "AU", Source: "dupesource", USD: "10" },
  { "First Name": "dupe", "Last Name": "Two", "E-mail": "dupe@example.com", Number: "61429032514", Country: "AU", Source: "dupesource", USD: "20" },
]);
assert.equal(duplicateImportValidation.validRows.length, 1);
assert.equal(duplicateImportValidation.rejectedRows[0].reason, "Duplicate lead");
assert.equal(buildLeadImportCreatePlan(duplicateImportValidation.validRows[0], importedAt, admin.id).deposit?.amount.toFixed(2), "10.00");

const boundaryRows = Array.from({ length: DEFAULT_IMPORT_BATCH_SIZE + 1 }, (_, index) => makeImportRow(index + 1));
const boundaryValidation = validateLeadImportRows(boundaryRows);
assert.equal(boundaryValidation.validRows.length, DEFAULT_IMPORT_BATCH_SIZE + 1);
const boundaryBatches = chunkLeadImportRows(boundaryValidation.validRows);
assert.equal(boundaryBatches.length, 2);
assert.equal(boundaryBatches[0].length, DEFAULT_IMPORT_BATCH_SIZE);
assert.equal(boundaryBatches[1].length, 1);

const fifteenThousandRows = Array.from({ length: 15_000 }, (_, index) => makeImportRow(index + 10_000));
const fifteenThousandValidation = validateLeadImportRows(fifteenThousandRows);
assert.equal(fifteenThousandValidation.validRows.length, 15_000);
assert.equal(chunkLeadImportRows(fifteenThousandValidation.validRows).length, 30);

const acrossBatchDuplicateRows = [
  ...Array.from({ length: DEFAULT_IMPORT_BATCH_SIZE }, (_, index) => makeImportRow(index + 20_000)),
  makeImportRow(20_500, { "E-mail": "lead20001@example.com" }),
];
const acrossBatchDuplicateValidation = validateLeadImportRows(acrossBatchDuplicateRows);
assert.equal(acrossBatchDuplicateValidation.validRows.length, DEFAULT_IMPORT_BATCH_SIZE);
assert.equal(acrossBatchDuplicateValidation.rejectedRows[0].reason, "Duplicate lead");

const acrossBatchInvalidRows = [
  ...Array.from({ length: DEFAULT_IMPORT_BATCH_SIZE }, (_, index) => makeImportRow(index + 30_000)),
  makeImportRow(30_500, { Country: "ZZ" }),
  makeImportRow(30_501, { "E-mail": "not-an-email" }),
];
const acrossBatchInvalidValidation = validateLeadImportRows(acrossBatchInvalidRows);
assert.equal(acrossBatchInvalidValidation.validRows.length, DEFAULT_IMPORT_BATCH_SIZE);
assert.equal(acrossBatchInvalidValidation.rejected.length, 2);
assert.equal(acrossBatchInvalidValidation.rejectedRows[0].reason, "Invalid country code");
assert.equal(acrossBatchInvalidValidation.rejectedRows[1].reason, "Invalid email");

const databaseDuplicateValidation = validateLeadImportRows([makeImportRow(40_001), makeImportRow(40_002)]);
const databaseDuplicateResult = rejectExistingLeadDuplicates(databaseDuplicateValidation.validRows, [{ email: "lead40002@example.com", phone: "614290040002" }]);
assert.equal(databaseDuplicateResult.creatableRows.length, 1);
assert.equal(databaseDuplicateResult.duplicateRows, 1);
assert.equal(databaseDuplicateResult.rejectedRows[0].reason, "Duplicate lead");

const depositBatchValidation = validateLeadImportRows([
  makeImportRow(50_001, { USD: "100.00" }),
  ...Array.from({ length: DEFAULT_IMPORT_BATCH_SIZE }, (_, index) => makeImportRow(index + 50_002, { USD: index % 2 === 0 ? "25.50" : "" })),
]);
const depositBatches = chunkLeadImportRows(depositBatchValidation.validRows);
const plannedDeposits = depositBatches.flatMap((batch) => batch.map((row) => buildLeadImportCreatePlan(row, importedAt, admin.id))).filter((plan) => plan.deposit);
assert.equal(depositBatches.length, 2);
assert.equal(plannedDeposits.length, 251);

const rollbackRows = Array.from({ length: 1_200 }, (_, index) => makeImportRow(index + 60_000));
const rollbackBatches = chunkLeadImportRows(validateLeadImportRows(rollbackRows).validRows);
const committedRows: number[] = [];
const failedBatchIndex = 1;
rollbackBatches.forEach((batch, index) => {
  const pendingRows = batch.map((row) => row.rowNumber);
  if (index === failedBatchIndex) return;
  committedRows.push(...pendingRows);
});
assert.equal(rollbackBatches.length, 3);
assert.equal(committedRows.length, 700);
assert.equal(committedRows.includes(rollbackBatches[failedBatchIndex][0].rowNumber), false);
assert.ok(committedRows.includes(rollbackBatches[0][0].rowNumber));

const failedBatchRejections = rollbackBatches[failedBatchIndex].map((row) => rejectedImportRowFromValid(row, "Import batch failed. Please retry these rows"));
assert.equal(failedBatchRejections[0].rowNumber, rollbackBatches[failedBatchIndex][0].rowNumber);
assert.equal(failedBatchRejections[0].reason, "Import batch failed. Please retry these rows");

const exportRows = [invalidAmountValidation.rejectedRows[0], missingEmailValidation.rejectedRows[0], databaseDuplicateResult.rejectedRows[0], failedBatchRejections[0]];
const rejectedCsv = buildRejectedRowsCsv(invalidAmountValidation.headers, exportRows);
assert.match(rejectedCsv, /Spreadsheet Row,First Name,Last Name,E-mail,Number,Country,Source,USD,Rejection Reason/);
assert.match(rejectedCsv, /bad@example.com/);
assert.match(rejectedCsv, /Invalid initial deposit amount/);
assert.match(rejectedCsv, /Duplicate lead/);
const cappedReport = buildLeadImportReport({
  headers: invalidAmountValidation.headers,
  totalRows: 150,
  createdLeads: 0,
  createdDeposits: 0,
  duplicateRows: 1,
  failedRows: failedBatchRejections.length,
  rejectedRows: Array.from({ length: REJECTED_ROW_PREVIEW_LIMIT + 25 }, (_, index) => ({ ...exportRows[index % exportRows.length], rowNumber: index + 2 })),
});
assert.equal(cappedReport.rejectedItems.length, REJECTED_ROW_PREVIEW_LIMIT);
assert.equal(cappedReport.rejectedRows, REJECTED_ROW_PREVIEW_LIMIT + 25);
assert.ok(cappedReport.rejectedCsv?.includes("Rejection Reason"));

const refreshState = leadListHref({ search: "Avery", retentionStatus: "ACTIVE", sort: "client", direction: "asc", page: "2", pageSize: "50" }, {});
assert.match(refreshState, /search=Avery/);
assert.match(refreshState, /retentionStatus=ACTIVE/);
assert.match(refreshState, /sort=client/);
assert.match(refreshState, /page=2/);
assert.match(refreshState, /pageSize=50/);

console.log("Lead acceptance checks passed.");
}

main();
