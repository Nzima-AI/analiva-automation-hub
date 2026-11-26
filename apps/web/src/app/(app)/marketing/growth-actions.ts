"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normaliseKeyword, normalizePhone, parseTags } from "@aah/core";
import { audit } from "@aah/db";
import { blankToNull, fail, parseForm } from "@/lib/forms";
import { clearDemo, logOutbound, seedDemo } from "@/lib/marketing/automation";
import { marketingSettings, trackedLink } from "@/lib/marketing/engine";
import { requireStaff } from "@/lib/session";
import { sendText } from "@/lib/whatsapp";

const owner = async (back: string) => {
  const s = await requireStaff();
  if (s.ctx.role !== "OWNER") fail(back, "Only the practice owner can change this.");
  return s;
};

export async function seedDemoAction() {
  const { db, ctx } = await owner("/marketing");
  const r = await seedDemo(db, ctx);
  revalidatePath("/marketing", "layout");
  redirect(r.already ? "/marketing?demo=already" : "/marketing?demo=loaded");
}

export async function clearDemoAction() {
  const { db } = await owner("/marketing/settings");
  const n = await clearDemo(db);
  revalidatePath("/marketing", "layout");
  redirect(`/marketing/settings?cleared=${n}`);
}

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const settingsSchema = z.object({
  marketingCost: z.coerce.number().min(0).max(100),
  utilityCost: z.coerce.number().min(0).max(100),
  monthlyBudget: z.preprocess(blankToNull, z.coerce.number().min(0).max(10_000_000).nullable()),
  quietStart: int(0, 23),
  quietEnd: int(0, 23),
  skipSundays: z.preprocess((v) => v === "on", z.boolean()),
  skipHolidays: z.preprocess((v) => v === "on", z.boolean()),
  autoPausePct: int(1, 50),
  dailyLimit: int(1, 100_000),
  demoMode: z.preprocess((v) => v === "on", z.boolean()),
  weeklyReport: z.preprocess((v) => v === "on", z.boolean()),
  autoReplyText: z.preprocess(blankToNull, z.string().trim().max(1000).nullable()),
});

export async function saveMarketingSettings(form: FormData) {
  const back = "/marketing/settings";
  const { db, ctx, user } = await owner(back);
  const i = parseForm(settingsSchema, form, back);
  const data = {
    marketingCostCents: Math.round(i.marketingCost * 100),
    utilityCostCents: Math.round(i.utilityCost * 100),
    monthlyBudgetCents: i.monthlyBudget == null ? null : Math.round(i.monthlyBudget * 100),
    quietStart: i.quietStart, quietEnd: i.quietEnd, skipSundays: i.skipSundays, skipHolidays: i.skipHolidays,
    autoPausePct: i.autoPausePct, dailyLimit: i.dailyLimit, demoMode: i.demoMode, weeklyReport: i.weeklyReport, autoReplyText: i.autoReplyText,
  };
  await db.marketingSettings.upsert({ where: { practiceId: ctx.practiceId }, create: { practiceId: ctx.practiceId, ...data }, update: data });
  await audit(ctx, { action: "whatsapp.connected", entityType: "MarketingSettings", entityId: ctx.practiceId, reason: "Marketing settings saved" }, user.name ?? undefined);
  revalidatePath("/marketing", "layout");
  redirect(`${back}?saved=1`);
}

export async function dismissAlert(id: string) {
  const { db } = await requireStaff();
  await db.marketingAlert.updateMany({ where: { id }, data: { readAt: new Date() } });
  revalidatePath("/marketing");
}

export async function completeTask(id: string) {
  const { db } = await requireStaff();
  await db.marketingTask.updateMany({ where: { id }, data: { doneAt: new Date() } });
  revalidatePath("/marketing", "layout");
}

export async function resumeCampaign(id: string) {
  const { db, ctx, user } = await requireStaff();
  const back = `/marketing/campaigns?campaign=${encodeURIComponent(id)}`;
  if (ctx.role !== "OWNER") fail(back, "Only the practice owner can resume a paused campaign.");
  await db.marketingCampaign.updateMany({ where: { id, status: "PAUSED" }, data: { status: "SENDING" } });
  await audit(ctx, { action: "campaign.queued", entityType: "MarketingCampaign", entityId: id, reason: "Resumed after a pause" }, user.name ?? undefined);
  revalidatePath("/marketing", "layout");
  redirect(back);
}

