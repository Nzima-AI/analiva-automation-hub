"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { contactsFromCsv, contactsFromVcf, dedupeContacts, normalizePhone, parseCsv, parseTags, TEMPLATE_FIELDS } from "@aah/core";
import { encryptSecret } from "@aah/core/secrets";
import { audit, type Prisma } from "@aah/db";
import { secretsKey } from "@/lib/env";
import { blankToNull, fail, parseForm } from "@/lib/forms";
import { queueCampaign, sendTest } from "@/lib/marketing/engine";
import { requireStaff } from "@/lib/session";
import { checkConnection, sendText } from "@/lib/whatsapp";

const path = "/marketing";
const campaignsPath = "/marketing/campaigns";
const whatsappPath = "/marketing/whatsapp";
const interest = z.enum(["REPORTING", "BOOKKEEPING", "PAYROLL"]);
const MAX_IMPORT = 5000;

const contactFields = {
  email: z.preprocess(blankToNull, z.string().trim().email().max(200).toLowerCase().nullable()),
  phone: z.preprocess(blankToNull, z.string().trim().max(40).nullable()),
  name: z.string().trim().min(1).max(200),
  company: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().trim().max(200)),
  interest,
  tags: z.preprocess((v) => parseTags(typeof v === "string" ? v : ""), z.array(z.string())),
};

const captureSchema = z.object({ ...contactFields, source: z.enum(["WEBSITE", "INBOX", "REFERRAL", "IMPORT", "MANUAL"]) });

function cleanPhone(raw: string | null, back: string) {
  if (!raw) return null;
  const phone = normalizePhone(raw);
  if (!phone) fail(back, "That phone number doesn't look like a mobile number. Use 082 123 4567 or +27 82 123 4567.");
  return phone;
}

export async function captureLead(form: FormData) {
  const { db, ctx } = await requireStaff();
  const { source, phone: rawPhone, ...input } = parseForm(captureSchema, form, path);
  const phone = cleanPhone(rawPhone, path);
  if (!input.email && !phone) fail(path, "Enter an email address, a mobile number or both.");
  const { practiceId, userId } = ctx;
  const lead = await db.$transaction(async (tx) => {
    const existing = await tx.marketingLead.findFirst({ where: { OR: [...(input.email ? [{ email: input.email }] : []), ...(phone ? [{ phone }] : [])] } });
    const saved = existing
      ? (await tx.marketingLead.updateManyAndReturn({
          where: { id: existing.id },
          data: { ...input, email: input.email ?? existing.email, phone: phone ?? existing.phone, tags: parseTags([...existing.tags, ...input.tags]) },
        }))[0]
      : await tx.marketingLead.create({ data: { ...input, phone, source, practiceId, ownerId: userId } });
    if (!saved) throw new Error("The contact could not be saved.");
    await tx.auditLog.create({
      data: { practiceId, actorType: "USER", actorId: userId, action: existing ? "lead.updated" : "lead.captured", entityType: "MarketingLead", entityId: saved.id, metadata: { source } },
    });
    return saved;
  });
  revalidatePath(path);
  redirect(`${path}?lead=${lead.id}`);
}

const importSchema = z.object({
  interest,
  tags: z.preprocess((v) => parseTags(typeof v === "string" ? v : ""), z.array(z.string())),
  basis: z.enum(["none", "existing-clients"]),
});

/**
 * CSV (spreadsheet, Google or Outlook export) or a phone's .vcf export, up to 5,000 contacts.
 * Known contacts (same phone or email) are updated and keep their permissions.
 */
