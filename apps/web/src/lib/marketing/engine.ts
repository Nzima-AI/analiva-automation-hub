import "server-only";
import nodemailer from "nodemailer";
import {
  abWinner,
  bestHourFor,
  bestSlots,
  followUpMatches,
  nextSendTime,
  renderMerge,
  renderMessage,
  sendTimeHeatmap,
  simulateOutcome,
  saParts,
  tagReply,
  templateValues,
  type TenantContext,
} from "@aah/core";
import { decryptSecret } from "@aah/core/secrets";
import { audit, rootDb, tenantDb, type MarketingCampaign, type MarketingLead, type Prisma, type TenantDb } from "@aah/db";
import { secretsKey } from "@/lib/env";
import { sendTemplate, tierLimit } from "@/lib/whatsapp";

/** cPanel and most shared mailboxes refuse more than a few hundred messages an hour. */
const EMAILS_PER_RUN = Number(process.env.MARKETING_EMAILS_PER_RUN ?? 8);

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const trackedLink = (sendToken: string) => `${appUrl()}/r/${sendToken}`;
export const unsubscribeLink = (leadToken: string) => `${appUrl()}/u/${leadToken}`;
export const referralLink = (leadToken: string) => `${appUrl()}/j/${leadToken}`;

export const systemCtx = (practiceId: string): TenantContext => ({ practiceId, userId: "system", role: "OWNER", clientId: null });

export const DEFAULT_SETTINGS = {
  marketingCostCents: 70,
  utilityCostCents: 18,
  monthlyBudgetCents: null as number | null,
  quietStart: 19,
  quietEnd: 7,
  skipSundays: true,
  skipHolidays: true,
  autoPausePct: 3,
  dailyLimit: 250,
  demoMode: false,
  autoReplyText: null as string | null,
  weeklyReport: true,
  lastWeeklyReportAt: null as Date | null,
  optInEnabled: false,
  optInHeadline: null as string | null,
};
export type Settings = typeof DEFAULT_SETTINGS & { id?: string };

export async function marketingSettings(db: TenantDb): Promise<Settings> {
  return (await db.marketingSettings.findFirst()) ?? DEFAULT_SETTINGS;
}

export const costFor = (s: Settings, category: string) => (category === "UTILITY" ? s.utilityCostCents : s.marketingCostCents);

function monthStartSa(now = new Date()) {
  const { day } = saParts(now);
  return new Date(Date.parse(`${day.slice(0, 8)}01T00:00:00Z`) - 2 * 3600_000);
}

/** WhatsApp spend this calendar month (rand cents), from delivered-or-sent messages. */
export async function monthSpendCents(db: TenantDb): Promise<number> {
  const r = await db.marketingSend.aggregate({ _sum: { costCents: true }, where: { sentAt: { gte: monthStartSa() } } });
  return r._sum.costCents ?? 0;
}

/** Who may receive a campaign on its channel: has the address, gave permission, hasn't opted out or snoozed. */
export function reachable(channel: "EMAIL" | "WHATSAPP"): Prisma.MarketingLeadWhereInput {
  const notSnoozed = { OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }] };
  return channel === "EMAIL"
    ? { email: { not: null }, consentAt: { not: null }, optedOutAt: null, ...notSnoozed }
    : { phone: { not: null }, whatsappConsentAt: { not: null }, whatsappOptedOutAt: null, ...notSnoozed };
}

/** The contacts a campaign goes to. A follow-up picks from its parent's recipients by its rule. */
export async function audienceFor(db: TenantDb, campaign: Pick<MarketingCampaign, "channel" | "interest" | "tags" | "parentId" | "followUpRule">) {
  const where: Prisma.MarketingLeadWhereInput = {
    ...reachable(campaign.channel),
    ...(campaign.interest ? { interest: campaign.interest } : {}),
    ...(campaign.tags.length ? { tags: { hasEvery: campaign.tags } } : {}),
  };
  if (campaign.parentId && campaign.followUpRule) {
    const sends = await db.marketingSend.findMany({ where: { campaignId: campaign.parentId }, select: { leadId: true, status: true, clickedAt: true, signedUpAt: true } });
    where.id = { in: sends.filter((send) => followUpMatches(campaign.followUpRule!, send)).map((send) => send.leadId) };
  }
  return where;
}