/** Creates or links a marketing contact for every Hub client and client contact with a mobile number. */
export async function syncClientsToContacts() {
  const back = "/marketing/contacts";
  const { db, ctx, user } = await requireStaff();
  const clients = await db.client.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, tradingName: true, email: true, phone: true, contacts: { select: { name: true, email: true, phone: true, isPrimary: true } } },
  });
  let created = 0;
  let linked = 0;
  for (const c of clients) {
    const people = [...c.contacts, { name: c.tradingName || c.name, email: c.email, phone: c.phone, isPrimary: false }];
    for (const p of people) {
      const phone = normalizePhone(p.phone);
      const email = p.email?.trim().toLowerCase() || null;
      if (!phone && !email) continue;
      const existing = await db.marketingLead.findFirst({ where: { OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] } });
      if (existing) {
        if (!existing.clientId) { await db.marketingLead.updateMany({ where: { id: existing.id }, data: { clientId: c.id, tags: parseTags([...existing.tags, "client"]) } }); linked++; }
        continue;
      }
      await db.marketingLead.create({
        data: {
          practiceId: ctx.practiceId, ownerId: ctx.userId, source: "MANUAL", interest: "BOOKKEEPING", name: p.name, company: c.tradingName || c.name,
          phone, email, clientId: c.id, tags: ["client"],
          // Existing clients: POPIA section 69(3) basis, recorded with when and from where.
          consentAt: email ? new Date() : null, whatsappConsentAt: phone ? new Date() : null,
          consentEvidence: `Existing client of the practice (POPIA s69(3)); synced from the Hub CRM on ${new Date().toISOString().slice(0, 10)} by ${user.name ?? user.email}.`,
        },
      });
      created++;
    }
  }
  await audit(ctx, { action: "lead.imported", entityType: "MarketingLead", entityId: ctx.practiceId, reason: `Synced from clients: ${created} new, ${linked} linked` }, user.name ?? undefined);
  revalidatePath(back);
  redirect(`${back}?imported=${created}&updated=${linked}&problems=0`);
}

// ---- Inbox --------------------------------------------------------------------

const replySchema = z.object({ text: z.string().trim().min(1).max(4000) });

/** A free-form reply in a thread. WhatsApp allows these within 24 hours of the contact's last message. */
export async function replyInThread(phone: string, form: FormData) {
  const back = `/marketing/inbox?thread=${encodeURIComponent(phone)}`;
  const { db, ctx, user } = await requireStaff();
  const { text } = parseForm(replySchema, form, back);
  const [last, setting, settings] = await Promise.all([
    db.whatsAppMessage.findFirst({ where: { fromPhone: phone, direction: "IN" }, orderBy: { receivedAt: "desc" } }),
    db.whatsAppSetting.findFirst(),
    marketingSettings(db),
  ]);
  if (!last) fail(back, "This contact hasn't messaged you yet.");
  if (Date.now() - last.receivedAt.getTime() > 24 * 3600_000) fail(back, "Over 24 hours since their last message: WhatsApp only allows a free reply within 24 hours. Send a template instead, or reply from your phone.");
  let id = `local.${Date.now()}`;
  if (!settings.demoMode) {
    if (!setting) fail(back, "Connect WhatsApp first.");
    const r = await sendText(setting, phone, text);
    if (!r.ok) fail(back, `The reply didn't send: ${r.error}`);
    id = r.id;
  }
  await logOutbound(db, ctx.practiceId, last.leadId, phone, text, id, ctx.userId);
  await db.whatsAppMessage.updateMany({ where: { fromPhone: phone, direction: "IN", handledAt: null }, data: { handledAt: new Date() } });
  await audit(ctx, { action: "whatsapp.replied", entityType: "WhatsAppMessage", entityId: last.id }, user.name ?? undefined);
  revalidatePath("/marketing", "layout");
  redirect(back);
}

/** Sends the contact their personal sign-up link inside the 24-hour window. */
export async function sendLinkInThread(phone: string) {
  const back = `/marketing/inbox?thread=${encodeURIComponent(phone)}`;
  const { db } = await requireStaff();
  const send = await db.marketingSend.findFirst({ where: { toAddress: phone, campaign: { ctaUrl: { not: null } } }, orderBy: { createdAt: "desc" } });
  if (!send) fail(back, "No campaign link to send this contact.");
  const form = new FormData();
  form.set("text", `Here's your personal link: ${trackedLink(send.token)}`);
  return replyInThread(phone, form);
}