export async function importContacts(form: FormData) {
  const { db, ctx, user } = await requireStaff();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > 4_000_000) fail(path, "Choose a .csv or .vcf file under 4 MB.");
  const options = parseForm(importSchema, form, path);
  const text = await file.text();
  const isVcf = /\.vcf$/i.test(file.name) || /^\s*BEGIN:VCARD/i.test(text);
  const { contacts: parsed, problems } = isVcf ? contactsFromVcf(text) : contactsFromCsv(parseCsv(text));
  const contacts = dedupeContacts(parsed);
  if (!contacts.length) fail(path, problems[0] ?? "No contacts with a phone number or email were found in that file.");
  if (contacts.length > MAX_IMPORT) fail(path, `That file has ${contacts.length} contacts. Import up to ${MAX_IMPORT} at a time.`);

  const now = new Date();
  // POPIA s69(3): an existing client may be marketed similar services if every message offers an opt-out.
  const evidence = options.basis === "existing-clients" ? `Existing or past client of the practice (POPIA s69(3)). Imported ${now.toISOString().slice(0, 10)} by ${user.name ?? user.email} from ${file.name}.` : null;
  const phones = contacts.flatMap((c) => (c.phone ? [c.phone] : []));
  const emails = contacts.flatMap((c) => (c.email ? [c.email] : []));
  const known = await db.marketingLead.findMany({ where: { OR: [{ phone: { in: phones } }, { email: { in: emails } }] } });
  const byPhone = new Map(known.flatMap((lead) => (lead.phone ? [[lead.phone, lead] as const] : [])));
  const byEmail = new Map(known.flatMap((lead) => (lead.email ? [[lead.email, lead] as const] : [])));

  const fresh: Prisma.MarketingLeadCreateManyInput[] = [];
  const updates: Array<{ id: string; data: Prisma.MarketingLeadUpdateManyMutationInput }> = [];
  for (const contact of contacts) {
    const existing = (contact.phone && byPhone.get(contact.phone)) || (contact.email && byEmail.get(contact.email));
    const tags = parseTags([...contact.tags, ...options.tags]);
    const contactInterest = interest.safeParse(contact.interest).data ?? options.interest;
    if (existing) {
      updates.push({
        id: existing.id,
        data: {
          tags: parseTags([...existing.tags, ...tags]),
          // Fill gaps only; never move a phone or email that belongs to another contact.
          ...(!existing.phone && contact.phone && !byPhone.has(contact.phone) ? { phone: contact.phone } : {}),
          ...(!existing.email && contact.email && !byEmail.has(contact.email) ? { email: contact.email } : {}),
          ...(!existing.company && contact.company ? { company: contact.company } : {}),
        },
      });
      continue;
    }
    fresh.push({
      practiceId: ctx.practiceId,
      ownerId: ctx.userId,
      source: "IMPORT" as const,
      name: contact.name,
      company: contact.company,
      phone: contact.phone,
      email: contact.email,
      interest: contactInterest,
      tags,
      ...(evidence ? { consentEvidence: evidence, consentAt: contact.email ? now : null, whatsappConsentAt: contact.phone ? now : null } : {}),
    });
  }

  const created = await db.$transaction(
    async (tx) => {
      const rows = fresh.length ? await tx.marketingLead.createManyAndReturn({ data: fresh, skipDuplicates: true, select: { id: true } }) : [];
      for (const update of updates) await tx.marketingLead.updateMany({ where: { id: update.id }, data: update.data });
      return rows.length;
    },
    { timeout: 60_000 },
  );
  await audit(ctx, {
    action: "lead.imported",
    entityType: "MarketingLead",
    entityId: ctx.practiceId,
    reason: `${created} new and ${updates.length} updated contacts from ${file.name}`,
    metadata: { basis: options.basis, tags: options.tags.join(", "), problems: problems.length },
  }, user.name ?? undefined);
  revalidatePath(path);
  redirect(`${path}?imported=${created}&updated=${updates.length}&problems=${problems.length}`);
}

const updateSchema = z.object({
  name: contactFields.name,
  company: contactFields.company,
  email: contactFields.email,
  phone: contactFields.phone,
  tags: contactFields.tags,
  stage: z.enum(["NEW", "CONTACTED", "QUALIFIED", "WON", "CLOSED"]),
  ownerId: z.string().min(1),
  followUp: z.preprocess(blankToNull, z.string().max(1000).nullable()),
  followUpDate: z.preprocess(blankToNull, z.iso.date().nullable()),
  preference: z.enum(["unchanged", "opt-in", "opt-out"]),
  whatsappPreference: z.enum(["unchanged", "opt-in", "opt-out"]),
  evidence: z.preprocess(blankToNull, z.string().max(1000).nullable()),
});

