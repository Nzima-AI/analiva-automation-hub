import "server-only";
import nodemailer from "nodemailer";
import { followUpMatches, renderMerge, renderMessage, templateValues, type TenantContext } from "@aah/core";
import { decryptSecret } from "@aah/core/secrets";
import { audit, rootDb, tenantDb, type MarketingCampaign, type MarketingLead, type Prisma, type TenantDb } from "@aah/db";
import { secretsKey } from "@/lib/env";
import { sendTemplate } from "@/lib/whatsapp";

/** cPanel and most shared mailboxes refuse more than a few hundred messages an hour. */
const EMAILS_PER_RUN = Number(process.env.MARKETING_EMAILS_PER_RUN ?? 8);

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const trackedLink = (sendToken: string) => `${appUrl()}/r/${sendToken}`;
export const unsubscribeLink = (leadToken: string) => `${appUrl()}/u/${leadToken}`;

const systemCtx = (practiceId: string): TenantContext => ({ practiceId, userId: "system", role: "OWNER", clientId: null });

/** Who may receive a campaign on its channel: has the address, gave permission, hasn't opted out. */
export function reachable(channel: "EMAIL" | "WHATSAPP"): Prisma.MarketingLeadWhereInput {
  return channel === "EMAIL"
    ? { email: { not: null }, consentAt: { not: null }, optedOutAt: null }
    : { phone: { not: null }, whatsappConsentAt: { not: null }, whatsappOptedOutAt: null };
}

/** The contacts a campaign goes to. A follow-up picks from its parent's recipients by its rule. */
export async function audienceFor(db: TenantDb, campaign: Pick<MarketingCampaign, "channel" | "interest" | "tags" | "parentId" | "followUpRule">) {
  const where: Prisma.MarketingLeadWhereInput = {
    ...reachable(campaign.channel),
    ...(campaign.interest ? { interest: campaign.interest } : {}),
    ...(campaign.tags.length ? { tags: { hasEvery: campaign.tags } } : {}),
  };
  if (campaign.parentId && campaign.followUpRule) {
    const sends = await db.marketingSend.findMany({
      where: { campaignId: campaign.parentId },
      select: { leadId: true, status: true, clickedAt: true, signedUpAt: true },
    });
    where.id = { in: sends.filter((send) => followUpMatches(campaign.followUpRule!, send)).map((send) => send.leadId) };
  }
  return where;
}

