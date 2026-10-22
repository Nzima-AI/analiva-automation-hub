"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseDateRange } from "@aah/core";
import { audit } from "@aah/db";
import { blankToNull, fail, parseForm } from "@/lib/forms";
import { sendEmail } from "@/lib/outbound";
import { requireStaff } from "@/lib/session";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const emailList = z.preprocess(
  blankToNull,
  z
    .string()
    .max(500)
    .refine((v) => v.split(/[,;\s]+/).filter(Boolean).every((x) => z.string().email().safeParse(x).success), "CC must be email addresses separated by commas.")
    .nullable(),
);

const reminderSchema = z.object({
  sendAs: z.enum(["PRACTICE", "CLIENT"]),
  to: email,
  cc: emailList,
  recipientName: z.preprocess(blankToNull, z.string().max(120).nullable()),
  message: z.preprocess(blankToNull, z.string().max(4000).nullable()),
  paymentDetails: z.preprocess(blankToNull, z.string().max(1000).nullable()),
  attachOriginal: z.preprocess((v) => v === "on", z.boolean()),
  saveEmail: z.preprocess((v) => v === "on", z.boolean()),
});

export async function sendInvoiceReminder(invoiceId: string, formData: FormData) {
  const s = await requireStaff();
  const back = `/invoices/${invoiceId}/send`;
  const input = parseForm(reminderSchema, formData, back);
  const invoice = await s.db.invoice.findFirst({ where: { id: invoiceId, deletedAt: null }, select: { id: true, clientId: true, supplierId: true } });
  if (!invoice) fail("/invoices", "Invoice not found.");

  const r = await sendEmail(s.db, s.ctx, s.user.name, {
    clientId: invoice.clientId,
    sendAs: input.sendAs,
    to: input.to,
    cc: input.cc,
    compose: { kind: "REMINDER", invoiceId, message: input.message, paymentDetails: input.paymentDetails, recipientName: input.recipientName, attachOriginal: input.attachOriginal },
  });
  if (!r.ok) fail(back, r.error);
  if (input.saveEmail && invoice.supplierId) await s.db.supplier.updateMany({ where: { id: invoice.supplierId }, data: { email: input.to } });
  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/invoices/${invoiceId}?sent=1`);
}

const messageSchema = z.object({
  sendAs: z.enum(["PRACTICE", "CLIENT"]),
  to: email,
  cc: emailList,
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(2).max(10000),
});

export async function sendClientMessage(clientId: string, formData: FormData) {
  const s = await requireStaff();
  const back = `/clients/${clientId}/email`;
  const input = parseForm(messageSchema, formData, back);
  const client = await s.db.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } });
  if (!client) fail("/clients", "Client not found.");
  const r = await sendEmail(s.db, s.ctx, s.user.name, { clientId, sendAs: input.sendAs, to: input.to, cc: input.cc, compose: { kind: "MESSAGE", subject: input.subject, body: input.body } });
  if (!r.ok) fail(back, r.error);
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?sent=1`);
}

const mandateSchema = z.object({
  signedBy: z.string().trim().min(2, "Who signed the mandate?").max(120),
  signedAt: z.string().min(1, "Enter the date it was signed."),
  expiresAt: z.preprocess(blankToNull, z.string().nullable()),
  scope: z.string().trim().min(2).max(200),
  documentId: z.preprocess(blankToNull, z.string().nullable()),
});

/** Owner-only: record the client's signed authority to email in their name. */
export async function recordMandate(clientId: string, formData: FormData) {
  const s = await requireStaff();
  const back = `/clients/${clientId}`;
  if (s.ctx.role !== "OWNER") fail(back, "Only the practice owner can record mandates.");
  const input = parseForm(mandateSchema, formData, back);
  const signedAt = parseDateRange(input.signedAt)?.from;
  const expiresAt = input.expiresAt ? parseDateRange(input.expiresAt)?.from : null;
  if (!signedAt) fail(back, "Signed date isn't valid.");
  if (input.expiresAt && !expiresAt) fail(back, "Expiry date isn't valid.");
  if (expiresAt && expiresAt <= signedAt) fail(back, "Expiry must be after the signing date.");
  if (input.documentId) {
    const doc = await s.db.document.findFirst({ where: { id: input.documentId, clientId }, select: { id: true } });
    if (!doc) fail(back, "That document isn't this client's.");
  }
  const m = await s.db.mandate.create({
    data: { practiceId: s.ctx.practiceId, clientId, signedBy: input.signedBy, signedAt, expiresAt: expiresAt ?? null, scope: input.scope, documentId: input.documentId },
  });
  await audit(s.ctx, { action: "mandate.recorded", entityType: "Mandate", entityId: m.id, clientId, metadata: { signedBy: input.signedBy, scope: input.scope } }, s.user.name);
  revalidatePath(back);
  redirect(`${back}?saved=mandate`);
}

export async function revokeMandate(clientId: string, mandateId: string) {
  const s = await requireStaff();
  if (s.ctx.role !== "OWNER") return;
  await s.db.mandate.updateMany({ where: { id: mandateId, clientId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(s.ctx, { action: "mandate.revoked", entityType: "Mandate", entityId: mandateId, clientId }, s.user.name);
  revalidatePath(`/clients/${clientId}`);
}

/** Owner-only: what the client sees in the portal, and who reminders come from by default. */
export async function updateClientSharing(clientId: string, formData: FormData) {
  const s = await requireStaff();
  const back = `/clients/${clientId}`;
  if (s.ctx.role !== "OWNER") fail(back, "Only the practice owner can change this.");
  const input = parseForm(
    z.object({ portalShowsBooks: z.preprocess((v) => v === "on", z.boolean()), defaultSendAs: z.enum(["PRACTICE", "CLIENT"]) }),
    formData,
    back,
  );
  await s.db.client.updateMany({ where: { id: clientId }, data: input });
  await audit(s.ctx, { action: "client.settings_updated", entityType: "Client", entityId: clientId, clientId, metadata: input }, s.user.name);
  revalidatePath(back);
  redirect(`${back}?saved=sharing`);
}
