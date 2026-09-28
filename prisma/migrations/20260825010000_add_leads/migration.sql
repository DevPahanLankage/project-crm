-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('NOT_VERIFIED');

-- CreateEnum
CREATE TYPE "RetentionStatus" AS ENUM ('NEW', 'NO_ANSWER', 'NO_INTEREST', 'POTENTIAL_LOW', 'ACTIVE', 'ACTIVE_VIP', 'DEPOSITED');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "alternateEmail" TEXT,
    "phone" TEXT NOT NULL,
    "alternatePhone" TEXT,
    "countryCode" TEXT,
    "prefix" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "language" TEXT,
    "timeZone" TEXT,
    "additionalInfo" TEXT,
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'NOT_VERIFIED',
    "retentionStatus" "RetentionStatus" NOT NULL DEFAULT 'NEW',
    "assignedAgentId" TEXT,
    "totalBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "firstDepositAt" TIMESTAMP(3),
    "firstNoteAt" TIMESTAMP(3),
    "lastNoteAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_firstName_idx" ON "Lead"("firstName");
CREATE INDEX "Lead_lastName_idx" ON "Lead"("lastName");
CREATE INDEX "Lead_email_idx" ON "Lead"("email");
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");
CREATE INDEX "Lead_countryCode_idx" ON "Lead"("countryCode");
CREATE INDEX "Lead_retentionStatus_idx" ON "Lead"("retentionStatus");
CREATE INDEX "Lead_assignedAgentId_idx" ON "Lead"("assignedAgentId");
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");
CREATE INDEX "Lead_firstDepositAt_idx" ON "Lead"("firstDepositAt");
CREATE INDEX "Lead_firstNoteAt_idx" ON "Lead"("firstNoteAt");
CREATE INDEX "Lead_lastNoteAt_idx" ON "Lead"("lastNoteAt");
CREATE INDEX "Lead_assignedAgentId_createdAt_idx" ON "Lead"("assignedAgentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
