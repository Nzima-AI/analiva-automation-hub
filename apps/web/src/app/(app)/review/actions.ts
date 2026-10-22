"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { findPrintedValue, isValidSaVatNumber, parseAmountToCents, parseDateRange, type InvoiceField } from "@aah/core";
import { audit } from "@aah/db";
import { blankToNull, fail, parseForm } from "@/lib/forms";
import { readExtracted } from "@/lib/inbox/extracted";
import { rememberSender, rememberSupplier, supplierKeys, type Learned } from "@/lib/inbox/learning";
import { pollInboxes, type PollSummary } from "@/lib/inbox/poll";
import { checkInvoice, createInvoice } from "@/lib/invoice-service";
import { requireStaff } from "@/lib/session";

const schema = z.object({
  clientId: z.string().min(1, "Choose the client this invoice belongs to."),
  direction: z.enum(["PAYABLE", "RECEIVABLE"]),
  supplierName: z.string().trim().min(1, "Enter the supplier.").max(200),
  supplierVatNumber: z.preprocess(blankToNull, z.string().max(20).nullable()),
  invoiceNumber: z.string().trim().min(1, "Enter the invoice number.").max(80),
  issueDate: z.string().min(1, "Enter the invoice date."),
  dueDate: z.preprocess(blankToNull, z.string().nullable()),
  subtotal: z.preprocess(blankToNull, z.string().nullable()),
  vat: z.preprocess(blankToNull, z.string().nullable()),
  total: z.string().min(1, "Enter the total."),
  description: z.preprocess(blankToNull, z.string().max(2000).nullable()),
  rememberSender: z.preprocess((v) => v === "on", z.boolean()),
});

function day(value: string, backTo: string, label: string): Date {
  const r = parseDateRange(value);
  if (!r || r.to.getTime() - r.from.getTime() !== 86_400_000) fail(backTo, `${label} must be a single day.`);
  return r.from;
}

