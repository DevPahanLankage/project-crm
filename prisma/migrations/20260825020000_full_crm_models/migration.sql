-- Rename existing display name column to match the production CRM user model.
ALTER TABLE "User" RENAME COLUMN "name" TO "fullName";

-- Add denormalized timestamp used for efficient table display and date filtering.
ALTER TABLE "Lead" ADD COLUMN "lastDepositAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_lastDepositAt_idx" ON "Lead"("lastDepositAt");
CREATE INDEX "Deposit_leadId_createdAt_idx" ON "Deposit"("leadId", "createdAt");
CREATE INDEX "Deposit_createdByUserId_idx" ON "Deposit"("createdByUserId");
CREATE INDEX "Note_leadId_createdAt_idx" ON "Note"("leadId", "createdAt");
CREATE INDEX "Note_leadId_isPinned_idx" ON "Note"("leadId", "isPinned");
CREATE INDEX "Note_createdByUserId_idx" ON "Note"("createdByUserId");

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