export async function assignThread(phone: string, form: FormData) {
  const { db } = await requireStaff();
  const userId = String(form.get("userId") ?? "") || null;
  await db.whatsAppMessage.updateMany({ where: { fromPhone: phone }, data: { assignedTo: userId } });
  revalidatePath("/marketing/inbox");
  redirect(`/marketing/inbox?thread=${encodeURIComponent(phone)}`);
}

export async function closeThread(phone: string) {
  const { db } = await requireStaff();
  await db.whatsAppMessage.updateMany({ where: { fromPhone: phone, handledAt: null }, data: { handledAt: new Date() } });
  revalidatePath("/marketing", "layout");
  redirect("/marketing/inbox");
}

const savedReplySchema = z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(2000) });

export async function saveSavedReply(form: FormData) {
  const { db, ctx } = await requireStaff();
  const i = parseForm(savedReplySchema, form, "/marketing/inbox");
  await db.marketingSavedReply.create({ data: { practiceId: ctx.practiceId, ...i } });
  revalidatePath("/marketing/inbox");
  redirect("/marketing/inbox?saved=1");
}

export async function deleteSavedReply(id: string) {
  const { db } = await requireStaff();
  await db.marketingSavedReply.deleteMany({ where: { id } });
  revalidatePath("/marketing/inbox");
}

// ---- Automations ----------------------------------------------------------------

const stepFields = [1, 2, 3] as const;
const sequenceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  trigger: z.enum(["NEW_CONTACT", "CAMPAIGN_SENT", "SIGNED_UP"]),
  triggerRef: z.preprocess(blankToNull, z.string().max(40).nullable()),
  ...Object.fromEntries(stepFields.flatMap((n) => [
    [`template${n}`, z.preprocess(blankToNull, z.string().max(200).nullable())],
    [`delay${n}`, z.preprocess(blankToNull, z.coerce.number().min(0).max(24 * 90).nullable())],
    [`condition${n}`, z.enum(["ALL", "NOT_CLICKED", "NOT_SIGNED_UP"]).default("ALL")],
  ])),
});

export async function saveSequence(form: FormData) {
  const back = "/marketing/automations";
  const { db, ctx, user } = await requireStaff();
  const i = parseForm(sequenceSchema, form, back) as Record<string, unknown> & { name: string; trigger: string; triggerRef: string | null };
  const steps = stepFields
    .map((n) => ({ template: i[`template${n}`] as string | null, delayHours: (i[`delay${n}`] as number | null) ?? 0, condition: i[`condition${n}`] as string }))
    .filter((s) => s.template)
    .map((s) => {
      const [template, language] = s.template!.split("|");
      return { template: template!, language: language || "en", delayHours: s.delayHours, condition: s.condition, params: ["firstName"] };
    });
  if (!steps.length) fail(back, "Add at least one step with a template.");
  if (i.trigger === "CAMPAIGN_SENT" && !i.triggerRef) fail(back, "Choose the campaign this sequence follows.");
  await db.marketingSequence.create({ data: { practiceId: ctx.practiceId, name: i.name, trigger: i.trigger, triggerRef: i.triggerRef, steps } });
  await audit(ctx, { action: "campaign.queued", entityType: "MarketingSequence", entityId: ctx.practiceId, reason: `Sequence "${i.name}" created` }, user.name ?? undefined);
  revalidatePath(back);
  redirect(`${back}?saved=1`);
}

export async function toggleSequence(id: string) {
  const { db } = await requireStaff();
  const s = await db.marketingSequence.findFirst({ where: { id } });
  if (s) await db.marketingSequence.updateMany({ where: { id }, data: { active: !s.active } });
  revalidatePath("/marketing/automations");
}

const reminderSchema = z.object({
  kind: z.enum(["FILING_DUE"]),
  daysBefore: int(0, 60),
  template: z.string().min(1).max(200),
});

export async function saveReminder(form: FormData) {
  const back = "/marketing/automations";
  const { db, ctx } = await requireStaff();
  const i = parseForm(reminderSchema, form, back);
  const [template, language] = i.template.split("|");
  await db.reminderRule.create({ data: { practiceId: ctx.practiceId, kind: i.kind, daysBefore: i.daysBefore, template: template!, language: language || "en", params: ["firstName", "filing", "dueDate"] } });
  revalidatePath(back);
  redirect(`${back}?saved=1`);
}

export async function toggleReminder(id: string) {
  const { db } = await requireStaff();
  const r = await db.reminderRule.findFirst({ where: { id } });
  if (r) await db.reminderRule.updateMany({ where: { id }, data: { active: !r.active } });
  revalidatePath("/marketing/automations");
}

