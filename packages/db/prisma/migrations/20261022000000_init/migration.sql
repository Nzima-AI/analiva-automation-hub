-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'STAFF', 'CLIENT', 'CLIENT_STAFF');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PROSPECT', 'ONBOARDING', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('ACCOUNTING', 'PAYROLL', 'CIPC', 'BRANDING', 'WEBSITE', 'LAUNCH');

-- CreateEnum
CREATE TYPE "InvoiceDirection" AS ENUM ('PAYABLE', 'RECEIVABLE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('CAPTURED', 'NEEDS_REVIEW', 'APPROVED', 'POSTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CaptureSource" AS ENUM ('MANUAL', 'AI', 'IMPORT', 'API');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('INVOICE', 'STATEMENT', 'CIPC', 'CONTRACT', 'MANDATE', 'BRAND_ASSET', 'PAYROLL', 'TAX', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('UPLOAD', 'EMAIL', 'PORTAL', 'API');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'API_KEY');

-- CreateTable
CREATE TABLE "Practice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "vatNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Practice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "authUserId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "clientId" TEXT,
    "disabledAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradingName" TEXT,
    "registrationNumber" TEXT,
    "vatNumber" TEXT,
    "taxNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "emailDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ClientStatus" NOT NULL DEFAULT 'ONBOARDING',
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "position" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "brandPrimary" TEXT,
    "brandAccent" TEXT,
    "logoDocumentId" TEXT,
    "emailFooter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientService" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "service" "ServiceType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mandate" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "signedBy" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vatNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "supplierId" TEXT,
    "direction" "InvoiceDirection" NOT NULL DEFAULT 'PAYABLE',
    "invoiceNumber" TEXT NOT NULL,
    "invoiceNumberNorm" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE,
    "currency" CHAR(3) NOT NULL DEFAULT 'ZAR',
    "subtotalCents" BIGINT NOT NULL,
    "vatCents" BIGINT NOT NULL,
    "totalCents" BIGINT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'CAPTURED',
    "description" TEXT,
    "confidence" DOUBLE PRECISION,
    "validationIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceDocumentId" TEXT,
    "captureSource" "CaptureSource" NOT NULL DEFAULT 'MANUAL',
    "capturedByUserId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retainUntil" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitPriceCents" BIGINT NOT NULL,
    "vatRateBps" INTEGER NOT NULL DEFAULT 1500,
    "lineTotalCents" BIGINT NOT NULL,
    "accountCode" TEXT,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT,
    "kind" "DocumentKind" NOT NULL DEFAULT 'OTHER',
    "source" "DocumentSource" NOT NULL DEFAULT 'UPLOAD',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "clientId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Practice_slug_key" ON "Practice"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

-- CreateIndex
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "User_practiceId_email_key" ON "User"("practiceId", "email");

-- CreateIndex
CREATE INDEX "Client_practiceId_status_idx" ON "Client"("practiceId", "status");

-- CreateIndex
CREATE INDEX "Client_practiceId_registrationNumber_idx" ON "Client"("practiceId", "registrationNumber");

-- CreateIndex
CREATE INDEX "Client_practiceId_vatNumber_idx" ON "Client"("practiceId", "vatNumber");

-- CreateIndex
CREATE INDEX "Client_practiceId_phone_idx" ON "Client"("practiceId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Client_practiceId_code_key" ON "Client"("practiceId", "code");

-- CreateIndex
CREATE INDEX "Contact_practiceId_email_idx" ON "Contact"("practiceId", "email");

-- CreateIndex
CREATE INDEX "Contact_practiceId_phone_idx" ON "Contact"("practiceId", "phone");

-- CreateIndex
CREATE INDEX "Contact_clientId_idx" ON "Contact"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_clientId_key" ON "Workspace"("clientId");

-- CreateIndex
CREATE INDEX "ClientService_practiceId_idx" ON "ClientService"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientService_clientId_service_key" ON "ClientService"("clientId", "service");

-- CreateIndex
CREATE INDEX "Mandate_clientId_idx" ON "Mandate"("clientId");

-- CreateIndex
CREATE INDEX "Mandate_practiceId_idx" ON "Mandate"("practiceId");

-- CreateIndex
CREATE INDEX "Supplier_practiceId_vatNumber_idx" ON "Supplier"("practiceId", "vatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_clientId_name_key" ON "Supplier"("clientId", "name");

-- CreateIndex
CREATE INDEX "Invoice_practiceId_invoiceNumberNorm_idx" ON "Invoice"("practiceId", "invoiceNumberNorm");

-- CreateIndex
CREATE INDEX "Invoice_practiceId_totalCents_idx" ON "Invoice"("practiceId", "totalCents");

-- CreateIndex
CREATE INDEX "Invoice_practiceId_issueDate_idx" ON "Invoice"("practiceId", "issueDate");

-- CreateIndex
CREATE INDEX "Invoice_clientId_issueDate_idx" ON "Invoice"("clientId", "issueDate");

-- CreateIndex
CREATE INDEX "Invoice_supplierId_invoiceNumberNorm_idx" ON "Invoice"("supplierId", "invoiceNumberNorm");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storagePath_key" ON "Document"("storagePath");

-- CreateIndex
CREATE INDEX "Document_practiceId_sha256_idx" ON "Document"("practiceId", "sha256");

-- CreateIndex
CREATE INDEX "Document_clientId_createdAt_idx" ON "Document"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_practiceId_createdAt_idx" ON "AuditLog"("practiceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_practiceId_entityType_entityId_idx" ON "AuditLog"("practiceId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_clientId_createdAt_idx" ON "AuditLog"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientService" ADD CONSTRAINT "ClientService_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientService" ADD CONSTRAINT "ClientService_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

