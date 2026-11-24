-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FollowUpRule" AS ENUM ('NOT_CLICKED', 'CLICKED_NOT_SIGNED_UP', 'SIGNED_UP');

-- CreateEnum
CREATE TYPE "SendStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "MarketingLead" ADD COLUMN     "lastClickedAt" TIMESTAMP(3),
ADD COLUMN     "lastRepliedAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "signedUpAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "token" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
ADD COLUMN     "whatsappConsentAt" TIMESTAMP(3),
ADD COLUMN     "whatsappOptedOutAt" TIMESTAMP(3),
ALTER COLUMN "email" DROP NOT NULL;

-- Existing leads got a random token above; new ones get a cuid from Prisma.
ALTER TABLE "MarketingLead" ALTER COLUMN "token" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketingCampaign" ADD COLUMN     "channel" "CampaignChannel" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "ctaUrl" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "followUpRule" "FollowUpRule",
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "templateLanguage" TEXT,
ADD COLUMN     "templateParams" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "whatsappTemplate" TEXT,
ALTER COLUMN "interest" DROP NOT NULL;

-- Campaigns approved before statuses existed stay approved.
UPDATE "MarketingCampaign" SET "status" = 'APPROVED' WHERE "approvedAt" IS NOT NULL;

-- CreateTable
CREATE TABLE "MarketingSend" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "toAddress" TEXT NOT NULL,
    "status" "SendStatus" NOT NULL DEFAULT 'QUEUED',
    "providerId" TEXT,
    "error" TEXT,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "signedUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppSetting" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "businessAccountId" TEXT NOT NULL,
    "displayNumber" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "appSecretEncrypted" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "batchSize" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "leadId" TEXT,
    "fromPhone" TEXT NOT NULL,
    "fromName" TEXT,
    "body" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "optOut" BOOLEAN NOT NULL DEFAULT false,
    "handledAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSend_providerId_key" ON "MarketingSend"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSend_token_key" ON "MarketingSend"("token");

-- CreateIndex
CREATE INDEX "MarketingSend_status_campaignId_idx" ON "MarketingSend"("status", "campaignId");

-- CreateIndex
CREATE INDEX "MarketingSend_practiceId_leadId_idx" ON "MarketingSend"("practiceId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSend_campaignId_leadId_key" ON "MarketingSend"("campaignId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSetting_practiceId_key" ON "WhatsAppSetting"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSetting_phoneNumberId_key" ON "WhatsAppSetting"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_providerId_key" ON "WhatsAppMessage"("providerId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_practiceId_receivedAt_idx" ON "WhatsAppMessage"("practiceId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingLead_token_key" ON "MarketingLead"("token");

-- CreateIndex
CREATE INDEX "MarketingLead_tags_idx" ON "MarketingLead" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingLead_practiceId_phone_key" ON "MarketingLead"("practiceId", "phone");

-- CreateIndex
CREATE INDEX "MarketingCampaign_status_scheduledAt_idx" ON "MarketingCampaign"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSend" ADD CONSTRAINT "MarketingSend_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSend" ADD CONSTRAINT "MarketingSend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSend" ADD CONSTRAINT "MarketingSend_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "MarketingLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppSetting" ADD CONSTRAINT "WhatsAppSetting_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "MarketingSend" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppMessage" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "MarketingSend", "WhatsAppSetting", "WhatsAppMessage" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "MarketingSend", "WhatsAppSetting", "WhatsAppMessage" FROM authenticated;
  END IF;
END $$;
