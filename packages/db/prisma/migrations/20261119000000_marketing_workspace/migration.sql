CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'CLOSED');
CREATE TYPE "LeadInterest" AS ENUM ('REPORTING', 'BOOKKEEPING', 'PAYROLL');
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'INBOX', 'REFERRAL', 'IMPORT', 'MANUAL');

CREATE TABLE "MarketingLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "practiceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "interest" "LeadInterest" NOT NULL,
    "source" "LeadSource" NOT NULL,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "ownerId" TEXT NOT NULL,
    "followUp" TEXT,
    "followUpDate" DATE,
    "consentAt" TIMESTAMP(3),
    "consentEvidence" TEXT,
    "optedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingLead_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "practiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "interest" "LeadInterest" NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingCampaign_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MarketingLead_practiceId_email_key" ON "MarketingLead"("practiceId", "email");
CREATE INDEX "MarketingLead_practiceId_interest_idx" ON "MarketingLead"("practiceId", "interest");
CREATE INDEX "MarketingLead_practiceId_updatedAt_id_idx" ON "MarketingLead"("practiceId", "updatedAt", "id");
CREATE INDEX "MarketingCampaign_practiceId_createdAt_id_idx" ON "MarketingCampaign"("practiceId", "createdAt", "id");

-- Staff access is through the tenant-scoped server connection.
ALTER TABLE "MarketingLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingCampaign" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "MarketingLead", "MarketingCampaign" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "MarketingLead", "MarketingCampaign" FROM authenticated;
  END IF;
END $$;
