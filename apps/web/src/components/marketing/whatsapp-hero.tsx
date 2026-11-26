import Link from "next/link";
import { ArrowRight, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import type { TenantDb } from "@aah/db";

const DAY = 86_400_000;

/** The WhatsApp marketing band on the main dashboard: today's numbers, a 14-day trace and a way in. */
export async function WhatsAppHero({ db }: { db: TenantDb }) {
  const dayAgo = new Date(Date.now() - DAY);
  const weekAgo = new Date(Date.now() - 7 * DAY);
  const since14 = new Date(Date.now() - 14 * DAY);
  const [sentToday, readWeek, sentWeek, replies, signups, running, recent] = await Promise.all([
    db.marketingSend.count({ where: { sentAt: { gte: dayAgo } } }),
    db.marketingSend.count({ where: { sentAt: { gte: weekAgo }, readAt: { not: null } } }),
    db.marketingSend.count({ where: { sentAt: { gte: weekAgo } } }),
    db.whatsAppMessage.count({ where: { direction: "IN", handledAt: null, optOut: false } }),
    db.marketingLead.count({ where: { signedUpAt: { gte: weekAgo } } }),
    db.marketingCampaign.findFirst({ where: { status: "SENDING" }, select: { name: true } }),
    db.marketingSend.findMany({ where: { sentAt: { gte: since14 } }, select: { sentAt: true }, take: 20_000 }),
  ]);

  const perDay = Array.from({ length: 14 }, () => 0);
  for (const s of recent) {
    const i = Math.floor((s.sentAt!.getTime() - since14.getTime()) / DAY);
    if (i >= 0 && i < 14) perDay[i]!++;
  }
  const max = Math.max(1, ...perDay);
  const points = perDay.map((v, i) => `${(i / 13) * 160},${44 - (v / max) * 38}`).join(" ");

  const stat = (label: string, value: string | number, accent = false) => (
    <div className="wa-stat">
      <p className={`num text-[26px] font-medium leading-none ${accent ? "text-[#6ff0a4]" : "text-white"}`}>{value}</p>
      <p className="mt-1.5 text-xs text-white/55">{label}</p>
    </div>
  );

  return (
    <Link href="/marketing" data-reveal data-tour="wa-band" className="wa-band group p-5 sm:p-7">
      <div className="grid items-center gap-6 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-4">
          <span className="wa-icon"><WhatsappLogo size={26} weight="fill" aria-hidden /></span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6ff0a4]">
              {running ? <><span className="wa-live-dot" aria-hidden /> Live now</> : "Growth engine"}
            </p>
            <p className="editorial-heading mt-1 whitespace-nowrap text-[30px] leading-none text-white">WhatsApp marketing</p>
            <p className="mt-1.5 truncate text-sm text-white/60">{running ? running.name : "Mission control for every campaign"}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4">
          {stat("sent today", sentToday)}
          {stat("read this week", sentWeek ? `${Math.round((readWeek / sentWeek) * 100)}%` : "0%")}
          {stat("replies waiting", replies, replies > 0)}
          {stat("sign-ups this week", signups, signups > 0)}
        </div>

        <div className="flex items-center justify-between gap-5 xl:flex-col xl:items-end">
          <svg viewBox="0 0 160 48" className="h-12 w-40 overflow-visible" aria-hidden>
            <defs>
              <linearGradient id="wa-trace" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#3ee07f" stopOpacity="0.35" />
                <stop offset="1" stopColor="#3ee07f" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" x2="160" y1="44" y2="44" stroke="rgb(255 255 255 / 0.12)" />
            <polygon points={`0,44 ${points} 160,44`} fill="url(#wa-trace)" />
            <polyline points={points} fill="none" stroke="#3ee07f" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <span className="wa-open">Open mission control <ArrowRight size={15} weight="bold" aria-hidden /></span>
        </div>
      </div>
    </Link>
  );
}
