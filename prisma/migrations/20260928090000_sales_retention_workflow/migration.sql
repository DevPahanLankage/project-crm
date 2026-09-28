-- Add Sales role for the combined Sales + Retention workflow.
ALTER TYPE "Role" ADD VALUE 'SALES_AGENT';

-- CreateEnum
CREATE TYPE "SalesStatus" AS ENUM ('NEW', 'CONTACTED', 'NO_ANSWER', 'INTERESTED', 'PAYMENT_PENDING', 'CONVERTED', 'NO_INTEREST');

-- CreateEnum
CREATE TYPE "LeadActiveTeam" AS ENUM ('OPEN', 'SALES', 'RETENTION');

-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('USER', 'SYSTEM');

-- Add new workflow columns while keeping the legacy assignedAgentId field for a staged transition.
ALTER TABLE "Lead" ADD COLUMN "salesStatus" "SalesStatus" NOT NULL DEFAULT 'NEW';
ALTER TABLE "Lead" ADD COLUMN "activeTeam" "LeadActiveTeam" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "Lead" ADD COLUMN "salesAgentId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "retentionAgentId" TEXT;

-- Reuse existing retention assignment data.
UPDATE "Lead"
SET "retentionAgentId" = "assignedAgentId";

-- Preserve existing retention-owned data while allowing untouched unassigned NEW leads to start OPEN.
UPDATE "Lead"
SET "activeTeam" = CASE
  WHEN "assignedAgentId" IS NOT NULL OR "retentionStatus" <> 'NEW' THEN 'RETENTION'::"LeadActiveTeam"
  ELSE 'OPEN'::"LeadActiveTeam"
END;

-- System notes do not require a fake user.
ALTER TABLE "Note" ADD COLUMN "kind" "NoteKind" NOT NULL DEFAULT 'USER';
ALTER TABLE "Note" ALTER COLUMN "createdByUserId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Lead_salesStatus_idx" ON "Lead"("salesStatus");
CREATE INDEX "Lead_activeTeam_idx" ON "Lead"("activeTeam");
CREATE INDEX "Lead_salesAgentId_idx" ON "Lead"("salesAgentId");
CREATE INDEX "Lead_retentionAgentId_idx" ON "Lead"("retentionAgentId");
CREATE INDEX "Lead_activeTeam_createdAt_idx" ON "Lead"("activeTeam", "createdAt");
CREATE INDEX "Lead_salesAgentId_createdAt_idx" ON "Lead"("salesAgentId", "createdAt");
CREATE INDEX "Lead_retentionAgentId_createdAt_idx" ON "Lead"("retentionAgentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_salesAgentId_fkey" FOREIGN KEY ("salesAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_retentionAgentId_fkey" FOREIGN KEY ("retentionAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
