import Link from "next/link";
import { WhatsappLogo, X } from "@phosphor-icons/react/dist/ssr";
import { randFromCents } from "@aah/core";
import { Funnel } from "@/components/marketing/funnel";
import { LiveRefresh } from "@/components/marketing/live-refresh";
import { liveCampaign, overviewData } from "@/lib/marketing/analytics";
import { requireStaff } from "@/lib/session";
import { formatPhone } from "../shared";

export const metadata = { title: "Live wall" };

/** Full-screen view for the office screen during a launch: big numbers, the funnel, replies as they land. */
export default async function LiveWall({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const { db } = await requireStaff();
  const { campaign } = await searchParams;
  const o = await overviewData(db);
  const live = campaign ? await liveCampaign(db, campaign) : o.live;
  const big = (label: string, value: string | number, accent?: boolean) => (
    <div className="rounded-3xl bg-white/5 p-6">
      <p className="text-lg text-white/60">{label}</p>
      <p className={`num mt-2 text-6xl font-semibold tracking-tight ${accent ? "text-[#25d366]" : "text-white"}`}>{value}</p>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[150] overflow-y-auto bg-[#0b141a] p-8 text-white">
      <LiveRefresh seconds={5} />
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-8 flex items-center justify-between gap-4">
          <h1 className="flex items-center gap-3 text-3xl font-semibold"><WhatsappLogo size={36} weight="fill" className="text-[#25d366]" />{live?.campaign.name ?? "WhatsApp marketing"}</h1>
          <span className="flex items-center gap-3 text-white/60"><span className="h-3 w-3 animate-pulse rounded-full bg-[#25d366]" /> Live<Link href="/marketing" className="ml-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Close live wall"><X size={20} /></Link></span>
        </header>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {big("Sent", (live?.stats.sent ?? o.sentToday).toLocaleString("en-US"))}
          {big("Read", (live?.stats.read ?? 0).toLocaleString("en-US"))}
          {big("Clicked", (live?.stats.clicked ?? 0).toLocaleString("en-US"))}
          {big("Signed up", (live?.stats.signedUp ?? o.signupsWeek).toLocaleString("en-US"), true)}
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="rounded-3xl bg-white/5 p-6 [&_.bg-subtle]:bg-white/10 [&_.text-muted]:text-white/60 [&_.text-ink-2]:text-white">
            {live ? <Funnel stats={live.stats} big /> : <p className="text-white/60">Start a campaign to see it here.</p>}
            {live ? <p className="mt-6 text-xl text-white/70">Spent {randFromCents(live.costCents)}{live.perSignup != null ? ` · ${randFromCents(live.perSignup)} per sign-up` : ""}{live.forecast ? ` · heading for about ${live.forecast.signedUp} sign-ups` : ""}</p> : null}
          </div>
          <div className="rounded-3xl bg-white/5 p-6">
            <p className="mb-4 text-lg text-white/60">Latest replies</p>
            <ul className="space-y-3">
              {(live?.replies ?? []).map((r) => (
                <li key={r.id} className="max-w-[90%] rounded-2xl rounded-tl-none bg-white px-4 py-3 text-lg text-[#111b21]">
                  <b className="block text-sm text-[#027eb5]">{r.fromName ?? formatPhone(r.fromPhone)}</b>{r.body}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
