import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCountry, normalizeCountryCode } from "@/lib/countries";

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
};

export type ExistingLeadImportIdentity = {
  email: string;
  phone: string;
};

export const DEFAULT_IMPORT_BATCH_SIZE = 500;

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

export function parseInitialDepositAmount(value: unknown) {
  if (value == null) return { ok: true as const, amount: null };
  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (!raw) return { ok: true as const, amount: null };

  const normalized = raw.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return { ok: false as const, message: "Invalid initial deposit amount." };

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
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  if (missing.length) return { headers, missing, validRows, rejected };

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const firstName = readString(row, HEADER_ALIASES.firstName);
    const lastName = readString(row, HEADER_ALIASES.lastName);
    const email = readString(row, HEADER_ALIASES.email).toLowerCase();
    const phone = readString(row, HEADER_ALIASES.phone);
    const countryCode = normalizeCountryCode(readString(row, HEADER_ALIASES.country));
    const affiliate = readString(row, HEADER_ALIASES.source) || null;
    const initialDeposit = parseInitialDepositAmount(readValue(row, HEADER_ALIASES.amount));

    if (!firstName || !lastName || !email || !phone) {
      rejected.push(`Row ${rowNumber}: missing required field.`);
      return;
    }
    if (!z.string().email().safeParse(email).success) {
      rejected.push(`Row ${rowNumber}: invalid email.`);
      return;
    }
    if (!/^\+?[0-9 ()-]{5,32}$/.test(phone)) {
      rejected.push(`Row ${rowNumber}: invalid phone.`);
      return;
    }
    if (countryCode && !getCountry(countryCode)) {
      rejected.push(`Row ${rowNumber}: invalid country code.`);
      return;
    }
    if (!initialDeposit.ok) {
      rejected.push(`Row ${rowNumber}: ${initialDeposit.message}`);
      return;
    }
    if (seenEmails.has(email) || seenPhones.has(phone)) {
      rejected.push(`Row ${rowNumber}: duplicate email or phone in file.`);
      return;
    }

    seenEmails.add(email);
    seenPhones.add(phone);
    validRows.push({ firstName, lastName, email, phone, countryCode, affiliate, initialDepositAmount: initialDeposit.amount, rowNumber });
  });

  return { headers, missing, validRows, rejected };
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
  const creatableRows: ValidLeadImportRow[] = [];
  let duplicateRows = 0;

  rows.forEach((row) => {
    if (duplicateEmails.has(row.email) || duplicatePhones.has(row.phone)) {
      duplicateRows += 1;
      rejected.push(`Row ${row.rowNumber}: duplicate email or phone already exists.`);
      return;
    }
    creatableRows.push(row);
  });

  return { creatableRows, duplicateRows, rejected };
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
