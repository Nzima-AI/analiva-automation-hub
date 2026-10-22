-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('INVOICE', 'STATEMENT', 'CIPC', 'QUERY', 'OTHER');

-- CreateEnum
CREATE TYPE "CaptureStatus" AS ENUM ('NEEDS_CLIENT', 'NEEDS_REVIEW', 'SUGGESTED', 'FILED', 'DISMISSED', 'FAILED');

-- AlterEnum
ALTER TYPE "CaptureSource" ADD VALUE 'EMAIL';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "emailMessageId" TEXT;

-- AlterTable
ALTER TABLE "MailAccount" ADD COLUMN     "lastPollError" TEXT,
ADD COLUMN     "lastPolledAt" TIMESTAMP(3),
ADD COLUMN     "lastUid" INTEGER,
ADD COLUMN     "uidValidity" TEXT;

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT,
    "mailAccountId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "imapUid" INTEGER NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "textPreview" TEXT,
    "kind" "EmailKind" NOT NULL DEFAULT 'OTHER',
    "kindReason" TEXT,
    "matchStatus" TEXT NOT NULL,
    "matchCandidates" JSONB,
    "rawStoragePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capture" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT,
    "emailMessageId" TEXT,
    "documentId" TEXT NOT NULL,
    "status" "CaptureStatus" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "extracted" JSONB NOT NULL,
    "documentText" TEXT,
    "issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "invoiceId" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenderRule" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SenderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProfile" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "vatNumber" TEXT,
    "labels" JSONB NOT NULL DEFAULT '{}',
    "timesFiled" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureCorrection" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "extractedValue" TEXT,
    "correctedValue" TEXT,
    "learnedLabel" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptureCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailMessage_practiceId_receivedAt_idx" ON "EmailMessage"("practiceId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_mailAccountId_messageId_key" ON "EmailMessage"("mailAccountId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "Capture_invoiceId_key" ON "Capture"("invoiceId");

-- CreateIndex
CREATE INDEX "Capture_practiceId_status_idx" ON "Capture"("practiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SenderRule_practiceId_pattern_key" ON "SenderRule"("practiceId", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProfile_practiceId_key_key" ON "SupplierProfile"("practiceId", "key");

-- CreateIndex
CREATE INDEX "CaptureCorrection_practiceId_createdAt_idx" ON "CaptureCorrection"("practiceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_mailAccountId_fkey" FOREIGN KEY ("mailAccountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capture" ADD CONSTRAINT "Capture_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capture" ADD CONSTRAINT "Capture_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capture" ADD CONSTRAINT "Capture_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capture" ADD CONSTRAINT "Capture_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capture" ADD CONSTRAINT "Capture_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderRule" ADD CONSTRAINT "SenderRule_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderRule" ADD CONSTRAINT "SenderRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureCorrection" ADD CONSTRAINT "CaptureCorrection_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureCorrection" ADD CONSTRAINT "CaptureCorrection_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "Capture"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Lock down the public API for the new tables (see 20261022000100_rls_and_search).
ALTER TABLE "EmailMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Capture" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SenderRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CaptureCorrection" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "EmailMessage", "Capture", "SenderRule", "SupplierProfile", "CaptureCorrection" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "EmailMessage", "Capture", "SenderRule", "SupplierProfile", "CaptureCorrection" FROM authenticated';
  END IF;
END $$;