// ---- Keyword auto-replies --------------------------------------------------------

const keywordSchema = z.object({
  keyword: z.string().trim().min(2, "A keyword needs at least 2 characters.").max(40).regex(/^#?[\p{L}\p{N} ]+$/u, "Use letters, numbers and spaces only."),
  reply: z.string().trim().min(1).max(1000),
  tag: z.preprocess(blankToNull, z.string().trim().max(60).nullable()),
});

export async function saveKeyword(form: FormData) {
  const back = "/marketing/automations";
  const { db, ctx, user } = await requireStaff();
  const i = parseForm(keywordSchema, form, back);
  const keyword = normaliseKeyword(i.keyword);
  if (keyword === "STOP" || keyword === "START") fail(back, "STOP and START are kept for opting out and back in.");
  const saved = await db.marketingKeyword.upsert({
    where: { practiceId_keyword: { practiceId: ctx.practiceId, keyword } },
    create: { practiceId: ctx.practiceId, keyword, reply: i.reply, tag: i.tag },
    update: { reply: i.reply, tag: i.tag, active: true },
  });
  await audit(ctx, { action: "keyword.saved", entityType: "MarketingKeyword", entityId: saved.id, reason: `Keyword ${keyword}` }, user.name ?? undefined);
  revalidatePath(back);
  redirect(`${back}?saved=keyword`);
}

export async function toggleKeyword(id: string) {
  const { db } = await requireStaff();
  const k = await db.marketingKeyword.findFirst({ where: { id } });
  if (k) await db.marketingKeyword.updateMany({ where: { id }, data: { active: !k.active } });
  revalidatePath("/marketing/automations");
}

export async function deleteKeyword(id: string) {
  const { db } = await requireStaff();
  await db.marketingKeyword.deleteMany({ where: { id } });
  revalidatePath("/marketing/automations");
}

// ---- Contact notes and pipeline ---------------------------------------------------

export async function addLeadNote(leadId: string, form: FormData) {
  const back = `/marketing/contacts?lead=${leadId}`;
  const { db, ctx, user } = await requireStaff();
  const { body } = parseForm(z.object({ body: z.string().trim().min(1).max(2000) }), form, back);
  const lead = await db.marketingLead.findFirst({ where: { id: leadId }, select: { id: true } });
  if (!lead) fail("/marketing/contacts", "Contact not found.");
  await db.marketingNote.create({ data: { practiceId: ctx.practiceId, leadId, body, createdById: ctx.userId } });
  await audit(ctx, { action: "lead.noted", entityType: "MarketingLead", entityId: leadId }, user.name ?? undefined);
  revalidatePath("/marketing/contacts");
  redirect(back);
}

const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "CLOSED"] as const;

export async function moveLeadStage(leadId: string, form: FormData) {
  const { db, ctx, user } = await requireStaff();
  const stage = z.enum(STAGES).safeParse(form.get("stage"));
  if (!stage.success) fail("/marketing/pipeline", "Choose a stage.");
  const lead = await db.marketingLead.findFirst({ where: { id: leadId }, select: { stage: true } });
  if (!lead) fail("/marketing/pipeline", "Contact not found.");
  if (lead.stage !== stage.data) {
    await db.marketingLead.updateMany({ where: { id: leadId }, data: { stage: stage.data, ...(stage.data === "WON" ? { signedUpAt: new Date() } : {}) } });
    await audit(ctx, { action: "lead.stage_changed", entityType: "MarketingLead", entityId: leadId, reason: `${lead.stage} → ${stage.data}` }, user.name ?? undefined);
  }
  revalidatePath("/marketing/pipeline");
}

// ---- Public opt-in page -------------------------------------------------------------

export async function saveOptIn(form: FormData) {
  const back = "/marketing/automations";
  const { db, ctx, user } = await owner(back);
  const i = parseForm(z.object({ optInEnabled: z.preprocess((v) => v === "on", z.boolean()), optInHeadline: z.preprocess(blankToNull, z.string().trim().max(160).nullable()) }), form, back);
  await marketingSettings(db);
  await db.marketingSettings.updateMany({ data: i });
  await audit(ctx, { action: "practice.updated", entityType: "MarketingSettings", entityId: ctx.practiceId, reason: i.optInEnabled ? "Opt-in page switched on" : "Opt-in page switched off" }, user.name ?? undefined);
  revalidatePath(back);
  redirect(`${back}?saved=optin`);
}
