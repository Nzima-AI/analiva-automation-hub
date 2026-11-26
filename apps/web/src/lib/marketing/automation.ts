import "server-only";
import { saMoment, saParts, simulateOutcome, tagReply, type TenantContext } from "@aah/core";
import { audit, rootDb, tenantDb, type TenantDb } from "@aah/db";
import { clientDeadlines } from "@/lib/compliance";
import { checkConnection, sendTemplate, type WaTemplate } from "@/lib/whatsapp";
import { campaignStats, costFor, learnBestHours, marketingSettings, sendPracticeEmail, systemCtx, trackedLink } from "./engine";

/** Templates the demo uses when no Meta account is connected (they read like approved ones). */
export const DEMO_TEMPLATES: WaTemplate[] = [
  {
    name: "analiva_launch", language: "en", status: "APPROVED", category: "MARKETING", bodyParams: 2, header: "IMAGE",
    bodyText: "Hi {{1}} 👋\n\nYour books are in good hands, and now your numbers can be too. Analiva shows your reports, VAT and payroll in one place, updated every day.\n\nSet it up in two minutes: {{2}}",
    quickReplies: ["Sign me up", "Call me back", "Not now"], urlButton: false, carousel: false,
  },
  {
    name: "analiva_reminder", language: "en", status: "APPROVED", category: "MARKETING", bodyParams: 1, header: null,
    bodyText: "Hi {{1}}, just a reminder: your Analiva access is ready whenever you are. It takes two minutes.",
    quickReplies: ["Sign me up", "Not now"], urlButton: true, carousel: false,
  },
  {
    name: "analiva_services", language: "en", status: "APPROVED", category: "MARKETING", bodyParams: 1, header: null,
    bodyText: "Hi {{1}}, swipe through what Analiva can do for your business 👉",
    quickReplies: [], urlButton: false, carousel: true,
  },
  {
    name: "vat_reminder", language: "en", status: "APPROVED", category: "UTILITY", bodyParams: 3, header: null,
    bodyText: "Hi {{1}}, your {{2}} is due on {{3}}. Please send us anything outstanding so we can submit it on time.",
    quickReplies: ["Done, sent it", "Call me back"], urlButton: false, carousel: false,
  },
];

const FIRST_NAMES = ["Thandi", "Sipho", "Lerato", "Johan", "Ayesha", "Bongani", "Marike", "Naledi", "Pieter", "Zanele", "Ravi", "Karabo", "Anele", "Chris", "Fatima", "Lindiwe", "Riaan", "Mpho", "Nomvula", "Kagiso"];
const SURNAMES = ["Nkosi", "Dube", "Mokoena", "van Wyk", "Patel", "Khumalo", "Botha", "Sithole", "Nel", "Mthembu", "Naidoo", "Molefe", "Zulu", "Pretorius", "Essop", "Ngcobo", "du Plessis", "Tau", "Shabalala", "Mabena"];
const BUSINESS = ["Trading", "Logistics", "Holdings", "Boerdery", "Pharmacy", "Builders", "Bakery", "Designs", "Motors", "Catering", "Imports", "Media", "Spaza", "Engineering", "Clothing", "Cleaning", "Plumbing", "Transport", "Salon", "Consulting"];
const REGIONS = ["Gauteng", "Gauteng", "Gauteng", "KwaZulu-Natal", "Western Cape", "Western Cape", "Eastern Cape", "Free State", "Limpopo", "Mpumalanga"];
const SEGMENTS = [["past client", "payroll"], ["past client", "bookkeeping"], ["past client", "vip"], ["past client"], ["prospect"]];

/**
 * Fills the practice with demo contacts and eight weeks of campaign history
 * (sent at many different hours, with simulated results), and switches demo mode on.
 * Demo contacts are tagged "demo" and use 27 82 000 xxxx numbers, so they're easy to spot and remove.
 */
