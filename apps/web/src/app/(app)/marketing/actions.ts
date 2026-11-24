"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseCsv } from "@aah/core";
import { blankToNull, fail, parseForm } from "@/lib/forms";
import { requireStaff } from "@/lib/session";

const path = "/marketing";
const interest = z.enum(["REPORTING", "BOOKKEEPING", "PAYROLL"]);

const captureSchema = z.object({
  email: z.string().trim().email().max(200).toLowerCase(),
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  interest,
  source: z.enum(["WEBSITE", "INBOX", "REFERRAL", "IMPORT", "MANUAL"]),
});

export async function captureLead(form: FormData) {
  const { db, ctx } = await requireStaff();
  const { source, ...input } = parseForm(captureSchema, form, path);
  const { practiceId, userId } = ctx;
  const lead = await db.$transaction(async (tx) => {
    const created = await tx.marketingLead.createMany({
      data: { ...input, source, practiceId, ownerId: userId },
      skipDuplicates: true,
    });
    const where = { email: input.email };
    const lead = created.count
      ? await tx.marketingLead.findFirstOrThrow({ where })
      : (await tx.marketingLead.updateManyAndReturn({ where, data: input }))[0];
    if (!lead) throw new Error("The lead could not be captured.");
    await tx.auditLog.create({
      data: {
        practiceId, actorType: "USER", actorId: userId, action: created.count ? "lead.captured" : "lead.updated",
        entityType: "MarketingLead", entityId: lead.id, metadata: { source },
      },
    });
    return lead;
  });
  revalidatePath(path);
  redirect(`${path}?lead=${lead.id}`);
}

export async function importLeads(form: FormData) {
  const { db, ctx } = await requireStaff();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > 512_000) fail(path, "Choose a CSV file under 512 KB.");
  const [header, ...rows] = parseCsv(await file.text());
  const columns = ["name", "email", "company", "interest"] as const;
  const positions = columns.map((column) => header?.findIndex((value) => value.toLowerCase() === column) ?? -1);
  if (positions.includes(-1) || !rows.length || rows.length > 500) {
    fail(path, "The CSV must have name, email, company and interest columns and between 1 and 500 leads.");
  }

  const entries = rows.map((row, index) => {
    const [name, email, company, rawInterest] = positions.map((position) => row[position]);
    const parsed = captureSchema.safeParse({ name, email, company, interest: rawInterest?.toUpperCase(), source: "IMPORT" });
    if (!parsed.success) fail(path, `CSV entry ${index + 1}: ${parsed.error.issues[0]?.message ?? "Invalid lead."}`);
    return { ...parsed.data, practiceId: ctx.practiceId, ownerId: ctx.userId };
  });
  const count = await db.$transaction(async (tx) => {
    const created = await tx.marketingLead.createManyAndReturn({ data: entries, skipDuplicates: true });
    if (created.length) await tx.auditLog.createMany({
      data: created.map((lead) => ({
        practiceId: ctx.practiceId, actorType: "USER", actorId: ctx.userId, action: "lead.captured",
        entityType: "MarketingLead", entityId: lead.id, metadata: { source: "IMPORT" },
      })),
    });
    return created.length;
  });
  revalidatePath(path);
  redirect(`${path}?imported=${count}&skipped=${entries.length - count}`);
}

const updateSchema = z.object({
  stage: z.enum(["NEW", "CONTACTED", "QUALIFIED", "WON", "CLOSED"]),
  ownerId: z.string().min(1),
  followUp: z.preprocess(blankToNull, z.string().max(1000).nullable()),
  followUpDate: z.preprocess(blankToNull, z.iso.date().nullable()),
  preference: z.enum(["unchanged", "opt-in", "opt-out"]),
  evidence: z.preprocess(blankToNull, z.string().max(1000).nullable()),
});

export async function updateLead(id: string, form: FormData) {
  const { db, ctx } = await requireStaff();
  const back = `${path}?lead=${encodeURIComponent(id)}`;
  const { preference, evidence, followUpDate, ...input } = parseForm(updateSchema, form, back);
  if (preference === "opt-in" && !evidence) fail(back, "Record when and how the contact opted in.");
  await db.$transaction(async (tx) => {
    const owner = await tx.user.findFirst({ where: { id: input.ownerId, role: { in: ["OWNER", "STAFF"] }, disabledAt: null } });
    if (!owner) fail(back, "Choose an active staff member.");
    const now = new Date();
    const result = await tx.marketingLead.updateMany({
      where: { id },
      data: {
        ...input,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        ...(preference === "opt-in" ? { consentAt: now, consentEvidence: evidence, optedOutAt: null } : {}),
        ...(preference === "opt-out" ? { optedOutAt: now } : {}),
      },
    });
    if (!result.count) fail(path, "Lead unavailable.");
    await tx.auditLog.create({
      data: {
        practiceId: ctx.practiceId, actorType: "USER", actorId: ctx.userId,
        action: "lead.updated", entityType: "MarketingLead", entityId: id,
        metadata: { stage: input.stage, ownerId: input.ownerId, preference, ...(evidence ? { evidence } : {}) },
      },
    });
  });
  revalidatePath(path);
  redirect(back);
}

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/),
  body: z.string().trim().min(1).max(12000),
  interest,
});

export async function createCampaign(form: FormData) {
  const { db, ctx } = await requireStaff();
  const input = parseForm(campaignSchema, form, path);
  const campaign = await db.marketingCampaign.create({
    data: { ...input, practiceId: ctx.practiceId, createdById: ctx.userId },
  });
  revalidatePath(path);
  redirect(`${path}?campaign=${campaign.id}`);
}

export async function approveCampaign(id: string) {
  const { db, ctx } = await requireStaff();
  if (ctx.role !== "OWNER") fail(path, "Only the practice owner can approve campaigns.");
  await db.marketingCampaign.updateMany({
    where: { id, approvedAt: null },
    data: { approvedAt: new Date(), approvedById: ctx.userId },
  });
  revalidatePath(path);
  redirect(`${path}?campaign=${encodeURIComponent(id)}`);
}

export async function editCampaign(id: string, form: FormData) {
  const { db } = await requireStaff();
  const back = `${path}?campaign=${encodeURIComponent(id)}`;
  const input = parseForm(campaignSchema, form, back);
  const result = await db.marketingCampaign.updateMany({ where: { id, approvedAt: null }, data: input });
  if (!result.count) fail(back, "This campaign is no longer editable. Create a new draft to revise it.");
  revalidatePath(path);
  redirect(back);
}
