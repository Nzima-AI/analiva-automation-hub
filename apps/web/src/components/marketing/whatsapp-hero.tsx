import Link from "next/link";
import { ArrowRight, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import type { TenantDb } from "@aah/db";

/** The WhatsApp marketing strip on the main dashboard: today's numbers and a way in. */
export async function WhatsAppHero({ db }: { db: TenantDb }) {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [sentToday, readWeek, sentWeek, replies, signups, running] = await Promise.all([
    db.marketingSend.count({ where: { sentAt: { gte: dayAgo } } }),
    db.marketingSend.count({ where: { sentAt: { gte: weekAgo }, readAt: { not: null } } }),
    db.marketingSend.count({ where: { sentAt: { gte: weekAgo } } }),
    db.whatsAppMessage.count({ where: { direction: "IN", handledAt: null, optOut: false } }),
    db.marketingLead.count({ where: { signedUpAt: { gte: weekAgo } } }),
    db.marketingCampaign.findFirst({ where: { status: "SENDING" }, select: { name: true } }),
  ]);
  const stat = (label: string, value: string | number) => (
    <div><p className="num text-2xl font-semibold text-white">{value}</p><p className="text-xs text-white/65">{label}</p></div>
  );
  return (
    <Link href="/marketing" className="group block overflow-hidden rounded-2xl bg-[#075e54] p-5 text-white shadow-[0_18px_40px_-24px_rgb(7_94_84/0.9)] transition-transform hover:-translate-y-0.5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#25d366]"><WhatsappLogo size={28} weight="fill" /></span>
          <div>
            <p className="text-lg font-semibold">WhatsApp marketing</p>
            <p className="text-sm text-white/70">{running ? `Live now: ${running.name}` : "Mission control for your campaigns"}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {stat("sent today", sentToday)}
          {stat("read this week", sentWeek ? `${Math.round((readWeek / sentWeek) * 100)}%` : "-")}
          {stat("replies waiting", replies)}
          {stat("sign-ups this week", signups)}
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">Open <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" /></span>
      </div>
    </Link>
  );
}
