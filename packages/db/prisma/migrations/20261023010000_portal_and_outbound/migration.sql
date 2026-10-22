-- CreateEnum
CREATE TYPE "SendAs" AS ENUM ('PRACTICE', 'CLIENT');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('OPEN', 'AWAITING_CLIENT', 'RESOLVED');

-- CreateEnum
CREATE TYPE "EnquiryCategory" AS ENUM ('GENERAL', 'INVOICES', 'TAX', 'PAYROLL', 'CIPC', 'DOCUMENTS', 'REPORTS');

-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "defaultSendAs" "SendAs" NOT NULL DEFAULT 'PRACTICE',
ADD COLUMN     "portalShowsBooks" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Enquiry" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" "EnquiryCategory" NOT NULL DEFAULT 'GENERAL',
    "status" "EnquiryStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT,
    "assignedToUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageFrom" TEXT NOT NULL DEFAULT 'CLIENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnquiryMessage" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorSide" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnquiryMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundEmail" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "sendAs" "SendAs" NOT NULL,
    "mandateId" TEXT,
    "mailAccountId" TEXT,
    "kind" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "replyTo" TEXT,
    "toAddress" TEXT NOT NULL,
    "cc" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "status" "OutboundStatus" NOT NULL,
    "error" TEXT,
    "messageId" TEXT,
    "sentByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Enquiry_practiceId_status_lastMessageAt_idx" ON "Enquiry"("practiceId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Enquiry_clientId_lastMessageAt_idx" ON "Enquiry"("clientId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "EnquiryMessage_enquiryId_createdAt_idx" ON "EnquiryMessage"("enquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundEmail_clientId_createdAt_idx" ON "OutboundEmail"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundEmail_invoiceId_idx" ON "OutboundEmail"("invoiceId");

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryMessage" ADD CONSTRAINT "EnquiryMessage_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryMessage" ADD CONSTRAINT "EnquiryMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryMessage" ADD CONSTRAINT "EnquiryMessage_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Lock down the public API for the new tables (see 20261022000100_rls_and_search).
ALTER TABLE "Enquiry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EnquiryMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboundEmail" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "Enquiry", "EnquiryMessage", "OutboundEmail" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "Enquiry", "EnquiryMessage", "OutboundEmail" FROM authenticated';
  END IF;
END $$;