/** Audience size and expected cost, shown before sending. */
export async function estimateCampaign(db: TenantDb, campaign: MarketingCampaign) {
  const [settings, count, spent] = await Promise.all([marketingSettings(db), db.marketingLead.count({ where: await audienceFor(db, campaign) }), monthSpendCents(db)]);
  const each = campaign.channel === "WHATSAPP" ? costFor(settings, campaign.category) : 0;
  const costCents = count * each;
  const budgetLeft = settings.monthlyBudgetCents == null ? null : Math.max(0, settings.monthlyBudgetCents - spent);
  return { count, costCents, spentCents: spent, budgetLeft, overBudget: budgetLeft != null && costCents > budgetLeft };
}

/** The practice's best send hour from past campaigns (null until there's enough history). */
export async function practiceBestHour(db: TenantDb): Promise<number | null> {
  const sends = await db.marketingSend.findMany({
    where: { channel: "WHATSAPP", sentAt: { not: null } },
    select: { sentAt: true, readAt: true, clickedAt: true, repliedAt: true, signedUpAt: true },
    orderBy: { sentAt: "desc" },
    take: 5000,
  });
  return bestSlots(sendTimeHeatmap(sends), 10, 1)[0]?.hour ?? null;
}

/**
 * Puts one QUEUED row per recipient with its send time (best hour, quiet hours,
 * the daily limit spread over days, an A/B split), then the minute cron sends them.
 */
export async function queueCampaign(db: TenantDb, ctx: TenantContext, campaignId: string, actorName: string) {
  const campaign = await db.marketingCampaign.findFirst({ where: { id: campaignId } });
  if (!campaign) return { error: "Campaign not found." } as const;
  if (campaign.status !== "APPROVED") return { error: "Only an approved campaign that hasn't been sent can be sent." } as const;
  const settings = await marketingSettings(db);
  const whatsapp = campaign.channel === "WHATSAPP" ? await db.whatsAppSetting.findFirst() : null;
  if (campaign.channel === "WHATSAPP" && !whatsapp && !settings.demoMode) return { error: "Connect WhatsApp first (Marketing → Settings), or switch on demo mode." } as const;
  const estimate = await estimateCampaign(db, campaign);
  if (!estimate.count) return { error: "No contacts match this campaign's audience and permissions." } as const;
  if (estimate.overBudget) return { error: `This campaign would cost about R ${(estimate.costCents / 100).toFixed(0)}, more than the R ${((estimate.budgetLeft ?? 0) / 100).toFixed(0)} left in this month's budget. Raise the budget or narrow the audience.` } as const;

  const leads = await db.marketingLead.findMany({ where: await audienceFor(db, campaign), select: { id: true, email: true, phone: true, bestHour: true } });
  const window = { quietStart: settings.quietStart, quietEnd: settings.quietEnd, skipSundays: settings.skipSundays, skipHolidays: settings.skipHolidays };
  const start = campaign.scheduledAt && campaign.scheduledAt > new Date() ? campaign.scheduledAt : new Date();
  const fallbackHour = campaign.bestTime ? await practiceBestHour(db) : null;
  const perDay = campaign.channel === "WHATSAPP" ? tierLimit(whatsapp?.messagingTier, settings.dailyLimit) : Number.POSITIVE_INFINITY;
  const testCount = campaign.variantTemplate && campaign.testPercent ? Math.max(2, Math.round((leads.length * campaign.testPercent) / 100)) : 0;
  const testEnds = new Date(start.getTime() + (campaign.testHours ?? 4) * 3600_000);

  const rows = leads.map((lead, i) => {
    // Meta limits new conversations per 24 hours: later batches move to the following days.
    const dayOffset = Number.isFinite(perDay) ? Math.floor(i / perDay) : 0;
    const base = new Date(start.getTime() + dayOffset * 86_400_000);
    let sendAfter = nextSendTime(base, window, campaign.bestTime ? (lead.bestHour ?? fallbackHour) : null);
    const variant = i < testCount ? (i % 2 ? "B" : "A") : null;
    if (testCount && !variant && sendAfter < testEnds) sendAfter = nextSendTime(testEnds, window);
    return {
      practiceId: ctx.practiceId,
      campaignId: campaign.id,
      leadId: lead.id,
      channel: campaign.channel,
      toAddress: (campaign.channel === "EMAIL" ? lead.email : lead.phone)!,
      sendAfter: sendAfter.getTime() - Date.now() < 60_000 ? null : sendAfter,
      variant,
    };
  });
  await db.marketingSend.createMany({ data: rows, skipDuplicates: true });
  await db.marketingCampaign.updateMany({ where: { id: campaign.id, status: "APPROVED" }, data: { status: "SENDING", startedAt: start } });
  const days = Number.isFinite(perDay) ? Math.ceil(leads.length / perDay) : 1;
  await audit(ctx, { action: "campaign.queued", entityType: "MarketingCampaign", entityId: campaign.id, reason: `${leads.length} messages queued${days > 1 ? ` over ${days} days (daily limit ${perDay})` : ""}` }, actorName);
  return { queued: leads.length, days, costCents: estimate.costCents } as const;
}