async function nextInQueue(db: Awaited<ReturnType<typeof requireStaff>>["db"], excludeId: string): Promise<string> {
  const next = await db.capture.findFirst({
    where: { status: { in: ["NEEDS_CLIENT", "SUGGESTED", "NEEDS_REVIEW"] }, id: { not: excludeId } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return next ? `/review/${next.id}` : "/review?done=1";
}

/** File a capture as an invoice, learning from whatever the user corrected. */
export async function fileCapture(captureId: string, formData: FormData) {
  const session = await requireStaff();
  const { db, ctx } = session;
  const backTo = `/review/${captureId}`;
  const capture = await db.capture.findFirst({
    where: { id: captureId, status: { notIn: ["FILED", "DISMISSED"] } },
    include: { email: { select: { id: true, fromAddress: true, clientId: true } } },
  });
  if (!capture) fail("/review", "That item has already been dealt with.");
  const input = parseForm(schema, formData, backTo);

  const client = await db.client.findFirst({ where: { id: input.clientId, deletedAt: null }, select: { id: true } });
  if (!client) fail(backTo, "Client not found.");

  const totalCents = parseAmountToCents(input.total);
  if (totalCents === null) fail(backTo, "Total is not a valid amount.");
  let vatCents = input.vat ? parseAmountToCents(input.vat) : null;
  let subtotalCents = input.subtotal ? parseAmountToCents(input.subtotal) : null;
  if (input.vat && vatCents === null) fail(backTo, "VAT is not a valid amount.");
  if (input.subtotal && subtotalCents === null) fail(backTo, "Subtotal is not a valid amount.");
  if (vatCents === null && subtotalCents === null) vatCents = 0n;
  if (vatCents === null) vatCents = totalCents - subtotalCents!;
  if (subtotalCents === null) subtotalCents = totalCents - vatCents;

  const supplierVat = input.supplierVatNumber?.replace(/\s/g, "") ?? null;
  if (supplierVat && !isValidSaVatNumber(supplierVat)) fail(backTo, "Supplier VAT number must be 10 digits starting with 4.");
  const issueDate = day(input.issueDate, backTo, "Invoice date");
  const dueDate = input.dueDate ? day(input.dueDate, backTo, "Due date") : null;

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
    sourceDocumentId: capture.documentId,
    captureSource: "EMAIL" as const,
    confidence: capture.confidence,
    capturedByUserId: ctx.userId,
  };
  const check = await checkInvoice(db, ctx, invoiceInput);
  const invoice = await createInvoice(db, ctx, invoiceInput, check);

  // The original now belongs to the client.
  await db.document.updateMany({ where: { id: capture.documentId, clientId: null }, data: { clientId: client.id } });
  await db.capture.updateMany({
    where: { id: capture.id },
    data: { status: "FILED", clientId: client.id, invoiceId: invoice.id, decidedByUserId: ctx.userId, decidedAt: new Date(), issues: check.issues },
  });
  if (capture.email && !capture.email.clientId) {
    await db.emailMessage.updateMany({ where: { id: capture.email.id }, data: { clientId: client.id, matchStatus: "MATCHED" } });
  }

  // ---- learning
  const extracted = readExtracted(capture.extracted);
  const text = capture.documentText ?? "";
  const submitted: Array<[InvoiceField, string | null, "amount" | "date" | "text", string | bigint | Date | null]> = [
    ["supplierName", input.supplierName, "text", input.supplierName],
    ["supplierVatNumber", supplierVat, "text", supplierVat],
    ["invoiceNumber", input.invoiceNumber, "text", input.invoiceNumber],
    ["issueDate", issueDate.toISOString().slice(0, 10), "date", issueDate],
    ["dueDate", dueDate?.toISOString().slice(0, 10) ?? null, "date", dueDate],
    ["subtotal", subtotalCents.toString(), "amount", subtotalCents],
    ["vat", vatCents.toString(), "amount", vatCents],
    ["total", totalCents.toString(), "amount", totalCents],
  ];
  const corrections: Learned[] = [];
  const workingSources: Partial<Record<InvoiceField, string>> = {};
  for (const [field, value, kind, typed] of submitted) {
    const before = extracted.fields[field]?.value ?? null;
    if ((before ?? null) === (value ?? null)) {
      if (extracted.fields[field]) workingSources[field] = extracted.fields[field]!.source;
      continue;
    }
    corrections.push({
      field,
      extracted: before,
      corrected: value,
      correctedRaw: typed !== null && text ? findPrintedValue(text, kind, typed) : null,
    });
  }
  await rememberSupplier(db, ctx, {
    keys: supplierKeys(supplierVat, capture.email?.fromAddress ?? null),
    supplierName: input.supplierName,
    vatNumber: supplierVat,
    documentText: text || null,
    workingSources,
    corrections,
    captureId: capture.id,
  });
  if (input.rememberSender && capture.email) await rememberSender(db, ctx, capture.email.fromAddress, client.id);

  await audit(
    ctx,
    {
      action: "capture.filed",
      entityType: "Invoice",
      entityId: invoice.id,
      clientId: client.id,
      reason: corrections.length ? `Corrected: ${corrections.map((c) => c.field).join(", ")}` : "Confirmed as read",
      metadata: { captureId: capture.id, confidence: capture.confidence, issues: check.issues.join(",") || null },
    },
    session.user.name,
  );
  revalidatePath("/review");
  redirect(await nextInQueue(db, capture.id));
}

export async function dismissCapture(captureId: string, formData: FormData) {
  const session = await requireStaff();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300) || "Not an invoice";
  const capture = await session.db.capture.findFirst({ where: { id: captureId, status: { notIn: ["FILED", "DISMISSED"] } }, select: { id: true, clientId: true } });
  if (!capture) fail("/review", "That item has already been dealt with.");
  await session.db.capture.updateMany({
    where: { id: captureId },
    data: { status: "DISMISSED", note: reason, decidedByUserId: session.ctx.userId, decidedAt: new Date() },
  });
  await audit(session.ctx, { action: "capture.dismissed", entityType: "Capture", entityId: captureId, clientId: capture.clientId, reason }, session.user.name);
  revalidatePath("/review");
  redirect(await nextInQueue(session.db, captureId));
}

export type CheckState = { status: "idle" } | { status: "done"; results: PollSummary[] };

/** "Check inbox now" button. */
export async function checkInboxNow(_prev: CheckState): Promise<CheckState> {
  const session = await requireStaff();
  const results = await pollInboxes({ practiceId: session.ctx.practiceId, deadline: Date.now() + 50_000 });
  await audit(
    session.ctx,
    { action: "inbox.polled", entityType: "Practice", entityId: session.ctx.practiceId, metadata: { accounts: results.length, fetched: results.reduce((n, r) => n + r.fetched, 0) } },
    session.user.name,
  );
  revalidatePath("/review");
  revalidatePath("/inbox");
  return { status: "done", results };
}