export async function seedDemo(db: TenantDb, ctx: TenantContext) {
  const existing = await db.marketingLead.count({ where: { tags: { has: "demo" } } });
  if (existing) return { created: 0, already: existing };
  const now = Date.now();
  const leads = [];
  for (let i = 0; i < 180; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const surname = SURNAMES[(i * 7 + Math.floor(i / 20)) % SURNAMES.length]!;
    leads.push({
      practiceId: ctx.practiceId, ownerId: ctx.userId, source: "IMPORT" as const, interest: (["PAYROLL", "BOOKKEEPING", "REPORTING"] as const)[i % 3]!,
      name: `${first} ${surname}`,
      company: `${surname.replace(/^(van|du) /, "")} ${BUSINESS[(i * 3) % BUSINESS.length]}`,
      phone: `2782000${String(1000 + i).padStart(4, "0")}`,
      email: i % 3 ? `demo${i}@example.com` : null,
      tags: ["demo", ...SEGMENTS[i % SEGMENTS.length]!],
      region: REGIONS[i % REGIONS.length],
      whatsappConsentAt: new Date(now - 60 * 86_400_000), consentAt: i % 3 ? new Date(now - 60 * 86_400_000) : null,
      consentEvidence: "Demo contact",
    });
  }
  const created = await db.marketingLead.createManyAndReturn({ data: leads, select: { id: true, phone: true, name: true } });

  // Eight weeks of history: one campaign a week, messages spread across days and hours.
  const names = ["Welcome to the new year", "Tax season heads-up", "Payroll made simple", "VAT reminder service", "Analiva preview", "Client survey", "Year-end checklist", "Analiva early access"];
  for (let w = 0; w < names.length; w++) {
    const weekStart = now - (8 - w) * 7 * 86_400_000;
    const campaign = await db.marketingCampaign.create({
      data: {
        practiceId: ctx.practiceId, createdById: ctx.userId, name: names[w]!, channel: "WHATSAPP", subject: "analiva_launch", body: "", status: "SENT",
        whatsappTemplate: w % 2 ? "analiva_reminder" : "analiva_launch", templateLanguage: "en", templateParams: ["firstName", "link"], tags: ["past client"],
        ctaUrl: "https://analiva.app", buttonActions: { "Sign me up": "SEND_LINK", "Call me back": "CALLBACK", "Not now": "NOT_NOW" },
        approvedAt: new Date(weekStart), approvedById: ctx.userId, startedAt: new Date(weekStart), finishedAt: new Date(weekStart + 86_400_000), createdAt: new Date(weekStart - 86_400_000),
      },
    });
    const rows = created.slice(0, 150).map((lead, i) => {
      const day = (i * 7 + w) % 6; // Mon-Sat spread
      const hour = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18][(i + w * 5) % 12]!;
      // A South African weekday and hour, so the heatmap and best hours read correctly.
      const when = saParts(new Date(weekStart + day * 86_400_000));
      const dayOf = when.dow === 0 ? saParts(new Date(weekStart + (day + 1) * 86_400_000)).day : when.day;
      const sentAt = new Date(saMoment(dayOf, hour).getTime() + (i % 50) * 1000);
      const o = simulateOutcome(`${campaign.id}:${lead.id}`, hour, true);
      const at = (min: number | null) => (min == null || !Number.isFinite(min) ? null : new Date(sentAt.getTime() + min * 60_000));
      const readAt = at(o.readAfterMin);
      return {
        practiceId: ctx.practiceId, campaignId: campaign.id, leadId: lead.id, channel: "WHATSAPP" as const, toAddress: lead.phone!, simulated: true,
        status: readAt ? ("READ" as const) : Number.isFinite(o.deliveredAfterMin) ? ("DELIVERED" as const) : ("FAILED" as const),
        error: Number.isFinite(o.deliveredAfterMin) ? null : "Not on WhatsApp", sentAt, deliveredAt: at(o.deliveredAfterMin), readAt,
        clickedAt: o.clicked && readAt ? new Date(readAt.getTime() + 120_000) : null,
        repliedAt: o.reply && readAt ? new Date(readAt.getTime() + 240_000) : null,
        signedUpAt: o.signedUp && readAt ? new Date(readAt.getTime() + 720_000) : null,
        costCents: 70,
      };
    });
    await db.marketingSend.createMany({ data: rows });
    if (w === names.length - 1) {
      for (const row of rows.filter((r) => r.repliedAt).slice(0, 12)) {
        const lead = created.find((l) => l.id === row.leadId)!;
        const body = ["Yes please, sounds great!", "How much does it cost?", "Please call me tomorrow morning", "Interested. Can you send more info?"][Math.floor(Math.random() * 4)]!;
        const tag = tagReply(body);
        await db.whatsAppMessage.create({ data: { practiceId: ctx.practiceId, leadId: lead.id, fromPhone: lead.phone!, fromName: lead.name, body, providerId: `demo.seed.${row.leadId}.${w}`, tag, receivedAt: row.repliedAt! } });
        if (tag === "CALLBACK") await db.marketingTask.create({ data: { practiceId: ctx.practiceId, leadId: lead.id, note: body } });
      }
    }
  }
  const signed = await db.marketingSend.findMany({ where: { signedUpAt: { not: null }, simulated: true }, select: { leadId: true, signedUpAt: true } });
  for (const s of signed) await db.marketingLead.updateMany({ where: { id: s.leadId, signedUpAt: null }, data: { signedUpAt: s.signedUpAt, stage: "WON" } });
  for (const lead of created.slice(3, 5)) await db.marketingTask.create({ data: { practiceId: ctx.practiceId, leadId: lead.id, note: "Please call me tomorrow morning" } });
  await learnBestHours(db);
  await db.marketingSettings.upsert({ where: { practiceId: ctx.practiceId }, create: { practiceId: ctx.practiceId, demoMode: true, monthlyBudgetCents: 300_000 }, update: { demoMode: true } });
  await db.marketingSavedReply.createMany({
    data: [
      { practiceId: ctx.practiceId, title: "Pricing", body: "Analiva is included for our clients at no extra cost. You only need two minutes to set it up: we'll send you the link." },
      { practiceId: ctx.practiceId, title: "Call back", body: "Thanks! One of our team will call you today. What time suits you best?" },
      { practiceId: ctx.practiceId, title: "Sign-up help", body: "Happy to help. Reply with your email address and we'll set it up for you." },
    ],
  });
  // Keyword auto-replies and a few notes, so every CRM feature shows something in the demo.
  for (const [keyword, reply, hits] of [
    ["PRICE", "Analiva plans start at R 289 a month, with a 14-day free trial. Reply CALL and we'll phone you to set it up.", 37],
    ["VAT", "Your VAT201 is due on the 25th of the month after your period ends. Send us your invoices by the 10th and we'll do the rest.", 22],
    ["HOURS", "We're open Monday to Friday, 08:00 to 17:00. WhatsApp us any time and we'll reply first thing.", 9],
  ] as const) {
    await db.marketingKeyword.upsert({ where: { practiceId_keyword: { practiceId: ctx.practiceId, keyword } }, create: { practiceId: ctx.practiceId, keyword, reply, hits }, update: {} });
  }
  const notes = ["Spoke on the phone: wants payroll from March. Send the Business plan.", "Asked about VAT registration for the new branch.", "Prefers WhatsApp to email. Follow up after month-end."];
  for (const [k, lead] of created.slice(0, 3).entries()) await db.marketingNote.create({ data: { practiceId: ctx.practiceId, leadId: lead.id, body: notes[k]!, createdById: ctx.userId } });
  await audit(ctx, { action: "lead.imported", entityType: "MarketingLead", entityId: ctx.practiceId, reason: `Demo data: ${created.length} contacts and 8 weeks of campaign history` });
  return { created: created.length, already: 0 };
}

