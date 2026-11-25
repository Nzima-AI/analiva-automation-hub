import "server-only";
import {
  bestSlots,
  engagementScore,
  forecast,
  readHours,
  sendTimeHeatmap,
  timeToRead,
  type EngagementBand,
  type SendFacts,
} from "@aah/core";
import type { TenantDb } from "@aah/db";
import { campaignStats, marketingSettings, monthSpendCents } from "./engine";

const DAY = 86_400_000;

/** Everything the Overview (mission control) needs. */
export async function overviewData(db: TenantDb) {
  const weekAgo = new Date(Date.now() - 7 * DAY);
  const dayStart = new Date(Date.now() - DAY);
  const [settings, whatsapp, spent, running, alerts, waiting, tasks, weekSends, signupsWeek, contacts, reachable] = await Promise.all([
    marketingSettings(db),
    db.whatsAppSetting.findFirst(),
    monthSpendCents(db),
    db.marketingCampaign.findMany({ where: { status: { in: ["SENDING", "PAUSED"] } }, orderBy: { startedAt: "desc" }, take: 3 }),
    db.marketingAlert.findMany({ where: { readAt: null }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.whatsAppMessage.count({ where: { direction: "IN", handledAt: null, optOut: false } }),
    db.marketingTask.count({ where: { doneAt: null } }),
    db.marketingSend.findMany({ where: { sentAt: { gte: weekAgo } }, select: { sentAt: true, readAt: true, clickedAt: true, repliedAt: true, signedUpAt: true } }),
    db.marketingLead.count({ where: { signedUpAt: { gte: weekAgo } } }),
    db.marketingLead.count(),
    db.marketingLead.count({ where: { phone: { not: null }, whatsappConsentAt: { not: null }, whatsappOptedOutAt: null } }),
  ]);
  const latest = running[0] ?? (await db.marketingCampaign.findFirst({ where: { status: "SENT" }, orderBy: { finishedAt: "desc" } }));
  const live = latest ? await liveCampaign(db, latest.id) : null;
  const sentToday = weekSends.filter((s) => s.sentAt && s.sentAt >= dayStart).length;
  const read = weekSends.filter((s) => s.readAt).length;
  return {
    settings, whatsapp, spent, alerts, waiting, tasks, contacts, reachable, signupsWeek, sentToday,
    sentWeek: weekSends.length, readRate: weekSends.length ? Math.round((read / weekSends.length) * 100) : 0,
    live, hot: await hotLeads(db, 8), best: bestSlots(sendTimeHeatmap(await recentSends(db)), 10, 3),
  };
}

async function recentSends(db: TenantDb, days = 120): Promise<SendFacts[]> {
  return db.marketingSend.findMany({
    where: { sentAt: { gte: new Date(Date.now() - days * DAY) } },
    select: { sentAt: true, deliveredAt: true, readAt: true, clickedAt: true, repliedAt: true, signedUpAt: true },
    take: 50_000,
  });
}

/** One campaign as it happens: funnel, money, forecast, latest replies. */
export async function liveCampaign(db: TenantDb, campaignId: string) {
  const campaign = await db.marketingCampaign.findFirst({ where: { id: campaignId } });
  if (!campaign) return null;
  const [stats, replies, settings] = await Promise.all([
    campaignStats(db, campaignId),
    db.whatsAppMessage.findMany({
      where: { direction: "IN", leadId: { in: (await db.marketingSend.findMany({ where: { campaignId, repliedAt: { not: null } }, select: { leadId: true }, take: 200 })).map((s) => s.leadId) } },
      orderBy: { receivedAt: "desc" },
      take: 8,
    }),
    marketingSettings(db),
  ]);
  const elapsedHours = campaign.startedAt ? (Date.now() - campaign.startedAt.getTime()) / 3600_000 : 0;
  const costCents = stats.costCents || (settings.demoMode ? stats.sent * settings.marketingCostCents : 0);
  return {
    campaign, stats, replies, costCents,
    forecast: campaign.status === "SENT" && elapsedHours > 48 ? null : forecast({ clicked: stats.clicked, signedUp: stats.signedUp, elapsedHours }),
    perSignup: stats.signedUp ? Math.round(costCents / stats.signedUp) : null,
  };
}

export interface HotLead { id: string; name: string; company: string; phone: string | null; score: number; band: EngagementBand; bestHour: number | null; lastClickedAt: Date | null }

/** The warmest people who haven't signed up yet: who to phone today. */
export async function hotLeads(db: TenantDb, take = 15): Promise<HotLead[]> {
  const leads = await db.marketingLead.findMany({
    where: { signedUpAt: null, whatsappOptedOutAt: null, OR: [{ lastClickedAt: { not: null } }, { lastRepliedAt: { not: null } }, { sends: { some: { readAt: { not: null } } } }] },
    select: { id: true, name: true, company: true, phone: true, bestHour: true, lastClickedAt: true, sends: { select: { sentAt: true, readAt: true, clickedAt: true, repliedAt: true, signedUpAt: true }, take: 20, orderBy: { createdAt: "desc" } } },
    take: 2000,
  });
  return leads
    .map((l) => ({ id: l.id, name: l.name, company: l.company, phone: l.phone, bestHour: l.bestHour, lastClickedAt: l.lastClickedAt, ...engagementScore(l.sends, null) }))
    .filter((l) => l.band === "Hot" || l.band === "Warm")
    .sort((a, b) => b.score - a.score)
    .slice(0, take);
}

/** The Analytics page: timing, speed, campaigns compared, segments, regions, engagement, return on spend. */
export async function analyticsData(db: TenantDb, days: number) {
  const since = new Date(Date.now() - days * DAY);
  const sends = await db.marketingSend.findMany({
    where: { sentAt: { gte: since } },
    select: { sentAt: true, deliveredAt: true, readAt: true, clickedAt: true, repliedAt: true, signedUpAt: true, costCents: true, campaignId: true, lead: { select: { tags: true, region: true, interest: true } } },
    take: 50_000,
  });
  const settings = await marketingSettings(db);
  const cells = sendTimeHeatmap(sends);
  const campaigns = await db.marketingCampaign.findMany({ where: { id: { in: [...new Set(sends.map((s) => s.campaignId))] } }, select: { id: true, name: true, channel: true, startedAt: true, whatsappTemplate: true } });
  const group = <K extends string>(key: (s: (typeof sends)[number]) => K[] | K | null) => {
    const map = new Map<string, { sent: number; read: number; clicked: number; signedUp: number; cost: number }>();
    for (const s of sends) {
      const keys = key(s);
      for (const k of Array.isArray(keys) ? keys : keys ? [keys] : []) {
        const g = map.get(k) ?? { sent: 0, read: 0, clicked: 0, signedUp: 0, cost: 0 };
        g.sent++;
        if (s.readAt) g.read++;
        if (s.clickedAt) g.clicked++;
        if (s.signedUpAt) g.signedUp++;
        g.cost += s.costCents || (settings.demoMode ? settings.marketingCostCents : 0);
        map.set(k, g);
      }
    }
    return [...map.entries()].map(([name, g]) => ({ name, ...g })).sort((a, b) => b.sent - a.sent);
  };
  const byCampaign = group((s) => s.campaignId).map((g) => {
    const c = campaigns.find((x) => x.id === g.name);
    return { ...g, id: g.name, name: c?.name ?? "Campaign", startedAt: c?.startedAt ?? null, template: c?.whatsappTemplate ?? null };
  }).sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
  const bySegment = group((s) => s.lead.tags.filter((t) => t !== "demo")).slice(0, 10);
  const byRegion = group((s) => s.lead.region ?? "Unknown");
  const byInterest = group((s) => s.lead.interest);

  const leadSends = await db.marketingLead.findMany({
    select: { signedUpAt: true, sends: { select: { sentAt: true, readAt: true, clickedAt: true, repliedAt: true, signedUpAt: true }, take: 20, orderBy: { createdAt: "desc" } } },
    take: 10_000,
  });
  const bands: Record<EngagementBand, number> = { Customer: 0, Hot: 0, Warm: 0, Cold: 0, Dormant: 0, New: 0 };
  for (const l of leadSends) bands[engagementScore(l.sends, l.signedUpAt).band]++;

  const totals = group(() => "all")[0] ?? { sent: 0, read: 0, clicked: 0, signedUp: 0, cost: 0 };
  return {
    days, cells, best: bestSlots(cells, 10, 5), readHours: readHours(sends.map((s) => s.readAt)), timeToRead: timeToRead(sends),
    byCampaign, bySegment, byRegion, byInterest, bands, totals,
    perSignup: totals.signedUp ? Math.round(totals.cost / totals.signedUp) : null,
  };
}
