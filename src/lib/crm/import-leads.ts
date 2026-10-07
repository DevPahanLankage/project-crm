import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCountry, normalizeCountryCode } from "@/lib/countries";
import type { LeadImportRejectedRow, LeadImportReport } from "@/lib/leads/types";

export type ImportRow = Record<string, unknown>;

export type ValidLeadImportRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  countryCode: string | null;
  affiliate: string | null;
  initialDepositAmount: Prisma.Decimal | null;
  values: Record<string, string>;
};

export type ExistingLeadImportIdentity = {
  email: string;
  phone: string;
};

export const DEFAULT_IMPORT_BATCH_SIZE = 500;
export const REJECTED_ROW_PREVIEW_LIMIT = 100;

const HEADER_ALIASES = {
  firstName: ["First Name"],
  lastName: ["Last Name"],
  email: ["E-mail", "Email"],
  phone: ["Number", "Phone"],
  country: ["Country"],
  source: ["Source"],
  amount: ["USD", "Amount"],
} as const;

function hasAnyHeader(headers: string[], aliases: readonly string[]) {
  return aliases.some((alias) => headers.includes(alias));
}

function readValue(row: ImportRow, aliases: readonly string[]) {
  const header = aliases.find((alias) => Object.hasOwn(row, alias));
  return header ? row[header] : undefined;
}

function readString(row: ImportRow, aliases: readonly string[]) {
  const value = readValue(row, aliases);
  return value == null ? "" : String(value).trim();
}

function stringifyImportValue(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function importRowValues(row: ImportRow) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, stringifyImportValue(value)]));
}

function identifierFromRow(row: ImportRow) {
  const firstName = readString(row, HEADER_ALIASES.firstName);
  const lastName = readString(row, HEADER_ALIASES.lastName);
  const email = readString(row, HEADER_ALIASES.email);
  const phone = readString(row, HEADER_ALIASES.phone);
  const name = `${firstName} ${lastName}`.trim();
  return {
    email: email || null,
    phone: phone || null,
    name: name || null,
  };
}

export function rejectedImportRow(row: ImportRow, rowNumber: number, reason: string): LeadImportRejectedRow {
  return {
    rowNumber,
    reason,
    ...identifierFromRow(row),
    values: importRowValues(row),
  };
}

export function rejectedImportRowFromValid(row: ValidLeadImportRow, reason: string): LeadImportRejectedRow {
  return {
    rowNumber: row.rowNumber,
    reason,
    email: row.email || null,
    phone: row.phone || null,
    name: `${row.firstName} ${row.lastName}`.trim() || null,
    values: row.values,
  };
}

function rejectionMessage(rejection: LeadImportRejectedRow) {
  return `Row ${rejection.rowNumber}: ${rejection.reason}.`;
}

export function parseInitialDepositAmount(value: unknown) {
  if (value == null) return { ok: true as const, amount: null };
  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (!raw) return { ok: true as const, amount: null };

  const normalized = raw.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return { ok: false as const, message: "Invalid initial deposit amount" };

  const amount = new Prisma.Decimal(normalized).toDecimalPlaces(2);
  return amount.gt(0) ? { ok: true as const, amount } : { ok: true as const, amount: null };
}

export function validateLeadImportRows(rows: ImportRow[]) {
  const headers = Object.keys(rows[0] ?? {});
  const missing = [
    !hasAnyHeader(headers, HEADER_ALIASES.firstName) ? "First Name" : null,
    !hasAnyHeader(headers, HEADER_ALIASES.lastName) ? "Last Name" : null,
    !hasAnyHeader(headers, HEADER_ALIASES.email) ? "E-mail" : null,
    !hasAnyHeader(headers, HEADER_ALIASES.phone) ? "Number" : null,
    !hasAnyHeader(headers, HEADER_ALIASES.country) ? "Country" : null,
  ].filter((header): header is string => Boolean(header));

  const validRows: ValidLeadImportRow[] = [];
  const rejected: string[] = [];
  const rejectedRows: LeadImportRejectedRow[] = [];
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  if (missing.length) return { headers, missing, validRows, rejected, rejectedRows };

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const addRejected = (reason: string) => {
      const rejection = rejectedImportRow(row, rowNumber, reason);
      rejectedRows.push(rejection);
      rejected.push(rejectionMessage(rejection));
    };

    if (!row || typeof row !== "object" || Array.isArray(row)) {
      addRejected("Malformed row");
      return;
    }

    const firstName = readString(row, HEADER_ALIASES.firstName);
    const lastName = readString(row, HEADER_ALIASES.lastName);
    const email = readString(row, HEADER_ALIASES.email).toLowerCase();
    const phone = readString(row, HEADER_ALIASES.phone);
    const countryCode = normalizeCountryCode(readString(row, HEADER_ALIASES.country));
    const affiliate = readString(row, HEADER_ALIASES.source) || null;
    const initialDeposit = parseInitialDepositAmount(readValue(row, HEADER_ALIASES.amount));

    const missingFields = [
      !firstName ? "first name" : null,
      !lastName ? "last name" : null,
      !email ? "email" : null,
      !phone ? "phone" : null,
    ].filter((field): field is string => Boolean(field));
    if (missingFields.length) {
      addRejected(`Missing required ${missingFields.join(", ")}`);
      return;
    }
    if (!z.string().email().safeParse(email).success) {
      addRejected("Invalid email");
      return;
    }
    if (!/^\+?[0-9 ()-]{5,32}$/.test(phone)) {
      addRejected("Invalid phone");
      return;
    }
    if (countryCode && !getCountry(countryCode)) {
      addRejected("Invalid country code");
      return;
    }
    if (!initialDeposit.ok) {
      addRejected(initialDeposit.message);
      return;
    }
    if (seenEmails.has(email) || seenPhones.has(phone)) {
      addRejected("Duplicate lead");
      return;
    }

    seenEmails.add(email);
    seenPhones.add(phone);
    validRows.push({ firstName, lastName, email, phone, countryCode, affiliate, initialDepositAmount: initialDeposit.amount, rowNumber, values: importRowValues(row) });
  });

  return { headers, missing, validRows, rejected, rejectedRows };
}