/** Removes everything the demo created (contacts tagged "demo", their campaigns and messages). */
export async function clearDemo(db: TenantDb) {
  const leads = await db.marketingLead.findMany({ where: { tags: { has: "demo" } }, select: { id: true } });
  const ids = leads.map((l) => l.id);
  const campaigns = await db.marketingSend.findMany({ where: { leadId: { in: ids } }, select: { campaignId: true }, distinct: ["campaignId"] });
  await db.marketingSend.deleteMany({ where: { leadId: { in: ids } } });
  await db.whatsAppMessage.deleteMany({ where: { OR: [{ leadId: { in: ids } }, { providerId: { startsWith: "demo." } }] } });
  await db.marketingTask.deleteMany({ where: { leadId: { in: ids } } });
  await db.sequenceEnrollment.deleteMany({ where: { leadId: { in: ids } } });
  for (const c of campaigns) {
    if (!(await db.marketingSend.count({ where: { campaignId: c.campaignId } }))) await db.marketingCampaign.deleteMany({ where: { id: c.campaignId } });
  }
  await db.marketingLead.deleteMany({ where: { id: { in: ids } } });
  await db.marketingSettings.updateMany({ data: { demoMode: false } });
  return ids.length;
}

interface SequenceStep { delayHours: number; template: string; language?: string; params?: string[]; condition?: "ALL" | "NOT_CLICKED" | "NOT_SIGNED_UP" }

