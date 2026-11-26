-- WhatsApp CRM: keyword auto-replies, contact notes, public opt-in page.

ALTER TABLE "MarketingSettings" ADD COLUMN "optInEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "optInHeadline" TEXT;

CREATE TABLE "MarketingKeyword" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "tag" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingKeyword_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketingKeyword_practiceId_keyword_key" ON "MarketingKeyword"("practiceId", "keyword");
ALTER TABLE "MarketingKeyword" ADD CONSTRAINT "MarketingKeyword_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MarketingNote" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketingNote_leadId_createdAt_idx" ON "MarketingNote"("leadId", "createdAt");
ALTER TABLE "MarketingNote" ADD CONSTRAINT "MarketingNote_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingNote" ADD CONSTRAINT "MarketingNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "MarketingLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingKeyword" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingNote" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "MarketingKeyword", "MarketingNote" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "MarketingKeyword", "MarketingNote" FROM authenticated;
  END IF;
END $$;
