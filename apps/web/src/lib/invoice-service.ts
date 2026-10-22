import "server-only";
import {
  INVOICE_RETENTION_YEARS,
  isValidSaVatNumber,
  normaliseInvoiceNumber,
  validateInvoiceTotals,
  type TenantContext,
} from "@aah/core";
import type { TenantDb } from "@aah/db";

export interface InvoiceInput {
  clientId: string;
  direction: "PAYABLE" | "RECEIVABLE";
  supplierName: string | null;
  supplierVatNumber: string | null;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  subtotalCents: bigint;
  vatCents: bigint;
  totalCents: bigint;
  description: string | null;
  sourceDocumentId: string | null;
  captureSource: "MANUAL" | "EMAIL";
  confidence: number | null;
  capturedByUserId: string | null;
}

export type InvoiceCheck = { issues: string[]; supplierId: string | null; invoiceNumberNorm: string };

/**
 * Validation, supplier upsert and duplicate detection shared by manual capture,
 * auto-filing and the review queue. Callers must already have checked that
 * clientId (and sourceDocumentId) belong to the tenant.
 */
export async function checkInvoice(db: TenantDb, ctx: TenantContext, input: InvoiceInput): Promise<InvoiceCheck> {
  const supplierVat = input.supplierVatNumber?.replace(/\s/g, "") || null;
  let supplierId: string | null = null;
  if (input.supplierName) {
    const supplier = await db.supplier.upsert({
      where: { clientId_name: { clientId: input.clientId, name: input.supplierName } },
      create: { clientId: input.clientId, practiceId: ctx.practiceId, name: input.supplierName, vatNumber: supplierVat },
      update: supplierVat && isValidSaVatNumber(supplierVat) ? { vatNumber: supplierVat } : {},
    });
    supplierId = supplier.id;
  }
  const invoiceNumberNorm = normaliseInvoiceNumber(input.invoiceNumber);
  const issues: string[] = validateInvoiceTotals({
    subtotalCents: input.subtotalCents,
    vatCents: input.vatCents,
    totalCents: input.totalCents,
    supplierVatNumber: supplierVat,
  }).map((i) => i.code);

  // Same number from the same supplier (or, with no supplier, same number and total) for this client.
  const duplicate = await db.invoice.findFirst({
    where: {
      clientId: input.clientId,
      invoiceNumberNorm,
      deletedAt: null,
      ...(supplierId ? { supplierId } : { totalCents: input.totalCents }),
    },
    select: { id: true },
  });
  if (duplicate) issues.push("SUSPECTED_DUPLICATE");
  return { issues, supplierId, invoiceNumberNorm };
}

export async function createInvoice(db: TenantDb, ctx: TenantContext, input: InvoiceInput, check: InvoiceCheck) {
  const retainUntil = new Date(input.issueDate);
  retainUntil.setUTCFullYear(retainUntil.getUTCFullYear() + INVOICE_RETENTION_YEARS);
  return db.invoice.create({
    data: {
      practiceId: ctx.practiceId,
      clientId: input.clientId,
      supplierId: check.supplierId,
      direction: input.direction,
      invoiceNumber: input.invoiceNumber,
      invoiceNumberNorm: check.invoiceNumberNorm,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      subtotalCents: input.subtotalCents,
      vatCents: input.vatCents,
      totalCents: input.totalCents,
      description: input.description,
      status: check.issues.length > 0 ? "NEEDS_REVIEW" : "CAPTURED",
      validationIssues: check.issues,
      sourceDocumentId: input.sourceDocumentId,
      captureSource: input.captureSource,
      confidence: input.confidence,
      capturedByUserId: input.capturedByUserId,
      retainUntil,
    },
  });
}