/** Enrols new people in active sequences and sends every step that's due. */
export async function runSequences(deadline: number) {
  const sequences = await rootDb().marketingSequence.findMany({ where: { active: true } });
  let sent = 0;
  for (const seq of sequences) {
    if (Date.now() > deadline) break;
    const db = tenantDb(systemCtx(seq.practiceId));
    const steps = (seq.steps as unknown as SequenceStep[]) ?? [];
    if (!steps.length) continue;
    const enrolled = new Set((await db.sequenceEnrollment.findMany({ where: { sequenceId: seq.id }, select: { leadId: true } })).map((e) => e.leadId));
    let candidates: Array<{ leadId: string; at: Date }> = [];
    if (seq.trigger === "NEW_CONTACT") {
      candidates = (await db.marketingLead.findMany({ where: { createdAt: { gte: seq.createdAt }, whatsappConsentAt: { not: null } }, select: { id: true, createdAt: true } })).map((l) => ({ leadId: l.id, at: l.createdAt }));
    } else if (seq.trigger === "SIGNED_UP") {
      candidates = (await db.marketingLead.findMany({ where: { signedUpAt: { gte: seq.createdAt } }, select: { id: true, signedUpAt: true } })).map((l) => ({ leadId: l.id, at: l.signedUpAt! }));
    } else if (seq.trigger === "CAMPAIGN_SENT" && seq.triggerRef) {
      candidates = (await db.marketingSend.findMany({ where: { campaignId: seq.triggerRef, sentAt: { not: null } }, select: { leadId: true, sentAt: true } })).map((s) => ({ leadId: s.leadId, at: s.sentAt! }));
    }
    const fresh = candidates.filter((c) => !enrolled.has(c.leadId));
    if (fresh.length) {
      await db.sequenceEnrollment.createMany({
        data: fresh.map((c) => ({ practiceId: seq.practiceId, sequenceId: seq.id, leadId: c.leadId, nextAt: new Date(c.at.getTime() + steps[0]!.delayHours * 3600_000) })),
        skipDuplicates: true,
      });
    }
    const due = await db.sequenceEnrollment.findMany({ where: { sequenceId: seq.id, doneAt: null, nextAt: { lte: new Date() } }, take: 100 });
    if (!due.length) continue;
    const [settings, whatsapp] = await Promise.all([marketingSettings(db), db.whatsAppSetting.findFirst()]);
    for (const e of due) {
      const step = steps[e.step];
      const lead = await db.marketingLead.findFirst({ where: { id: e.leadId } });
      if (!step || !lead) { await db.sequenceEnrollment.updateMany({ where: { id: e.id }, data: { doneAt: new Date() } }); continue; }
      const stop = lead.whatsappOptedOutAt || !lead.phone || (lead.snoozedUntil && lead.snoozedUntil > new Date())
        || (step.condition === "NOT_SIGNED_UP" && lead.signedUpAt)
        || (step.condition === "NOT_CLICKED" && lead.lastClickedAt && lead.lastClickedAt > e.createdAt);
      if (!stop && (whatsapp || settings.demoMode)) {
        if (!settings.demoMode) {
          const r = await sendTemplate(whatsapp!, { to: lead.phone!, template: step.template, language: step.language ?? "en", params: (step.params ?? ["firstName"]).map((p) => (p === "firstName" ? lead.name.split(" ")[0]! : p === "company" ? lead.company || "-" : p)) });
          if (!r.ok && r.retry) continue;
        }
        await db.whatsAppMessage.create({ data: { practiceId: seq.practiceId, leadId: lead.id, fromPhone: lead.phone!, direction: "OUT", body: `[${seq.name} · step ${e.step + 1}] ${step.template}`, providerId: `seq.${e.id}.${e.step}`, handledAt: new Date() } });
        sent++;
      }
      const next = steps[e.step + 1];
      await db.sequenceEnrollment.updateMany({ where: { id: e.id }, data: stop || !next ? { doneAt: new Date() } : { step: e.step + 1, nextAt: new Date(Date.now() + next.delayHours * 3600_000) } });
    }
  }
  return sent;
}

