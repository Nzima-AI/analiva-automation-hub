"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidSaVatNumber, parseAmountToCents, parseDateRange, vatFromInclusive } from "@aah/core";
import { audit } from "@aah/db";
import { blankToNull, fail, parseForm } from "@/lib/forms";
import { checkInvoice, createInvoice } from "@/lib/invoice-service";
import { requireStaff } from "@/lib/session";

const schema = z.object({
  clientId: z.string().min(1, "Choose a client."),
  direction: z.enum(["PAYABLE", "RECEIVABLE"]),
  supplierName: z.preprocess(blankToNull, z.string().max(200).nullable()),
  supplierVatNumber: z.preprocess(blankToNull, z.string().max(20).nullable()),
  invoiceNumber: z.string().trim().min(1, "Enter the invoice number.").max(80),
  issueDate: z.string().min(1, "Enter the invoice date."),
  dueDate: z.preprocess(blankToNull, z.string().nullable()),
  total: z.string().min(1, "Enter the total."),
  vat: z.preprocess(blankToNull, z.string().nullable()),
  vatMode: z.enum(["inclusive", "none", "explicit"]),
  description: z.preprocess(blankToNull, z.string().max(2000).nullable()),
  sourceDocumentId: z.preprocess(blankToNull, z.string().nullable()),
});

function parseDay(value: string, backTo: string, label: string): Date {
  const range = parseDateRange(value);
  if (!range || range.to.getTime() - range.from.getTime() !== 86_400_000) fail(backTo, `${label} must be a single day, e.g. 2024-03-14.`);
  return range.from;
}

export async function captureInvoice(formData: FormData) {
  const session = await requireStaff();
  const { db, ctx } = session;
  const backTo = "/invoices/new";
  const input = parseForm(schema, formData, backTo);

  const client = await db.client.findFirst({ where: { id: input.clientId, deletedAt: null }, select: { id: true } });
  if (!client) fail(backTo, "Client not found.");

  const totalCents = parseAmountToCents(input.total);
  if (totalCents === null) fail(backTo, "Total is not a valid amount.");
  let vatCents: bigint;
  if (input.vatMode === "none") vatCents = 0n;
  else if (input.vatMode === "inclusive") vatCents = vatFromInclusive(totalCents);
  else {
    const parsed = input.vat ? parseAmountToCents(input.vat) : null;
    if (parsed === null) fail(backTo, "Enter the VAT amount.");
    vatCents = parsed;
  }
  const subtotalCents = totalCents - vatCents;

  const issueDate = parseDay(input.issueDate, backTo, "Invoice date");
  const dueDate = input.dueDate ? parseDay(input.dueDate, backTo, "Due date") : null;
  const supplierVat = input.supplierVatNumber?.replace(/\s/g, "") ?? null;
  if (supplierVat && !isValidSaVatNumber(supplierVat)) fail(backTo, "Supplier VAT number must be 10 digits starting with 4.");

  if (input.sourceDocumentId) {
    const doc = await db.document.findFirst({ where: { id: input.sourceDocumentId, clientId: client.id, deletedAt: null }, select: { id: true } });
    if (!doc) fail(backTo, "The linked document does not belong to this client.");
  }

  const invoiceInput = {
    clientId: client.id,
    direction: input.direction,
    supplierName: input.supplierName,
    supplierVatNumber: supplierVat,
    invoiceNumber: input.invoiceNumber,
    issueDate,
    dueDate,
    subtotalCents,
    vatCents,
    totalCents,
    description: input.description,
    sourceDocumentId: input.sourceDocumentId,
    captureSource: "MANUAL" as const,
    confidence: null,
    capturedByUserId: ctx.userId,
  };
  const check = await checkInvoice(db, ctx, invoiceInput);
  const issues = check.issues;
  const invoice = await createInvoice(db, ctx, invoiceInput, check);
  await audit(
    ctx,
    {
      action: "invoice.captured",
      entityType: "Invoice",
      entityId: invoice.id,
      clientId: client.id,
      metadata: { totalCents: totalCents.toString(), issues: issues.join(",") || null },
    },
    session.user.name,
  );
  redirect(`/invoices/${invoice.id}`);
}

export async function setInvoiceStatus(invoiceId: string, status: "APPROVED" | "REJECTED" | "CAPTURED", formData: FormData) {
  const session = await requireStaff();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;
  const invoice = await session.db.invoice.findFirst({ where: { id: invoiceId, deletedAt: null }, select: { id: true, clientId: true, status: true } });
  if (!invoice) fail("/invoices", "Invoice not found.");
  if (invoice.status === "POSTED") fail(`/invoices/${invoiceId}`, "Posted invoices cannot change status here.");
  await session.db.invoice.updateMany({ where: { id: invoiceId }, data: { status } });
  await audit(
    session.ctx,
    { action: "invoice.updated", entityType: "Invoice", entityId: invoiceId, clientId: invoice.clientId, reason, metadata: { from: invoice.status, to: status } },
    session.user.name,
  );
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function deleteInvoice(invoiceId: string, formData: FormData) {
  const session = await requireStaff();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!reason) fail(`/invoices/${invoiceId}`, "Give a reason for removing this invoice.");
  const invoice = await session.db.invoice.findFirst({ where: { id: invoiceId, deletedAt: null }, select: { id: true, clientId: true } });
  if (!invoice) fail("/invoices", "Invoice not found.");
  // Soft delete only: invoices are retained for at least five years.
  await session.db.invoice.updateMany({ where: { id: invoiceId }, data: { deletedAt: new Date() } });
  await audit(session.ctx, { action: "invoice.deleted", entityType: "Invoice", entityId: invoiceId, clientId: invoice.clientId, reason }, session.user.name);
  redirect(`/clients/${invoice.clientId}`);
}