export async function updateLead(id: string, form: FormData) {
  const { db, ctx } = await requireStaff();
  const back = `${path}?lead=${encodeURIComponent(id)}`;
  const { preference, whatsappPreference, evidence, followUpDate, phone: rawPhone, ...input } = parseForm(updateSchema, form, back);
  const phone = cleanPhone(rawPhone, back);
  if (!input.email && !phone) fail(back, "Keep an email address, a mobile number or both.");
  if ((preference === "opt-in" || whatsappPreference === "opt-in") && !evidence) fail(back, "Record when and how the contact opted in.");
  await db.$transaction(async (tx) => {
    const owner = await tx.user.findFirst({ where: { id: input.ownerId, role: { in: ["OWNER", "STAFF"] }, disabledAt: null } });
    if (!owner) fail(back, "Choose an active staff member.");
    const clash = await tx.marketingLead.findFirst({ where: { id: { not: id }, OR: [...(input.email ? [{ email: input.email }] : []), ...(phone ? [{ phone }] : [])] }, select: { name: true } });
    if (clash) fail(back, `That email or number already belongs to ${clash.name}.`);
    const now = new Date();
    const result = await tx.marketingLead.updateMany({
      where: { id },
      data: {
        ...input,
        phone,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        ...(preference === "opt-in" ? { consentAt: now, optedOutAt: null } : {}),
        ...(preference === "opt-out" ? { optedOutAt: now } : {}),
        ...(whatsappPreference === "opt-in" ? { whatsappConsentAt: now, whatsappOptedOutAt: null } : {}),
        ...(whatsappPreference === "opt-out" ? { whatsappOptedOutAt: now } : {}),
        ...(evidence ? { consentEvidence: evidence } : {}),
      },
    });
    if (!result.count) fail(back, "Contact unavailable.");
    await tx.auditLog.create({
      data: {
        practiceId: ctx.practiceId, actorType: "USER", actorId: ctx.userId,
        action: "lead.updated", entityType: "MarketingLead", entityId: id,
        metadata: { stage: input.stage, preference, whatsappPreference, ...(evidence ? { evidence } : {}) },
      },
    });
  });
  revalidatePath(path);
  redirect(back);
}

/** For sign-ups the callback can't see (e.g. signed up by phone). */
export async function markSignedUp(id: string) {
  const { db, ctx, user } = await requireStaff();
  const now = new Date();
  const latest = await db.marketingSend.findFirst({ where: { leadId: id, sentAt: { not: null } }, orderBy: { sentAt: "desc" }, select: { id: true } });
  await db.marketingLead.updateMany({ where: { id, signedUpAt: null }, data: { signedUpAt: now, stage: "WON" } });
  if (latest) await db.marketingSend.updateMany({ where: { id: latest.id, signedUpAt: null }, data: { signedUpAt: now } });
  await audit(ctx, { action: "lead.signed_up", entityType: "MarketingLead", entityId: id, reason: "Marked signed up by hand" }, user.name ?? undefined);
  revalidatePath(path);
  redirect(`${path}?lead=${encodeURIComponent(id)}`);
}

const campaignSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    channel: z.enum(["EMAIL", "WHATSAPP"]),
    subject: z.preprocess(blankToNull, z.string().trim().max(200).regex(/^[^\r\n]+$/).nullish()),
    body: z.preprocess(blankToNull, z.string().trim().max(12000).nullish()),
    interest: z.preprocess((v) => (v === "ALL" || v === "" ? null : v), interest.nullable()),
    tags: contactFields.tags,
    ctaUrl: z.preprocess(blankToNull, z.url({ protocol: /^https$/ }).max(500).nullish()),
    template: z.preprocess(blankToNull, z.string().max(200).nullish()),
    templateParams: z.preprocess(
      (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []),
      z.array(z.enum(Object.keys(TEMPLATE_FIELDS) as [keyof typeof TEMPLATE_FIELDS, ...Array<keyof typeof TEMPLATE_FIELDS>])).max(10),
    ),
  })
  .superRefine((value, issue) => {
    if (value.channel === "EMAIL" && (!value.subject || !value.body)) issue.addIssue({ code: "custom", message: "An email campaign needs a subject and a message." });
    if (value.channel === "WHATSAPP" && !value.template) issue.addIssue({ code: "custom", message: "Choose an approved WhatsApp template." });
  });

function campaignData(input: z.infer<typeof campaignSchema>) {
  const [templateName, language] = (input.template ?? "").split("|");
  return {
    name: input.name,
    channel: input.channel,
    subject: input.subject ?? templateName ?? input.name,
    body: input.body ?? "",
    interest: input.interest,
    tags: input.tags,
    ctaUrl: input.ctaUrl ?? null,
    whatsappTemplate: input.channel === "WHATSAPP" ? templateName || null : null,
    templateLanguage: input.channel === "WHATSAPP" ? language || "en" : null,
    templateParams: input.channel === "WHATSAPP" ? input.templateParams : [],
  };
}

export async function createCampaign(form: FormData) {
  const { db, ctx } = await requireStaff();
  const input = parseForm(campaignSchema, form, campaignsPath);
  const campaign = await db.marketingCampaign.create({ data: { ...campaignData(input), practiceId: ctx.practiceId, createdById: ctx.userId } });
  revalidatePath(campaignsPath);
  redirect(`${campaignsPath}?campaign=${campaign.id}`);
}

