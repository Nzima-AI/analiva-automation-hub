"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isPracticeRole } from "@aah/core";
import { audit, tenantDb } from "@aah/db";
import { appUrl } from "@/lib/app-url";
import { fail, parseForm } from "@/lib/forms";
import { sendEmail } from "@/lib/outbound";
import { requireSession } from "@/lib/session";

const CATEGORIES = ["GENERAL", "INVOICES", "TAX", "PAYROLL", "CIPC", "DOCUMENTS", "REPORTS"] as const;

const newSchema = z.object({
  subject: z.string().trim().min(3, "Give the enquiry a short subject.").max(200),
  category: z.enum(CATEGORIES).default("GENERAL"),
  body: z.string().trim().min(2, "Write your message.").max(10000),
});

/** A client opens an enquiry from the portal. */
export async function createEnquiry(formData: FormData) {
  const s = await requireSession();
  if (isPracticeRole(s.ctx.role) || !s.ctx.clientId) fail("/enquiries", "Enquiries are opened from the client portal.");
  const input = parseForm(newSchema, formData, "/portal/enquiries/new");
  const enquiry = await s.db.enquiry.create({
    data: { practiceId: s.ctx.practiceId, clientId: s.ctx.clientId, subject: input.subject, category: input.category, createdByUserId: s.ctx.userId, lastMessageFrom: "CLIENT" },
  });
  await s.db.enquiryMessage.create({
    data: { practiceId: s.ctx.practiceId, clientId: s.ctx.clientId, enquiryId: enquiry.id, authorUserId: s.ctx.userId, authorName: s.user.name, authorSide: "CLIENT", body: input.body },
  });
  await audit(s.ctx, { action: "enquiry.created", entityType: "Enquiry", entityId: enquiry.id, clientId: s.ctx.clientId, reason: input.subject }, s.user.name);
  await notifyPractice(s, enquiry.id, `New enquiry: ${input.subject}`, input.body);
  redirect(`/portal/enquiries/${enquiry.id}?sent=1`);
}

const replySchema = z.object({
  body: z.string().trim().min(1, "Write a reply.").max(10000),
  internal: z.preprocess((v) => v === "on", z.boolean()),
});

export async function replyToEnquiry(enquiryId: string, formData: FormData) {
  const s = await requireSession();
  const staff = isPracticeRole(s.ctx.role);
  const back = staff ? `/enquiries/${enquiryId}` : `/portal/enquiries/${enquiryId}`;
  const input = parseForm(replySchema, formData, back);
  const enquiry = await s.db.enquiry.findFirst({ where: { id: enquiryId }, select: { id: true, clientId: true, subject: true, createdByUserId: true } });
  if (!enquiry) fail(staff ? "/enquiries" : "/portal/enquiries", "Enquiry not found.");
  const internal = staff && input.internal;

  await s.db.enquiryMessage.create({
    data: {
      practiceId: s.ctx.practiceId,
      clientId: enquiry.clientId,
      enquiryId,
      authorUserId: s.ctx.userId,
      authorName: s.user.name,
      authorSide: staff ? "PRACTICE" : "CLIENT",
      body: input.body,
      internal,
    },
  });
  if (!internal) {
    await s.db.enquiry.updateMany({
      where: { id: enquiryId },
      data: { lastMessageAt: new Date(), lastMessageFrom: staff ? "PRACTICE" : "CLIENT", status: staff ? "AWAITING_CLIENT" : "OPEN" },
    });
  }
  await audit(s.ctx, { action: "enquiry.replied", entityType: "Enquiry", entityId: enquiryId, clientId: enquiry.clientId, metadata: { internal } }, s.user.name);

  if (!internal) {
    if (staff) await notifyClient(s, enquiry, input.body);
    else await notifyPractice(s, enquiryId, `Reply on: ${enquiry.subject}`, input.body);
  }
  revalidatePath(back);
  redirect(back);
}

export async function setEnquiryStatus(enquiryId: string, status: "OPEN" | "AWAITING_CLIENT" | "RESOLVED") {
  const s = await requireSession();
  const staff = isPracticeRole(s.ctx.role);
  // Clients may only close or reopen their own enquiries.
  if (!staff && status === "AWAITING_CLIENT") return;
  const enquiry = await s.db.enquiry.findFirst({ where: { id: enquiryId }, select: { clientId: true } });
  if (!enquiry) return;
  await s.db.enquiry.updateMany({ where: { id: enquiryId }, data: { status } });
  await audit(s.ctx, { action: "enquiry.status_changed", entityType: "Enquiry", entityId: enquiryId, clientId: enquiry.clientId, metadata: { status } }, s.user.name);
  revalidatePath(staff ? `/enquiries/${enquiryId}` : `/portal/enquiries/${enquiryId}`);
  revalidatePath(staff ? "/enquiries" : "/portal/enquiries");
}

// ------------------------------------------------------------------ notifications (best effort)

type S = Awaited<ReturnType<typeof requireSession>>;

/** Notifications read practice mail settings, which client logins can't: send as the system. */
function system(s: S) {
  const ctx = { practiceId: s.ctx.practiceId, userId: "system", role: "OWNER" as const, clientId: null };
  return { ctx, db: tenantDb(ctx) };
}

async function notifyPractice(s: S, enquiryId: string, subject: string, body: string) {
  const sys = system(s);
  const practice = await sys.db.practice.findFirst({ select: { email: true } });
  if (!practice?.email || !s.ctx.clientId) return;
  const url = `${await appUrl()}/enquiries/${enquiryId}`;
  const r = await sendEmail(sys.db, sys.ctx, "Client portal", {
    clientId: s.ctx.clientId,
    sendAs: "PRACTICE",
    to: practice.email,
    cc: null,
    compose: { kind: "MESSAGE", subject, body: `${s.user.name} wrote in the client portal:\n\n${body.slice(0, 2000)}\n\nReply here: ${url}` },
  });
  if (!r.ok) console.warn("enquiry notification to practice not sent", { enquiryId, reason: r.error });
}

async function notifyClient(s: S, enquiry: { id: string; clientId: string; subject: string; createdByUserId: string | null }, body: string) {
  const author = enquiry.createdByUserId ? await system(s).db.user.findFirst({ where: { id: enquiry.createdByUserId }, select: { email: true, name: true } }) : null;
  if (!author) return;
  const url = `${await appUrl()}/portal/enquiries/${enquiry.id}`;
  const sys = system(s);
  const r = await sendEmail(sys.db, sys.ctx, s.user.name, {
    clientId: enquiry.clientId,
    sendAs: "PRACTICE",
    to: author.email,
    cc: null,
    compose: { kind: "MESSAGE", subject: `Re: ${enquiry.subject}`, body: `Hi ${author.name.split(" ")[0]},\n\n${body.slice(0, 4000)}\n\nView and reply in your portal: ${url}` },
  });
  if (!r.ok) console.warn("enquiry notification to client not sent", { enquiryId: enquiry.id, reason: r.error });
}