/** Puts one QUEUED row per recipient and starts the campaign; the minute cron does the sending. */
export async function queueCampaign(db: TenantDb, ctx: TenantContext, campaignId: string, actorName: string) {
  const campaign = await db.marketingCampaign.findFirst({ where: { id: campaignId } });
  if (!campaign) return { error: "Campaign not found." } as const;
  if (campaign.status !== "APPROVED") return { error: "Only an approved campaign that hasn't been sent can be sent." } as const;
  if (campaign.channel === "WHATSAPP" && !(await db.whatsAppSetting.findFirst())) return { error: "Connect WhatsApp first (Marketing → WhatsApp)." } as const;
  const leads = await db.marketingLead.findMany({ where: await audienceFor(db, campaign), select: { id: true, email: true, phone: true } });
  if (!leads.length) return { error: "No contacts match this campaign's audience and permissions." } as const;
  await db.marketingSend.createMany({
    data: leads.map((lead) => ({
      practiceId: ctx.practiceId,
      campaignId: campaign.id,
      leadId: lead.id,
      channel: campaign.channel,
      toAddress: (campaign.channel === "EMAIL" ? lead.email : lead.phone)!,
    })),
    skipDuplicates: true,
  });
  await db.marketingCampaign.updateMany({ where: { id: campaign.id, status: "APPROVED" }, data: { status: "SENDING", startedAt: campaign.scheduledAt ?? new Date() } });
  await audit(ctx, { action: "campaign.queued", entityType: "MarketingCampaign", entityId: campaign.id, reason: `${leads.length} ${campaign.channel === "EMAIL" ? "emails" : "WhatsApp messages"} queued` }, actorName);
  return { queued: leads.length } as const;
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

async function sendOneEmail(db: TenantDb, transport: ReturnType<typeof transportFor>, from: { name: string; address: string }, practiceName: string, campaign: MarketingCampaign, send: { id: string; token: string; toAddress: string; lead: MarketingLead }) {
  const mail = composeEmail(campaign, send.lead, practiceName, send.token);
  try {
    const info = await transport.sendMail({
      from,
      to: send.toAddress,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: { "List-Unsubscribe": `<${mail.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "SENT", sentAt: new Date(), providerId: info.messageId ?? null } });
  } catch (e) {
    await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "FAILED", error: (e instanceof Error ? e.message : String(e)).slice(0, 300) } });
  }
}

/**
 * One cron run: sends the next batch of every campaign that is SENDING and due.
 * Rows are claimed by moving QUEUED → SENT/FAILED one at a time, so an overlapping run can't double-send.
 */
export async function processQueue(opts: { deadline: number }) {
  const campaigns = await rootDb().marketingCampaign.findMany({
    where: { status: "SENDING", OR: [{ startedAt: null }, { startedAt: { lte: new Date() } }] },
    orderBy: { startedAt: "asc" },
  });
  const summary: Array<{ campaign: string; sent: number; failed: number; left: number }> = [];
  for (const campaign of campaigns) {
    if (Date.now() > opts.deadline) break;
    const ctx = systemCtx(campaign.practiceId);
    const db = tenantDb(ctx);
    const practice = await db.practice.findFirst({ select: { name: true } });
    const whatsapp = campaign.channel === "WHATSAPP" ? await db.whatsAppSetting.findFirst() : null;
    const mailbox = campaign.channel === "EMAIL" ? await practiceMailbox(db) : null;
    const limit = campaign.channel === "EMAIL" ? EMAILS_PER_RUN : (whatsapp?.batchSize ?? 60);
    const batch = await db.marketingSend.findMany({ where: { campaignId: campaign.id, status: "QUEUED" }, include: { lead: true }, take: limit, orderBy: { createdAt: "asc" } });
    let sent = 0;
    let failed = 0;

    if (campaign.channel === "WHATSAPP" && !whatsapp) {
      await db.marketingSend.updateMany({ where: { campaignId: campaign.id, status: "QUEUED" }, data: { status: "FAILED", error: "WhatsApp isn't connected." } });
    } else if (campaign.channel === "EMAIL" && !mailbox) {
      await db.marketingSend.updateMany({ where: { campaignId: campaign.id, status: "QUEUED" }, data: { status: "FAILED", error: "No sending mailbox is set up." } });
    } else if (campaign.channel === "EMAIL") {
      const transport = transportFor(mailbox!);
      const from = { name: mailbox!.displayName ?? practice?.name ?? "", address: mailbox!.emailAddress };
      for (const send of batch) {
        if (Date.now() > opts.deadline) break;
        // Permission can be withdrawn after queueing: check again just before sending.
        if (send.lead.optedOutAt || !send.lead.consentAt) {
          await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "SKIPPED", error: "Opted out" } });
          continue;
        }
        await sendOneEmail(db, transport, from, practice?.name ?? "", campaign, send);
        sent++;
      }
      transport.close();
    } else {
      for (const send of batch) {
        if (Date.now() > opts.deadline) break;
        if (send.lead.whatsappOptedOutAt || !send.lead.whatsappConsentAt) {
          await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "SKIPPED", error: "Opted out" } });
          continue;
        }
        const link = campaign.ctaUrl ? trackedLink(send.token) : null;
        const result = await sendTemplate(whatsapp!, {
          to: send.toAddress,
          template: campaign.whatsappTemplate!,
          language: campaign.templateLanguage ?? "en",
          params: templateValues(campaign.templateParams, send.lead, link),
        });
        if (result.ok) {
          await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "SENT", sentAt: new Date(), providerId: result.id } });
          sent++;
        } else if (!result.retry) {
          await db.marketingSend.updateMany({ where: { id: send.id }, data: { status: "FAILED", error: result.error } });
          failed++;
        } else {
          break; // rate limited or Meta is down: leave the rest QUEUED for the next run
        }
      }
    }

    const left = await db.marketingSend.count({ where: { campaignId: campaign.id, status: "QUEUED" } });
    if (!left) {
      await db.marketingCampaign.updateMany({ where: { id: campaign.id, status: "SENDING" }, data: { status: "SENT", finishedAt: new Date() } });
      await audit(ctx, { action: "campaign.sent", entityType: "MarketingCampaign", entityId: campaign.id, reason: "All messages processed" }, "Campaign sender", "SYSTEM");
    }
    summary.push({ campaign: campaign.id, sent, failed, left });
  }
  return summary;
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
  const whatsapp = await db.whatsAppSetting.findFirst();
  if (!whatsapp) return { ok: false, error: "Connect WhatsApp first." } as const;
  if (!campaign.whatsappTemplate) return { ok: false, error: "Choose an approved WhatsApp template." } as const;
  const result = await sendTemplate(whatsapp, { to, template: campaign.whatsappTemplate, language: campaign.templateLanguage ?? "en", params: templateValues(campaign.templateParams, sample, campaign.ctaUrl) });
  return result.ok ? ({ ok: true } as const) : ({ ok: false, error: result.error } as const);
}

/** Per-campaign numbers for the stats card. */
export async function campaignStats(db: TenantDb, campaignId: string) {
  const [byStatus, clicked, replied, signedUp, optedOut] = await Promise.all([
    db.marketingSend.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } }),
    db.marketingSend.count({ where: { campaignId, clickedAt: { not: null } } }),
    db.marketingSend.count({ where: { campaignId, repliedAt: { not: null } } }),
    db.marketingSend.count({ where: { campaignId, signedUpAt: { not: null } } }),
    db.marketingSend.count({ where: { campaignId, lead: { OR: [{ optedOutAt: { not: null } }, { whatsappOptedOutAt: { not: null } }] } } }),
  ]);
  const count = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
  const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);
  // Delivered includes read; sent includes delivered and read.
  const read = count("READ");
  const delivered = count("DELIVERED") + read;
  return { total, queued: count("QUEUED"), sent: count("SENT") + delivered, delivered, read, failed: count("FAILED"), skipped: count("SKIPPED"), clicked, replied, signedUp, optedOut };
}