export async function editCampaign(id: string, form: FormData) {
  const { db } = await requireStaff();
  const back = `${campaignsPath}?campaign=${encodeURIComponent(id)}`;
  const input = parseForm(campaignSchema, form, back);
  const result = await db.marketingCampaign.updateMany({ where: { id, status: "DRAFT" }, data: campaignData(input) });
  if (!result.count) fail(back, "This campaign is no longer editable. Create a new draft to revise it.");
  revalidatePath(campaignsPath);
  redirect(back);
}

export async function approveCampaign(id: string) {
  const { db, ctx } = await requireStaff();
  const back = `${campaignsPath}?campaign=${encodeURIComponent(id)}`;
  if (ctx.role !== "OWNER") fail(back, "Only the practice owner can approve campaigns.");
  await db.marketingCampaign.updateMany({ where: { id, status: "DRAFT" }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: ctx.userId } });
  revalidatePath(campaignsPath);
  redirect(back);
}

const sendSchema = z.object({ when: z.enum(["now", "later"]), scheduledAt: z.preprocess(blankToNull, z.string().max(40).nullable()) });

export async function sendCampaign(id: string, form: FormData) {
  const { db, ctx, user } = await requireStaff();
  const back = `${campaignsPath}?campaign=${encodeURIComponent(id)}`;
  const { when, scheduledAt } = parseForm(sendSchema, form, back);
  let at: Date | null = null;
  if (when === "later") {
    // datetime-local has no zone: read it as South African time.
    at = scheduledAt ? new Date(`${scheduledAt}:00+02:00`) : null;
    if (!at || Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 60_000) fail(back, "Choose a date and time in the future.");
  }
  await db.marketingCampaign.updateMany({ where: { id, status: "APPROVED" }, data: { scheduledAt: at } });
  const result = await queueCampaign(db, ctx, id, user.name ?? "");
  if ("error" in result) fail(back, result.error!);
  revalidatePath(campaignsPath);
  redirect(`${back}&queued=${result.queued}`);
}

