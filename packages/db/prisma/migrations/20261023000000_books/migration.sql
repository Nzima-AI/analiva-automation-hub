-- CreateEnum
CREATE TYPE "CaptureMode" AS ENUM ('ALWAYS_REVIEW', 'AUTO_WHEN_CONFIDENT', 'NEVER_REVIEW');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('BANK', 'CURRENT_ASSET', 'FIXED_ASSET', 'CURRENT_LIABILITY', 'LONG_TERM_LIABILITY', 'EQUITY', 'SALES', 'OTHER_INCOME', 'COST_OF_SALES', 'EXPENSE', 'INCOME_TAX');

-- CreateEnum
CREATE TYPE "JournalSource" AS ENUM ('INVOICE', 'PAYMENT', 'BANK', 'MANUAL', 'OPENING', 'REVERSAL');

-- CreateEnum
CREATE TYPE "BankTxnStatus" AS ENUM ('UNMATCHED', 'CODED', 'MATCHED', 'IGNORED');

-- CreateEnum
CREATE TYPE "RuleDirection" AS ENUM ('IN', 'OUT', 'ANY');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "autoFileThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
ADD COLUMN     "captureMode" "CaptureMode" NOT NULL DEFAULT 'AUTO_WHEN_CONFIDENT',
ADD COLUMN     "financialYearEndMonth" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "incorporationDate" DATE,
ADD COLUMN     "isCompany" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "payeRegistered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vatCategory" TEXT,
ADD COLUMN     "vatRegistered" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "accountCode" TEXT,
ADD COLUMN     "amountPaidCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "journalEntryId" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "defaultAccountCode" TEXT;

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "systemKey" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "source" "JournalSource" NOT NULL,
    "sourceId" TEXT,
    "reversesId" TEXT,
    "postedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "debitCents" BIGINT NOT NULL DEFAULT 0,
    "creditCents" BIGINT NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "accountLast4" TEXT,
    "ledgerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "balanceCents" BIGINT,
    "fingerprint" TEXT NOT NULL,
    "status" "BankTxnStatus" NOT NULL DEFAULT 'UNMATCHED',
    "accountCode" TEXT,
    "vatInclusive" BOOLEAN NOT NULL DEFAULT false,
    "invoiceId" TEXT,
    "journalEntryId" TEXT,
    "ruleId" TEXT,
    "matchReason" TEXT,
    "importBatch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankRule" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT,
    "matchText" TEXT NOT NULL,
    "direction" "RuleDirection" NOT NULL DEFAULT 'ANY',
    "accountCode" TEXT NOT NULL,
    "vatInclusive" BOOLEAN NOT NULL DEFAULT false,
    "timesApplied" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceFiling" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedByUserId" TEXT,
    "note" TEXT,

    CONSTRAINT "ComplianceFiling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerAccount_clientId_systemKey_idx" ON "LedgerAccount"("clientId", "systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_clientId_code_key" ON "LedgerAccount"("clientId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversesId_key" ON "JournalEntry"("reversesId");

-- CreateIndex
CREATE INDEX "JournalEntry_clientId_date_idx" ON "JournalEntry"("clientId", "date");

-- CreateIndex
CREATE INDEX "JournalEntry_clientId_source_sourceId_idx" ON "JournalEntry"("clientId", "source", "sourceId");

-- CreateIndex
CREATE INDEX "JournalLine_clientId_date_idx" ON "JournalLine"("clientId", "date");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_date_idx" ON "JournalLine"("accountId", "date");

-- CreateIndex
CREATE INDEX "BankTransaction_clientId_status_idx" ON "BankTransaction"("clientId", "status");

-- CreateIndex
CREATE INDEX "BankTransaction_clientId_date_idx" ON "BankTransaction"("clientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_bankAccountId_fingerprint_key" ON "BankTransaction"("bankAccountId", "fingerprint");

-- CreateIndex
CREATE INDEX "BankRule_practiceId_clientId_idx" ON "BankRule"("practiceId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceFiling_clientId_periodKey_key" ON "ComplianceFiling"("clientId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_journalEntryId_key" ON "Invoice"("journalEntryId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "BankRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankRule" ADD CONSTRAINT "BankRule_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankRule" ADD CONSTRAINT "BankRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceFiling" ADD CONSTRAINT "ComplianceFiling_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceFiling" ADD CONSTRAINT "ComplianceFiling_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Lock down the public API for the new tables (see 20261022000100_rls_and_search).
ALTER TABLE "LedgerAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceFiling" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "LedgerAccount", "JournalEntry", "JournalLine", "BankAccount", "BankTransaction", "BankRule", "ComplianceFiling" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "LedgerAccount", "JournalEntry", "JournalLine", "BankAccount", "BankTransaction", "BankRule", "ComplianceFiling" FROM authenticated';
  END IF;
END $$;