async function practiceMailbox(db: TenantDb) {
  return db.mailAccount.findFirst({
    where: { enabled: true, purpose: { in: ["OUTBOUND", "BOTH"] }, secretEncrypted: { not: null } },
    orderBy: [{ isDefaultSender: "desc" }, { createdAt: "asc" }],
  });
}
type Mailbox = NonNullable<Awaited<ReturnType<typeof practiceMailbox>>>;

function transportFor(mailbox: Mailbox) {
  return nodemailer.createTransport({
    host: mailbox.smtpHost!,
    port: mailbox.smtpPort ?? 465,
    secure: mailbox.smtpSecure,
    requireTLS: !mailbox.smtpSecure,
    auth: { user: mailbox.username, pass: decryptSecret(mailbox.secretEncrypted!, secretsKey()) },
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** Sends one email from the practice mailbox (weekly report, alerts). */
export async function sendPracticeEmail(db: TenantDb, to: string, subject: string, body: string, practiceName: string) {
  const mailbox = await practiceMailbox(db);
  if (!mailbox) return false;
  const mail = renderMessage({ subject, body, signature: practiceName, footer: `${practiceName} · Analiva Automation Hub`, brandName: practiceName, brandColour: "#00AEEF" });
  const transport = transportFor(mailbox);
  try {
    await transport.sendMail({ from: { name: mailbox.displayName ?? practiceName, address: mailbox.emailAddress }, to, subject: mail.subject, text: mail.text, html: mail.html });
    return true;
  } catch (e) {
    console.error("practice email failed", e instanceof Error ? e.message : e);
    return false;
  } finally {
    transport.close();
  }
}

/** The campaign email for one contact, with the tracked link and a one-click unsubscribe (POPIA s69). */
export function composeEmail(campaign: Pick<MarketingCampaign, "subject" | "body" | "ctaUrl">, lead: Pick<MarketingLead, "name" | "company" | "token">, practiceName: string, sendToken: string | null) {
  const link = campaign.ctaUrl ? (sendToken ? trackedLink(sendToken) : campaign.ctaUrl) : null;
  let body = renderMerge(campaign.body, lead, link);
  if (link && !/\{\{\s*link\s*\}\}/i.test(campaign.body)) body += `\n\n${link}`;
  const unsubscribe = unsubscribeLink(lead.token);
  const rendered = renderMessage({
    subject: renderMerge(campaign.subject, lead, link),
    body,
    signature: practiceName,
    footer: `You're receiving this because you're a client of ${practiceName}. Unsubscribe: ${unsubscribe}`,
    brandName: practiceName,
    brandColour: "#00AEEF",
  });
  return { ...rendered, unsubscribe };
}

/** The WhatsApp template to use for a send (the A/B winner, or its own variant). */
function templateFor(campaign: MarketingCampaign, variant: string | null) {
  const useB = variant === "B" || (!variant && campaign.winner === "B");
  return useB && campaign.variantTemplate
    ? { name: campaign.variantTemplate, language: campaign.variantLanguage ?? campaign.templateLanguage ?? "en" }
    : { name: campaign.whatsappTemplate!, language: campaign.templateLanguage ?? "en" };
}

async function alert(db: TenantDb, practiceId: string, kind: string, message: string, campaignId?: string) {
  await db.marketingAlert.create({ data: { practiceId, kind, message, campaignId: campaignId ?? null } });
}

/** Picks the A/B winner once the test window has passed and the test messages have gone. */
async function decideWinner(db: TenantDb, campaign: MarketingCampaign) {
  if (!campaign.variantTemplate || campaign.winner || !campaign.startedAt) return campaign;
  if (Date.now() < campaign.startedAt.getTime() + (campaign.testHours ?? 4) * 3600_000) return campaign;
  const stats = async (variant: string) => {
    const [sent, read, clicked] = await Promise.all([
      db.marketingSend.count({ where: { campaignId: campaign.id, variant, sentAt: { not: null } } }),
      db.marketingSend.count({ where: { campaignId: campaign.id, variant, readAt: { not: null } } }),
      db.marketingSend.count({ where: { campaignId: campaign.id, variant, clickedAt: { not: null } } }),
    ]);
    return { sent, read, clicked };
  };
  const winner = abWinner(await stats("A"), await stats("B"));
  await db.marketingCampaign.updateMany({ where: { id: campaign.id }, data: { winner } });
  await alert(db, campaign.practiceId, "AB_WINNER", `"${campaign.name}": version ${winner} won the test and goes to everyone else.`, campaign.id);
  return { ...campaign, winner };
}

/** Pauses a campaign whose opt-outs climb past the practice's limit, protecting the number's quality rating. */
async function guardOptOuts(db: TenantDb, campaign: MarketingCampaign, settings: Settings) {
  const sent = await db.marketingSend.count({ where: { campaignId: campaign.id, sentAt: { not: null } } });
  if (sent < 50) return false;
  const optedOut = await db.marketingSend.count({ where: { campaignId: campaign.id, lead: { whatsappOptedOutAt: { gte: campaign.startedAt ?? new Date(0) } } } });
  if ((optedOut / sent) * 100 <= settings.autoPausePct) return false;
  await db.marketingCampaign.updateMany({ where: { id: campaign.id, status: "SENDING" }, data: { status: "PAUSED" } });
  await alert(db, campaign.practiceId, "AUTO_PAUSED", `"${campaign.name}" was paused: ${optedOut} of ${sent} people opted out (over ${settings.autoPausePct}%). Check the message before resuming.`, campaign.id);
  return true;
}

/**
 * One cron run: sends the next due messages of every campaign that is SENDING,
 * within the daily limit and the monthly budget. Demo mode marks messages sent and
 * lets the simulator play out the replies.
 */
export async function processQueue(opts: { deadline: number }) {
  const campaigns = await rootDb().marketingCampaign.findMany({ where: { status: "SENDING" }, orderBy: { startedAt: "asc" } });
  const summary: Array<{ campaign: string; sent: number; failed: number; left: number }> = [];
  for (const original of campaigns) {
    if (Date.now() > opts.deadline) break;
    const ctx = systemCtx(original.practiceId);
    const db = tenantDb(ctx);
    const campaign = await decideWinner(db, original);
    const settings = await marketingSettings(db);
    const practice = await db.practice.findFirst({ select: { name: true } });
    const whatsapp = campaign.channel === "WHATSAPP" ? await db.whatsAppSetting.findFirst() : null;
    const demo = campaign.channel === "WHATSAPP" && settings.demoMode;
    const mailbox = campaign.channel === "EMAIL" ? await practiceMailbox(db) : null;
    const now = new Date();
    const waitingForWinner = campaign.variantTemplate && !campaign.winner;

    let limit = campaign.channel === "EMAIL" ? EMAILS_PER_RUN : (whatsapp?.batchSize ?? 60);
    if (campaign.channel === "WHATSAPP" && !demo) {
      const dayCap = tierLimit(whatsapp?.messagingTier, settings.dailyLimit);
      const last24 = await db.marketingSend.count({ where: { channel: "WHATSAPP", simulated: false, sentAt: { gte: new Date(Date.now() - 86_400_000) } } });
      limit = Math.min(limit, Math.max(0, dayCap - last24));
    }
    const each = campaign.channel === "WHATSAPP" ? costFor(settings, campaign.category) : 0;
    if (each && settings.monthlyBudgetCents != null) {
      const left = settings.monthlyBudgetCents - (await monthSpendCents(db));
      const affordable = Math.floor(left / each);
      if (affordable <= 0) {
        await db.marketingCampaign.updateMany({ where: { id: campaign.id, status: "SENDING" }, data: { status: "PAUSED" } });
        await alert(db, campaign.practiceId, "BUDGET", `"${campaign.name}" paused: this month's WhatsApp budget is used up.`, campaign.id);
        continue;
      }
      limit = Math.min(limit, affordable);
    }

    const batch = limit > 0
      ? await db.marketingSend.findMany({
          where: { campaignId: campaign.id, status: "QUEUED", OR: [{ sendAfter: null }, { sendAfter: { lte: now } }], ...(waitingForWinner ? { variant: { not: null } } : {}) },
          include: { lead: true },
          take: limit,
          orderBy: { createdAt: "asc" },
        })
      : [];
    let sent = 0;
    let failed = 0;

    if (campaign.channel === "WHATSAPP" && !whatsapp && !demo) {
      await db.marketingSend.updateMany({ where: { campaignId: campaign.id, status: "QUEUED" }, data: { status: "FAILED", error: "WhatsApp isn't connected." } });
    } else if (campaign.channel === "EMAIL" && !mailbox) {
      await db.marketingSend.updateMany({ where: { campaignId: campaign.id, status: "QUEUED" }, data: { status: "FAILED", error: "No sending mailbox is set up." } });
    } else if (campaign.channel === "EMAIL") {
      const transport = transportFor(mailbox!);
      const from = { name: mailbox!.displayName ?? practice?.name ?? "", address: mailbox!.emailAddress };
      for (const send of batch) {
        if (Date.now() > opts.deadline) break;
        if (send.lead.optedOutAt || !send.lead.consentAt) {
          await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "SKIPPED", error: "Opted out" } });
          continue;
        }
        const mail = composeEmail(campaign, send.lead, practice?.name ?? "", send.token);
        try {
          const info = await transport.sendMail({
            from, to: send.toAddress, subject: mail.subject, text: mail.text, html: mail.html,
            headers: { "List-Unsubscribe": `<${mail.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          });
          await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "SENT", sentAt: new Date(), providerId: info.messageId ?? null } });
          sent++;
        } catch (e) {
          await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "FAILED", error: (e instanceof Error ? e.message : String(e)).slice(0, 300) } });
          failed++;
        }
      }
      transport.close();
    } else {
      for (const send of batch) {
        if (Date.now() > opts.deadline) break;
        if (send.lead.whatsappOptedOutAt || !send.lead.whatsappConsentAt) {
          await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "SKIPPED", error: "Opted out" } });
          continue;
        }
        const tpl = templateFor(campaign, send.variant);
        if (demo) {
          await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "SENT", sentAt: new Date(), providerId: `demo.${send.id}`, simulated: true, costCents: 0 } });
          sent++;
          continue;
        }
        const link = campaign.ctaUrl ? trackedLink(send.token) : null;
        const result = await sendTemplate(whatsapp!, {
          to: send.toAddress,
          template: tpl.name,
          language: tpl.language,
          params: templateValues(campaign.templateParams, send.lead, link),
          headerType: campaign.headerType,
          headerMediaUrl: campaign.headerMediaUrl,
          urlSuffix: campaign.urlButton ? send.token : null,
          carouselMedia: campaign.carouselMedia,
        });
        if (result.ok) {
          await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "SENT", sentAt: new Date(), providerId: result.id, costCents: each } });
          sent++;
        } else if (!result.retry) {
          await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "FAILED", error: result.error } });
          failed++;
        } else {
          break; // rate limited or Meta is down: the rest stay queued for the next run
        }
      }
    }

    if (campaign.channel === "WHATSAPP" && (await guardOptOuts(db, campaign, settings))) continue;
    const left = await db.marketingSend.count({ where: { campaignId: campaign.id, status: "QUEUED" } });
    if (!left) {
      await db.marketingCampaign.updateMany({ where: { id: campaign.id, status: "SENDING" }, data: { status: "SENT", finishedAt: new Date() } });
      await alert(db, campaign.practiceId, "FINISHED", `"${campaign.name}" has gone out to everyone.`, campaign.id);
      await audit(ctx, { action: "campaign.sent", entityType: "MarketingCampaign", entityId: campaign.id, reason: "All messages processed" }, "Campaign sender", "SYSTEM");
    }
    summary.push({ campaign: campaign.id, sent, failed, left });
  }
  return summary;
}

/**
 * Demo mode: plays out what Meta would report for simulated messages (delivered, read,
 * clicked, replies, sign-ups), each at its own moment, so dashboards move as if live.
 */
export async function simulateReceipts() {
  const since = new Date(Date.now() - 3 * 86_400_000);
  const sends = await rootDb().marketingSend.findMany({
    where: { simulated: true, sentAt: { gte: since }, OR: [{ deliveredAt: null }, { readAt: null }, { clickedAt: null }, { repliedAt: null }, { signedUpAt: null }] },
    include: { lead: { select: { id: true, phone: true, name: true } }, campaign: { select: { buttonActions: true } } },
    take: 2000,
  });
  const now = Date.now();
  let changed = 0;
  for (const s of sends) {
    const out = simulateOutcome(s.id, saParts(s.sentAt!).hour, Boolean(s.campaign.buttonActions));
    const at = (min: number) => new Date(s.sentAt!.getTime() + min * 60_000);
    const due = (min: number | null) => min != null && Number.isFinite(min) && at(min).getTime() <= now;
    const db = tenantDb(systemCtx(s.practiceId));
    const data: Prisma.MarketingSendUpdateManyMutationInput = {};
    if (!s.deliveredAt && due(out.deliveredAfterMin)) Object.assign(data, { deliveredAt: at(out.deliveredAfterMin), status: "DELIVERED" });
    if (!s.readAt && due(out.readAfterMin)) Object.assign(data, { readAt: at(out.readAfterMin!), status: "READ" });
    if (!s.clickedAt && out.clicked && due((out.readAfterMin ?? 0) + 2)) data.clickedAt = at((out.readAfterMin ?? 0) + 2);
    if (!s.signedUpAt && out.signedUp && due((out.readAfterMin ?? 0) + 12)) {
      data.signedUpAt = at((out.readAfterMin ?? 0) + 12);
      await db.marketingLead.updateMany({ where: { id: s.leadId, signedUpAt: null }, data: { signedUpAt: data.signedUpAt as Date, stage: "WON" } });
    }
    if (!s.repliedAt && out.reply && due((out.readAfterMin ?? 0) + 4)) {
      data.repliedAt = at((out.readAfterMin ?? 0) + 4);
      const tag = tagReply(out.reply);
      await db.whatsAppMessage.createMany({
        data: { practiceId: s.practiceId, leadId: s.leadId, fromPhone: s.lead.phone ?? s.toAddress, fromName: s.lead.name, body: out.reply, providerId: `demo.in.${s.id}`, optOut: tag === "STOP", tag, receivedAt: data.repliedAt as Date },
        skipDuplicates: true,
      });
      await db.marketingLead.updateMany({ where: { id: s.leadId }, data: { lastRepliedAt: data.repliedAt as Date, ...(tag === "STOP" ? { whatsappOptedOutAt: data.repliedAt as Date } : {}) } });
      if (tag === "CALLBACK") await db.marketingTask.create({ data: { practiceId: s.practiceId, leadId: s.leadId, kind: "CALLBACK", note: out.reply } });
    }
    if (Object.keys(data).length) {
      await db.marketingSend.updateMany({ where: { id: s.id }, data });
      changed++;
    }
  }
  return changed;
}

/** Learns each contact's usual reading hour from their reads, clicks and replies. */
export async function learnBestHours(db: TenantDb) {
  const sends = await db.marketingSend.findMany({
    where: { channel: "WHATSAPP", OR: [{ readAt: { not: null } }, { clickedAt: { not: null } }] },
    select: { leadId: true, readAt: true, clickedAt: true, repliedAt: true },
    take: 20_000,
    orderBy: { createdAt: "desc" },
  });
  const byLead = new Map<string, Array<Date | null>>();
  for (const s of sends) byLead.set(s.leadId, [...(byLead.get(s.leadId) ?? []), s.readAt, s.clickedAt, s.repliedAt]);
  let updated = 0;
  for (const [leadId, times] of byLead) {
    const hour = bestHourFor(times);
    if (hour != null) {
      await db.marketingLead.updateMany({ where: { id: leadId, OR: [{ bestHour: null }, { bestHour: { not: hour } }] }, data: { bestHour: hour } });
      updated++;
    }
  }
  return updated;
}

/** A test message to the staff member's own address or number; never counted in the stats. */
export async function sendTest(db: TenantDb, campaign: MarketingCampaign, to: string, practiceName: string) {
  const sample = { name: "Test Contact", company: "Test Company", token: "test" } as MarketingLead;
  if (campaign.channel === "EMAIL") {
    const mailbox = await practiceMailbox(db);
    if (!mailbox) return { ok: false, error: "No sending mailbox is set up. Add one under Settings → Email accounts." } as const;
    const mail = composeEmail(campaign, sample, practiceName, null);
    const transport = transportFor(mailbox);
    try {
      await transport.sendMail({ from: { name: mailbox.displayName ?? practiceName, address: mailbox.emailAddress }, to, subject: `[Test] ${mail.subject}`, text: mail.text, html: mail.html });
      return { ok: true } as const;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) } as const;
    } finally {
      transport.close();
    }
  }
  const settings = await marketingSettings(db);
  if (settings.demoMode) return { ok: true } as const;
  const whatsapp = await db.whatsAppSetting.findFirst();
  if (!whatsapp) return { ok: false, error: "Connect WhatsApp first." } as const;
  if (!campaign.whatsappTemplate) return { ok: false, error: "Choose an approved WhatsApp template." } as const;
  const result = await sendTemplate(whatsapp, {
    to, template: campaign.whatsappTemplate, language: campaign.templateLanguage ?? "en",
    params: templateValues(campaign.templateParams, sample, campaign.ctaUrl),
    headerType: campaign.headerType, headerMediaUrl: campaign.headerMediaUrl, urlSuffix: campaign.urlButton ? "test" : null, carouselMedia: campaign.carouselMedia,
  });
  return result.ok ? ({ ok: true } as const) : ({ ok: false, error: result.error } as const);
}

/** Per-campaign numbers for the stats cards. */
export async function campaignStats(db: TenantDb, campaignId: string) {
  const [byStatus, clicked, replied, signedUp, optedOut, cost] = await Promise.all([
    db.marketingSend.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } }),
    db.marketingSend.count({ where: { campaignId, clickedAt: { not: null } } }),
    db.marketingSend.count({ where: { campaignId, repliedAt: { not: null } } }),
    db.marketingSend.count({ where: { campaignId, signedUpAt: { not: null } } }),
    db.marketingSend.count({ where: { campaignId, lead: { OR: [{ optedOutAt: { not: null } }, { whatsappOptedOutAt: { not: null } }] } } }),
    db.marketingSend.aggregate({ _sum: { costCents: true }, where: { campaignId } }),
  ]);
  const count = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
  const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);
  // Delivered includes read; sent includes delivered and read.
  const read = count("READ");
  const delivered = count("DELIVERED") + read;
  return { total, queued: count("QUEUED"), sent: count("SENT") + delivered, delivered, read, failed: count("FAILED"), skipped: count("SKIPPED"), clicked, replied, signedUp, optedOut, costCents: cost._sum.costCents ?? 0 };
}
