-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "MarketingLead" ADD COLUMN     "bestHour" INTEGER,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "snoozedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MarketingCampaign" ADD COLUMN     "bestTime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "buttonActions" JSONB,
ADD COLUMN     "carouselMedia" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'MARKETING',
ADD COLUMN     "headerMediaUrl" TEXT,
ADD COLUMN     "headerType" TEXT,
ADD COLUMN     "testHours" INTEGER,
ADD COLUMN     "testPercent" INTEGER,
ADD COLUMN     "urlButton" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "variantLanguage" TEXT,
ADD COLUMN     "variantTemplate" TEXT,
ADD COLUMN     "winner" TEXT;

-- AlterTable
ALTER TABLE "MarketingSend" ADD COLUMN     "buttonReply" TEXT,
ADD COLUMN     "costCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sendAfter" TIMESTAMP(3),
ADD COLUMN     "simulated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "variant" TEXT;

-- AlterTable
ALTER TABLE "WhatsAppSetting" ADD COLUMN     "checkedAt" TIMESTAMP(3),
ADD COLUMN     "messagingTier" TEXT,
ADD COLUMN     "qualityRating" TEXT;

-- AlterTable
ALTER TABLE "WhatsAppMessage" ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'IN',
ADD COLUMN     "sentById" TEXT,
ADD COLUMN     "tag" TEXT;

-- CreateTable
CREATE TABLE "MarketingSettings" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "marketingCostCents" INTEGER NOT NULL DEFAULT 70,
    "utilityCostCents" INTEGER NOT NULL DEFAULT 18,
    "monthlyBudgetCents" INTEGER,
    "quietStart" INTEGER NOT NULL DEFAULT 19,
    "quietEnd" INTEGER NOT NULL DEFAULT 7,
    "skipSundays" BOOLEAN NOT NULL DEFAULT true,
    "skipHolidays" BOOLEAN NOT NULL DEFAULT true,
    "autoPausePct" INTEGER NOT NULL DEFAULT 3,
    "dailyLimit" INTEGER NOT NULL DEFAULT 250,
    "demoMode" BOOLEAN NOT NULL DEFAULT false,
    "autoReplyText" TEXT,
    "weeklyReport" BOOLEAN NOT NULL DEFAULT true,
    "lastWeeklyReportAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAlert" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "campaignId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingTask" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CALLBACK',
    "note" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedTo" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSavedReply" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingSavedReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSequence" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "triggerRef" TEXT,
    "steps" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceEnrollment" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "nextAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SequenceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "daysBefore" INTEGER NOT NULL DEFAULT 5,
    "template" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "params" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralEvent" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSettings_practiceId_key" ON "MarketingSettings"("practiceId");

-- CreateIndex
CREATE INDEX "MarketingAlert_practiceId_createdAt_idx" ON "MarketingAlert"("practiceId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingTask_practiceId_doneAt_dueAt_idx" ON "MarketingTask"("practiceId", "doneAt", "dueAt");

-- CreateIndex
CREATE INDEX "SequenceEnrollment_doneAt_nextAt_idx" ON "SequenceEnrollment"("doneAt", "nextAt");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceEnrollment_sequenceId_leadId_key" ON "SequenceEnrollment"("sequenceId", "leadId");

-- CreateIndex
CREATE INDEX "ReferralEvent_practiceId_referrerId_idx" ON "ReferralEvent"("practiceId", "referrerId");

-- AddForeignKey
ALTER TABLE "MarketingSettings" ADD CONSTRAINT "MarketingSettings_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAlert" ADD CONSTRAINT "MarketingAlert_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTask" ADD CONSTRAINT "MarketingTask_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSavedReply" ADD CONSTRAINT "MarketingSavedReply_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSequence" ADD CONSTRAINT "MarketingSequence_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEnrollment" ADD CONSTRAINT "SequenceEnrollment_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEnrollment" ADD CONSTRAINT "SequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "MarketingSequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEvent" ADD CONSTRAINT "ReferralEvent_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "MarketingSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingAlert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingSavedReply" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SequenceEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReminderRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralEvent" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "MarketingSettings", "MarketingAlert", "MarketingTask", "MarketingSavedReply", "MarketingSequence", "SequenceEnrollment", "ReminderRule", "ReferralEvent" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "MarketingSettings", "MarketingAlert", "MarketingTask", "MarketingSavedReply", "MarketingSequence", "SequenceEnrollment", "ReminderRule", "ReferralEvent" FROM authenticated;
  END IF;
END $$;