/** Once a day: WhatsApp compliance reminders for filings due in N days (utility rate). */
export async function runReminders() {
  const today = saParts(new Date()).day;
  const rules = await rootDb().reminderRule.findMany({ where: { active: true } });
  let sent = 0;
  for (const rule of rules) {
    if (rule.lastRunAt && saParts(rule.lastRunAt).day === today) continue;
    const db = tenantDb(systemCtx(rule.practiceId));
    const [settings, whatsapp] = await Promise.all([marketingSettings(db), db.whatsAppSetting.findFirst()]);
    const target = new Date(Date.parse(`${today}T00:00:00Z`) + rule.daysBefore * 86_400_000);
    const deadlines = rule.kind === "FILING_DUE" ? (await clientDeadlines(db, { from: target, to: target })).filter((d) => !d.done) : [];
    for (const d of deadlines) {
      const leads = await db.marketingLead.findMany({ where: { clientId: d.clientId, phone: { not: null }, whatsappConsentAt: { not: null }, whatsappOptedOutAt: null } });
      for (const lead of leads) {
        const values: Record<string, string> = { firstName: lead.name.split(" ")[0]!, company: d.clientName, filing: `${d.label} (${d.periodLabel})`, dueDate: d.dueDate.toISOString().slice(0, 10) };
        if (!settings.demoMode && whatsapp) {
          const r = await sendTemplate(whatsapp, { to: lead.phone!, template: rule.template, language: rule.language, params: (rule.params.length ? rule.params : ["firstName", "filing", "dueDate"]).map((p) => values[p] ?? p) });
          if (!r.ok) continue;
        }
        await db.whatsAppMessage.create({ data: { practiceId: rule.practiceId, leadId: lead.id, fromPhone: lead.phone!, direction: "OUT", body: `Reminder: ${values.filing} due ${values.dueDate}`, providerId: `rem.${rule.id}.${lead.id}.${d.periodKey}`, handledAt: new Date() } });
        sent++;
      }
    }
    await db.reminderRule.updateMany({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
  }
  return sent;
}

/** Every six hours: Meta's quality rating and messaging tier; alerts when quality drops. */
export async function refreshQuality() {
  const settings = await rootDb().whatsAppSetting.findMany({ where: { OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(Date.now() - 6 * 3600_000) } }] } });
  for (const s of settings) {
    const r = await checkConnection(s);
    if (!r.ok) continue;
    const db = tenantDb(systemCtx(s.practiceId));
    if (r.quality && s.qualityRating && r.quality !== s.qualityRating && /RED|YELLOW|LOW|MEDIUM/i.test(r.quality)) {
      await db.marketingAlert.create({ data: { practiceId: s.practiceId, kind: "QUALITY", message: `Meta rates your WhatsApp quality ${r.quality.toLowerCase()} (was ${s.qualityRating.toLowerCase()}). Slow down campaigns and check opt-outs.` } });
    }
    await db.whatsAppSetting.updateMany({ where: { id: s.id }, data: { qualityRating: r.quality || null, messagingTier: r.tier || null, checkedAt: new Date() } });
  }
}

