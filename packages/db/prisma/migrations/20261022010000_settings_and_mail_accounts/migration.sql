-- CreateEnum
CREATE TYPE "MailProvider" AS ENUM ('IMAP_SMTP', 'MICROSOFT_365', 'GMAIL');

-- CreateEnum
CREATE TYPE "MailPurpose" AS ENUM ('INBOUND', 'OUTBOUND', 'BOTH');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('UNTESTED', 'OK', 'ERROR');

-- AlterTable
ALTER TABLE "Practice" ADD COLUMN     "physicalAddress" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "MailAccount" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "provider" "MailProvider" NOT NULL DEFAULT 'IMAP_SMTP',
    "purpose" "MailPurpose" NOT NULL DEFAULT 'BOTH',
    "username" TEXT NOT NULL,
    "secretEncrypted" TEXT,
    "imapHost" TEXT,
    "imapPort" INTEGER DEFAULT 993,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "imapFolder" TEXT NOT NULL DEFAULT 'INBOX',
    "smtpHost" TEXT,
    "smtpPort" INTEGER DEFAULT 465,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "isDefaultSender" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'UNTESTED',
    "lastTestedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailAccount_practiceId_emailAddress_key" ON "MailAccount"("practiceId", "emailAddress");

-- AddForeignKey
ALTER TABLE "MailAccount" ADD CONSTRAINT "MailAccount_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Same lockdown as every other table (see 20261022000100_rls_and_search).
ALTER TABLE "MailAccount" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "MailAccount" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "MailAccount" FROM authenticated';
  END IF;
END $$;