export async function cancelCampaign(id: string) {
  const { db, ctx, user } = await requireStaff();
  const back = `${campaignsPath}?campaign=${encodeURIComponent(id)}`;
  const result = await db.marketingCampaign.updateMany({ where: { id, status: { in: ["DRAFT", "APPROVED", "SENDING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
  if (!result.count) fail(back, "This campaign has already finished.");
  const skipped = await db.marketingSend.updateMany({ where: { campaignId: id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Campaign stopped" } });
  await audit(ctx, { action: "campaign.cancelled", entityType: "MarketingCampaign", entityId: id, reason: `${skipped.count} unsent messages stopped` }, user.name ?? undefined);
  revalidatePath(campaignsPath);
  redirect(back);
}

const testSchema = z.object({ to: z.string().trim().min(3).max(200) });

export async function testCampaign(id: string, form: FormData) {
  const { db } = await requireStaff();
  const back = `${campaignsPath}?campaign=${encodeURIComponent(id)}`;
  const { to } = parseForm(testSchema, form, back);
  const campaign = await db.marketingCampaign.findFirst({ where: { id } });
  if (!campaign) fail(back, "Campaign not found.");
  const target = campaign.channel === "WHATSAPP" ? normalizePhone(to) : z.string().email().safeParse(to).data;
  if (!target) fail(back, campaign.channel === "WHATSAPP" ? "Enter your own mobile number." : "Enter your own email address.");
  const practice = await db.practice.findFirst({ select: { name: true } });
  const result = await sendTest(db, campaign, target, practice?.name ?? "");
  if (!result.ok) fail(back, `The test didn't send: ${result.error}`);
  redirect(`${back}&tested=1`);
}

const followUpSchema = z.object({ rule: z.enum(["NOT_CLICKED", "CLICKED_NOT_SIGNED_UP", "SIGNED_UP"]) });
const followUpNames = { NOT_CLICKED: "didn't click", CLICKED_NOT_SIGNED_UP: "clicked, not signed up", SIGNED_UP: "signed up" } as const;

/** A new draft for part of an earlier campaign's recipients, e.g. those who didn't click. */
export async function createFollowUp(parentId: string, form: FormData) {
  const { db, ctx } = await requireStaff();
  const back = `${campaignsPath}?campaign=${encodeURIComponent(parentId)}`;
  const { rule } = parseForm(followUpSchema, form, back);
  const parent = await db.marketingCampaign.findFirst({ where: { id: parentId } });
  if (!parent || !["SENDING", "SENT"].includes(parent.status)) fail(back, "Follow-ups can be made once a campaign has gone out.");
  const campaign = await db.marketingCampaign.create({
    data: {
      practiceId: ctx.practiceId,
      createdById: ctx.userId,
      name: `${parent.name}: follow-up (${followUpNames[rule]})`.slice(0, 160),
      channel: parent.channel,
      subject: parent.subject,
      body: parent.body,
      interest: parent.interest,
      tags: parent.tags,
      ctaUrl: parent.ctaUrl,
      whatsappTemplate: parent.whatsappTemplate,
      templateLanguage: parent.templateLanguage,
      templateParams: parent.templateParams,
      parentId: parent.id,
      followUpRule: rule,
    },
  });
  revalidatePath(campaignsPath);
  redirect(`${campaignsPath}?campaign=${campaign.id}`);
}

const whatsappSchema = z.object({
  phoneNumberId: z.string().trim().regex(/^\d{6,30}$/, "The phone number ID is digits only."),
  businessAccountId: z.string().trim().regex(/^\d{6,30}$/, "The WhatsApp Business Account ID is digits only."),
  accessToken: z.preprocess(blankToNull, z.string().trim().min(20).max(1000).nullable()),
  appSecret: z.preprocess(blankToNull, z.string().trim().min(16).max(200).nullable()),
});

export async function saveWhatsApp(form: FormData) {
  const { db, ctx, user } = await requireStaff();
  if (ctx.role !== "OWNER") fail(whatsappPath, "Only the practice owner can connect WhatsApp.");
  const input = parseForm(whatsappSchema, form, whatsappPath);
  const existing = await db.whatsAppSetting.findFirst();
  if (!existing && (!input.accessToken || !input.appSecret)) fail(whatsappPath, "Paste the access token and the app secret.");
  const key = secretsKey();
  const accessTokenEncrypted = input.accessToken ? encryptSecret(input.accessToken, key) : existing!.accessTokenEncrypted;
  const appSecretEncrypted = input.appSecret ? encryptSecret(input.appSecret, key) : existing!.appSecretEncrypted;
  const check = await checkConnection({ accessTokenEncrypted, phoneNumberId: input.phoneNumberId });
  if (!check.ok) fail(whatsappPath, `Meta didn't accept these details: ${check.error}`);
  const data = { phoneNumberId: input.phoneNumberId, businessAccountId: input.businessAccountId, accessTokenEncrypted, appSecretEncrypted, displayNumber: check.displayNumber || null };
  if (existing) await db.whatsAppSetting.updateMany({ where: { id: existing.id }, data });
  else await db.whatsAppSetting.create({ data: { ...data, practiceId: ctx.practiceId } });
  await audit(ctx, { action: "whatsapp.connected", entityType: "WhatsAppSetting", entityId: ctx.practiceId, reason: `Number ${check.displayNumber}` }, user.name ?? undefined);
  revalidatePath(whatsappPath);
  redirect(`${whatsappPath}?saved=1`);
}

const replySchema = z.object({ text: z.string().trim().min(1).max(4000) });

/** Free-form replies are allowed (and free) within 24 hours of the contact's last message. */
export async function replyToMessage(id: string, form: FormData) {
  const { db, ctx, user } = await requireStaff();
  const { text } = parseForm(replySchema, form, whatsappPath);
  const [message, setting] = await Promise.all([db.whatsAppMessage.findFirst({ where: { id } }), db.whatsAppSetting.findFirst()]);
  if (!message || !setting) fail(whatsappPath, "Message not found.");
  if (Date.now() - message.receivedAt.getTime() > 24 * 3600_000) fail(whatsappPath, "WhatsApp only allows free replies within 24 hours. Reply from your phone, or send a template.");
  const result = await sendText(setting, message.fromPhone, text);
  if (!result.ok) fail(whatsappPath, `The reply didn't send: ${result.error}`);
  await db.whatsAppMessage.updateMany({ where: { id }, data: { handledAt: new Date() } });
  await audit(ctx, { action: "whatsapp.replied", entityType: "WhatsAppMessage", entityId: id }, user.name ?? undefined);
  revalidatePath(whatsappPath);
  redirect(`${whatsappPath}?replied=1`);
}

export async function markHandled(id: string) {
  const { db } = await requireStaff();
  await db.whatsAppMessage.updateMany({ where: { id }, data: { handledAt: new Date() } });
  revalidatePath(whatsappPath);
  redirect(whatsappPath);
}
