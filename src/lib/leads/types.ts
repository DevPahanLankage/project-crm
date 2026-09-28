import type { AccountStatus, RetentionStatus, Role } from "@prisma/client";

export const RETENTION_STATUSES: readonly RetentionStatus[] = [
  "NEW", "NO_ANSWER", "NO_INTEREST", "POTENTIAL_LOW", "ACTIVE", "ACTIVE_VIP", "DEPOSITED",
];

export const RETENTION_STATUS_LABELS: Record<RetentionStatus, string> = {
  NEW: "NEW",
  NO_ANSWER: "NO ANSWER",
  NO_INTEREST: "NO INTEREST",
  POTENTIAL_LOW: "POTENTIAL LOW",
  ACTIVE: "ACTIVE",
  ACTIVE_VIP: "ACTIVE VIP",
  DEPOSITED: "DEPOSITED",
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  RETENTION_AGENT: "Retention Agent",
};

export type LeadSort = "client" | "country" | "balance" | "registration" | "lastNote" | "retentionStatus";
export type SortDirection = "asc" | "desc";
export type PageSize = 25 | 50 | 100 | "all";

export type LeadQuery = {
  search: string;
  leadId: string;
  country: string[];
  name: string;
  status: RetentionStatus | null;
  agent: string;
  registrationFrom: Date | null;
  registrationTo: Date | null;
  ftdFrom: Date | null;
  ftdTo: Date | null;
  firstNoteFrom: Date | null;
  firstNoteTo: Date | null;
  lastNoteFrom: Date | null;
  lastNoteTo: Date | null;
  sort: LeadSort;
  direction: SortDirection;
  page: number;
  pageSize: PageSize;
};

export type AgentOption = { id: string; fullName: string };
export type CountryFilterOption = { code: string; name: string; count: number };

export type LeadListItem = {
  id: string;
  firstName: string;
  lastName: string;
  countryCode: string | null;
  totalBalance: string;
  retentionStatus: RetentionStatus;
  assignedAgent: AgentOption | null;
  createdAt: Date;
  firstDeposit: { amount: string; at: Date } | null;
  lastDeposit: { amount: string; at: Date } | null;
  firstNoteAt: Date | null;
  lastNote: { at: Date; author: string | null; preview: string | null } | null;
};

export type LeadPageResult = {
  items: LeadListItem[];
  total: number;
  page: number;
  agents: AgentOption[];
  countryOptions: CountryFilterOption[];
};

export type DepositItem = {
  id: string;
  amount: string;
  createdAt: Date;
  createdBy: AgentOption;
};

export type NoteItem = {
  id: string;
  body: string;
  isPinned: boolean;
  createdAt: Date;
  createdBy: AgentOption & { role: Role };
};

export type LeadDetail = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  alternateEmail: string | null;
  phone: string;
  alternatePhone: string | null;
  countryCode: string | null;
  prefix: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  language: string | null;
  timeZone: string | null;
  additionalInfo: string | null;
  affiliate: string | null;
  accountStatus: AccountStatus;
  retentionStatus: RetentionStatus;
  assignedAgent: AgentOption | null;
  totalBalance: string;
  createdAt: Date;
  updatedAt: Date;
  firstDeposit: DepositItem | null;
  lastDeposit: DepositItem | null;
  deposits: DepositItem[];
  notes: NoteItem[];
  pinnedNotes: NoteItem[];
};

export type UserListItem = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
  assignedLeadCount: number;
  createdAt: Date;
};

export type AuthenticatedLeadUser = { id: string; role: "ADMIN" | "RETENTION_AGENT" };
export type ActionState = { ok: boolean; message: string; errors?: Record<string, string[]> };

export const emptyActionState: ActionState = { ok: false, message: "" };
