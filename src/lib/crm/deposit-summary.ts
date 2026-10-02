import { Prisma } from "@prisma/client";

export type DepositSummaryInput = {
  amount: Prisma.Decimal | string | number;
  createdAt: Date;
};

export function formatUsdAmount(amount: Prisma.Decimal | string | number) {
  const value = new Prisma.Decimal(amount).toDecimalPlaces(2).toFixed(2);
  const [whole, decimal = "00"] = value.split(".");
  return `USD ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${decimal === "00" ? "" : `.${decimal}`}`;
}

export function depositBelongsToLead<T extends { leadId: string }>(deposit: T | null, leadId: string): deposit is T {
  return Boolean(deposit && deposit.leadId === leadId);
}

export function calculateDepositSummary(deposits: DepositSummaryInput[]) {
  return deposits.reduce(
    (summary, deposit) => {
      const createdAt = new Date(deposit.createdAt);
      return {
        totalBalance: summary.totalBalance.plus(new Prisma.Decimal(deposit.amount)),
        firstDepositAt: !summary.firstDepositAt || createdAt < summary.firstDepositAt ? createdAt : summary.firstDepositAt,
        lastDepositAt: !summary.lastDepositAt || createdAt > summary.lastDepositAt ? createdAt : summary.lastDepositAt,
      };
    },
    { totalBalance: new Prisma.Decimal(0), firstDepositAt: null as Date | null, lastDepositAt: null as Date | null },
  );
}