/** Mondays after 07:00: a one-page summary of last week to the practice owners. */
export async function weeklyReports() {
  const { dow, hour } = saParts(new Date());
  if (dow !== 1 || hour < 7) return 0;
  const practices = await rootDb().marketingSettings.findMany({ where: { weeklyReport: true, OR: [{ lastWeeklyReportAt: null }, { lastWeeklyReportAt: { lt: new Date(Date.now() - 6 * 86_400_000) } }] } });
  let sent = 0;
  for (const s of practices) {
    const db = tenantDb(systemCtx(s.practiceId));
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [practice, owners, sends, signups, replies, campaigns] = await Promise.all([
      db.practice.findFirst({ select: { name: true } }),
      db.user.findMany({ where: { role: "OWNER", disabledAt: null }, select: { email: true } }),
      db.marketingSend.findMany({ where: { sentAt: { gte: since } }, select: { readAt: true, clickedAt: true, costCents: true } }),
      db.marketingLead.count({ where: { signedUpAt: { gte: since } } }),
      db.whatsAppMessage.count({ where: { direction: "IN", receivedAt: { gte: since } } }),
      db.marketingCampaign.findMany({ where: { startedAt: { gte: since } }, select: { id: true, name: true } }),
    ]);
    const read = sends.filter((x) => x.readAt).length;
    const clicked = sends.filter((x) => x.clickedAt).length;
    const cost = sends.reduce((t, x) => t + x.costCents, 0);
    const lines = await Promise.all(campaigns.map(async (c) => { const st = await campaignStats(db, c.id); return `• ${c.name}: ${st.sent} sent, ${st.read} read, ${st.clicked} clicked, ${st.signedUp} signed up`; }));
    const body = [
      `Your WhatsApp and email marketing for the past 7 days:`,
      ``,
      `Messages sent: ${sends.length}`,
      `Read: ${read} (${sends.length ? Math.round((read / sends.length) * 100) : 0}%)`,
      `Clicked: ${clicked}`,
      `New sign-ups: ${signups}`,
      `Replies: ${replies}`,
      `WhatsApp spend: R ${(cost / 100).toFixed(2)}${signups ? ` (R ${(cost / 100 / signups).toFixed(2)} per sign-up)` : ""}`,
      ...(lines.length ? [``, `Campaigns:`, ...lines] : []),
      ``,
      `See the details in the Hub: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/marketing/analytics`,
    ].join("\n");
    for (const o of owners) if (await sendPracticeEmail(db, o.email, `Your weekly marketing report`, body, practice?.name ?? "Your practice")) sent++;
    await db.marketingSettings.updateMany({ where: { id: s.id }, data: { lastWeeklyReportAt: new Date() } });
  }
  return sent;
}

/** Sends a free-form text inside the 24-hour window and logs it in the inbox thread. */
export async function logOutbound(db: TenantDb, practiceId: string, leadId: string | null, phone: string, body: string, providerId: string, userId?: string) {
  await db.whatsAppMessage.create({ data: { practiceId, leadId, fromPhone: phone, direction: "OUT", body, providerId, sentById: userId ?? null, handledAt: new Date() } });
}

export { costFor, trackedLink };

/** Approved templates: Meta's, or the demo set in demo mode or before Meta is connected. */
export async function availableTemplates(db: TenantDb): Promise<{ templates: WaTemplate[]; error: string | null; demo: boolean }> {
  const [settings, setting] = await Promise.all([marketingSettings(db), db.whatsAppSetting.findFirst()]);
  if (settings.demoMode || !setting) return { templates: DEMO_TEMPLATES, error: null, demo: true };
  const { listTemplates } = await import("@/lib/whatsapp");
  const r = await listTemplates(setting);
  return { templates: r.templates.filter((t) => t.status === "APPROVED"), error: r.error, demo: false };
}

/**
 * Puts the Demo Practice (slug "demo", used by "Explore the demo") back to its starting point:
 * removes campaigns visitors created and rebuilds the demo contacts and history. Runs nightly.
 */
export async function resetDemoPractice() {
  const practice = await rootDb().practice.findUnique({ where: { slug: "demo" }, select: { id: true } });
  if (!practice) return { reset: false };
  const owner = await rootDb().user.findFirst({ where: { practiceId: practice.id, role: "OWNER", disabledAt: null }, select: { id: true } });
  if (!owner) return { reset: false };
  const ctx = { practiceId: practice.id, userId: owner.id, role: "OWNER" as const, clientId: null };
  const db = tenantDb(ctx);
  const visitorCampaigns = await db.marketingCampaign.findMany({ where: { createdById: { not: owner.id } }, select: { id: true } });
  const ids = visitorCampaigns.map((c) => c.id);
  if (ids.length) {
    await db.marketingSend.deleteMany({ where: { campaignId: { in: ids } } });
    await db.marketingCampaign.deleteMany({ where: { id: { in: ids } } });
  }
  await db.marketingTask.deleteMany({});
  const cleared = await clearDemo(db);
  const seeded = await seedDemo(db, ctx);
  await db.marketingSettings.updateMany({ data: { demoMode: true } });
  return { reset: true, visitorCampaigns: ids.length, cleared, seeded };
}
