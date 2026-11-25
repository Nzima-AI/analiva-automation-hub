import Link from "next/link";
import { DAY_NAMES, randFromCents } from "@aah/core";
import { BarRows } from "@/components/marketing/funnel";
import { Heatmap } from "@/components/marketing/heatmap";
import { ButtonLink, Card, PageHeader, StatCard } from "@/components/ui";
import { analyticsData } from "@/lib/marketing/analytics";
import { requireStaff } from "@/lib/session";
import { MarketingTabs } from "../shared";

export const metadata = { title: "Marketing analytics" };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "-");
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
const RANGES = [30, 90, 180, 365] as const;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db } = await requireStaff();
  const params = await searchParams;
  const days = RANGES.find((r) => String(r) === params.days) ?? 90;
  const metric = params.metric === "read" ? "read" : "score";
  const a = await analyticsData(db, days);
  const t = a.totals;
  const best = a.best[0];
  const peakRead = a.readHours.indexOf(Math.max(...a.readHours));
  const half = a.timeToRead.find((b) => b.pct >= 50);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="What works, when, and for whom: so you can send the next campaign at the right moment."
        actions={<div className="flex flex-wrap gap-2"><ButtonLink href={`/marketing/report?days=${days}`} variant="secondary" size="sm">Printable report</ButtonLink></div>}
      />
      <MarketingTabs active="/marketing/analytics" />
      <nav aria-label="Period" className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r} href={`/marketing/analytics?days=${r}&metric=${metric}`} aria-current={r === days ? "page" : undefined} className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm ${r === days ? "border-brand bg-brand text-white" : "border-line hover:border-line-strong"}`}>Last {r} days</Link>
        ))}
      </nav>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Messages" value={t.sent} />
        <StatCard label="Read" value={pct(t.read, t.sent)} tone="brand" hint={`${t.read.toLocaleString("en-US")} people`} />
        <StatCard label="Clicked" value={pct(t.clicked, t.sent)} tone="brand" hint={`${t.clicked.toLocaleString("en-US")} clicks`} />
        <StatCard label="Signed up" value={t.signedUp} tone="positive" hint={pct(t.signedUp, t.sent)} />
        <StatCard label="Spent" value={randFromCents(t.cost)} />
        <StatCard label="Per sign-up" value={a.perSignup != null ? randFromCents(a.perSignup) : "-"} tone="positive" />
      </div>

      <div data-tour="heatmap">
        <Card
          title="Best days and times to send"
          description={best ? `Your strongest slot: ${DAY_NAMES[best.dow]} ${hour(best.hour)} (${pct(best.read, best.sent)} read, ${best.signedUp} sign-ups from ${best.sent} messages). Schedule campaigns then, or switch on "best time per person".` : "Send a few campaigns and this fills in."}
          actions={<div className="flex gap-1 text-sm">{(["score", "read"] as const).map((m) => <Link key={m} href={`/marketing/analytics?days=${days}&metric=${m}`} className={`rounded-lg px-2.5 py-1 ${m === metric ? "bg-brand text-white" : "hover:bg-subtle"}`}>{m === "score" ? "All results" : "Read rate"}</Link>)}</div>}
        >
          <Heatmap cells={a.cells} metric={metric} />
          {a.best.length > 1 ? (
            <p className="mt-3 text-sm text-ink-2">Top slots: {a.best.map((c) => `${DAY_NAMES[c.dow]} ${hour(c.hour)}`).join(" · ")}</p>
          ) : null}
        </Card>
      </div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
        <Card title="When people read" description={`Most reads happen around ${hour(peakRead)}.`}>
          <div className="flex h-36 items-end gap-1" aria-label="Reads by hour of day">
            {a.readHours.map((n, h) => (
              <div key={h} className="flex flex-1 flex-col items-center gap-1" title={`${hour(h)}: ${n} reads`}>
                <div className="w-full rounded-t bg-brand" style={{ height: `${(n / Math.max(1, ...a.readHours)) * 120}px`, opacity: h === peakRead ? 1 : 0.55 }} />
                {h % 3 === 0 ? <span className="text-[10px] text-faint">{String(h).padStart(2, "0")}</span> : <span className="text-[10px]">&nbsp;</span>}
              </div>
            ))}
          </div>
        </Card>
        <Card title="How quickly people read" description={half ? `Half of all readers read within ${half.minutes < 60 ? `${half.minutes} minutes` : `${half.minutes / 60} hours`}: judge a campaign, and send its follow-up, after that.` : "Fills in after your first campaign."}>
          <BarRows rows={a.timeToRead.map((b) => ({ label: b.minutes < 60 ? `Within ${b.minutes} min` : `Within ${b.minutes / 60} h`, value: b.pct }))} format={(n) => `${n}%`} />
        </Card>
      </div>

      <Card title="Campaigns compared" description="Best in each column is highlighted." >
        {a.byCampaign.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-2">Campaign</th><th className="text-right">Sent</th><th className="text-right">Read</th><th className="text-right">Clicked</th><th className="text-right">Signed up</th><th className="text-right">Spent</th><th className="text-right">Per sign-up</th></tr></thead>
              <tbody>
                {(() => {
                  const rate = (n: number, d: number) => (d ? n / d : 0);
                  const bestRead = Math.max(...a.byCampaign.map((c) => rate(c.read, c.sent)));
                  const bestClick = Math.max(...a.byCampaign.map((c) => rate(c.clicked, c.sent)));
                  const bestSign = Math.max(...a.byCampaign.map((c) => rate(c.signedUp, c.sent)));
                  const hi = (on: boolean) => (on ? "font-semibold text-positive" : "");
                  return a.byCampaign.map((c) => (
                    <tr key={c.id} className="border-b border-line/60">
                      <td className="py-2"><Link className="text-brand hover:underline" href={`/marketing/campaigns?campaign=${c.id}`}>{c.name}</Link><span className="block text-xs text-muted">{c.startedAt?.toISOString().slice(0, 10)}{c.template ? ` · ${c.template}` : ""}</span></td>
                      <td className="num text-right">{c.sent}</td>
                      <td className={`num text-right ${hi(rate(c.read, c.sent) === bestRead)}`}>{pct(c.read, c.sent)}</td>
                      <td className={`num text-right ${hi(rate(c.clicked, c.sent) === bestClick)}`}>{pct(c.clicked, c.sent)}</td>
                      <td className={`num text-right ${hi(rate(c.signedUp, c.sent) === bestSign)}`}>{c.signedUp} <span className="text-xs text-muted">{pct(c.signedUp, c.sent)}</span></td>
                      <td className="num text-right">{randFromCents(c.cost)}</td>
                      <td className="num text-right">{c.signedUp ? randFromCents(Math.round(c.cost / c.signedUp)) : "-"}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">No campaigns in this period.</p>}
      </Card>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-3">
        <Card title="Segments" description="Sign-up rate by segment.">
          <BarRows rows={a.bySegment.map((s) => ({ label: s.name, value: s.sent ? Math.round((s.signedUp / s.sent) * 100) : 0, note: `${s.signedUp} of ${s.sent}` }))} format={(n) => `${n}%`} />
        </Card>
        <Card title="Regions" description="Sign-up rate by region.">
          <BarRows rows={a.byRegion.map((s) => ({ label: s.name, value: s.sent ? Math.round((s.signedUp / s.sent) * 100) : 0, note: `${s.signedUp} of ${s.sent}` }))} format={(n) => `${n}%`} />
        </Card>
        <Card title="Engagement" description="Every contact, scored from their reads, clicks and replies.">
          <BarRows rows={(["Customer", "Hot", "Warm", "Cold", "Dormant", "New"] as const).map((b) => ({ label: b, value: a.bands[b] }))} />
          <Link href="/marketing" className="mt-2 inline-flex min-h-11 items-center text-sm text-brand hover:underline">See who to phone today</Link>
        </Card>
      </div>
    </>
  );
}