export function chunkLeadImportRows<T>(rows: readonly T[], batchSize = DEFAULT_IMPORT_BATCH_SIZE) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("Batch size must be a positive integer.");
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    batches.push(rows.slice(index, index + batchSize));
  }
  return batches;
}

export function rejectExistingLeadDuplicates(rows: readonly ValidLeadImportRow[], existingLeads: readonly ExistingLeadImportIdentity[]) {
  const duplicateEmails = new Set(existingLeads.map((lead) => lead.email));
  const duplicatePhones = new Set(existingLeads.map((lead) => lead.phone));
  const rejected: string[] = [];
  const rejectedRows: LeadImportRejectedRow[] = [];
  const creatableRows: ValidLeadImportRow[] = [];
  let duplicateRows = 0;

  rows.forEach((row) => {
    if (duplicateEmails.has(row.email) || duplicatePhones.has(row.phone)) {
      duplicateRows += 1;
      const rejection = rejectedImportRowFromValid(row, "Duplicate lead");
      rejectedRows.push(rejection);
      rejected.push(rejectionMessage(rejection));
      return;
    }
    creatableRows.push(row);
  });

  return { creatableRows, duplicateRows, rejected, rejectedRows };
}

function csvEscape(value: unknown) {
  const text = stringifyImportValue(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

export function buildRejectedRowsCsv(headers: readonly string[], rejectedRows: readonly LeadImportRejectedRow[]) {
  const headerSet = new Set(headers);
  for (const rejection of rejectedRows) {
    Object.keys(rejection.values).forEach((header) => headerSet.add(header));
  }
  const originalHeaders = [...headerSet];
  const csvHeaders = ["Spreadsheet Row", ...originalHeaders, "Rejection Reason"];
  const lines = [
    csvHeaders.map(csvEscape).join(","),
    ...rejectedRows.map((rejection) => [
      rejection.rowNumber,
      ...originalHeaders.map((header) => rejection.values[header] ?? ""),
      rejection.reason,
    ].map(csvEscape).join(",")),
  ];
  return lines.join("\r\n");
}

export function buildLeadImportReport(params: {
  headers: readonly string[];
  totalRows: number;
  createdLeads: number;
  createdDeposits: number;
  duplicateRows: number;
  failedRows: number;
  rejectedRows: readonly LeadImportRejectedRow[];
}): LeadImportReport {
  return {
    totalRows: params.totalRows,
    createdLeads: params.createdLeads,
    createdDeposits: params.createdDeposits,
    duplicateRows: params.duplicateRows,
    rejectedRows: params.rejectedRows.length,
    failedRows: params.failedRows,
    rejectedPreviewLimit: REJECTED_ROW_PREVIEW_LIMIT,
    rejectedItems: params.rejectedRows.slice(0, REJECTED_ROW_PREVIEW_LIMIT),
    rejectedCsv: params.rejectedRows.length ? buildRejectedRowsCsv(params.headers, params.rejectedRows) : null,
  };
}

export function buildLeadImportCreatePlan(row: ValidLeadImportRow, importedAt: Date, createdByUserId: string) {
  return {
    lead: {
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      countryCode: row.countryCode,
      affiliate: row.affiliate,
      totalBalance: row.initialDepositAmount ?? new Prisma.Decimal(0),
      firstDepositAt: row.initialDepositAmount ? importedAt : null,
      lastDepositAt: row.initialDepositAmount ? importedAt : null,
    },
    deposit: row.initialDepositAmount
      ? {
          amount: row.initialDepositAmount,
          createdByUserId,
          createdAt: importedAt,
        }
      : null,
  };
}
