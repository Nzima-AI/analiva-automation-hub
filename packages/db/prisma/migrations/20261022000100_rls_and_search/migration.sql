-- Lock down Supabase's public REST API.
-- RLS on with no policies = the anon and authenticated roles can read/write nothing
-- through PostgREST. The app connects as the table owner via Prisma and enforces
-- tenant scoping in code (packages/core/src/tenancy.ts).
ALTER TABLE "Practice"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workspace"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientService" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Mandate"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLine"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Belt and braces: remove direct grants from the API roles where they exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
  END IF;
END $$;

-- Audit log is append-only at the database level too.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- Fast "contains" search across all years (phone-call lookup).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Client_name_trgm"          ON "Client"   USING gin ("name" gin_trgm_ops);
CREATE INDEX "Client_tradingName_trgm"   ON "Client"   USING gin ("tradingName" gin_trgm_ops);
CREATE INDEX "Client_email_trgm"         ON "Client"   USING gin ("email" gin_trgm_ops);
CREATE INDEX "Contact_name_trgm"         ON "Contact"  USING gin ("name" gin_trgm_ops);
CREATE INDEX "Contact_email_trgm"        ON "Contact"  USING gin ("email" gin_trgm_ops);
CREATE INDEX "Supplier_name_trgm"        ON "Supplier" USING gin ("name" gin_trgm_ops);
CREATE INDEX "Invoice_numberNorm_trgm"   ON "Invoice"  USING gin ("invoiceNumberNorm" gin_trgm_ops);
CREATE INDEX "Invoice_description_trgm"  ON "Invoice"  USING gin ("description" gin_trgm_ops);
CREATE INDEX "Document_filename_trgm"    ON "Document" USING gin ("filename" gin_trgm_ops);
