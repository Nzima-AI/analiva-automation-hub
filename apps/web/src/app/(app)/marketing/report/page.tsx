import { DAY_NAMES, randFromCents } from "@aah/core";
import { BarRows } from "@/components/marketing/funnel";
import { Heatmap } from "@/components/marketing/heatmap";
import { PrintButton } from "@/components/print-button";
import { Card, PageHeader } from "@/components/ui";
import { analyticsData } from "@/lib/marketing/analytics";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Marketing report" };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "-");

/** A one-page summary to print or save as PDF for a board pack or client meeting. */
export default async function MarketingReport({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { db, practice } = await requireStaff();
  const asked = (await searchParams).days;
  const days = [7, 30, 90, 180, 365].find((d) => String(d) === asked) ?? 30;
  const a = await analyticsData(db, days);
  const t = a.totals;
  const best = a.best.slice(0, 3).map((c) => `${DAY_NAMES[c.dow]} ${String(c.hour).padStart(2, "0")}:00`).join(", ");
  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader eyebrow={practice.name} title={`Marketing report: last ${days} days`} subtitle={`Prepared ${new Date().toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "long" })}`} actions={<div className="no-print"><PrintButton /></div>} />
      <Card title="Summary">
        <p className="text-sm leading-7 text-ink-2">
          {t.sent.toLocaleString("en-US")} messages were sent. {pct(t.read, t.sent)} were read and {pct(t.clicked, t.sent)} clicked through;
          {" "}{t.signedUp} people signed up{a.perSignup != null ? `, at ${randFromCents(a.perSignup)} per sign-up` : ""}. WhatsApp spend was {randFromCents(t.cost)}.
          {best ? ` The best times to send were ${best}.` : ""}
        </p>
      </Card>
      <Card title="Best days and times"><Heatmap cells={a.cells} /></Card>
      <Card title="Campaigns">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-2">Campaign</th><th className="text-right">Sent</th><th className="text-right">Read</th><th className="text-right">Clicked</th><th className="text-right">Signed up</th><th className="text-right">Spent</th></tr></thead>
          <tbody>{a.byCampaign.map((c) => <tr key={c.id} className="border-b border-line/60"><td className="py-1.5">{c.name}</td><td className="num text-right">{c.sent}</td><td className="num text-right">{pct(c.read, c.sent)}</td><td className="num text-right">{pct(c.clicked, c.sent)}</td><td className="num text-right">{c.signedUp}</td><td className="num text-right">{randFromCents(c.cost)}</td></tr>)}</tbody>
        </table>
      </Card>
      <div className="grid gap-5 sm:grid-cols-2">
        <Card title="Segments (sign-up rate)"><BarRows rows={a.bySegment.map((s) => ({ label: s.name, value: s.sent ? Math.round((s.signedUp / s.sent) * 100) : 0 }))} format={(n) => `${n}%`} /></Card>
        <Card title="Engagement"><BarRows rows={(["Customer", "Hot", "Warm", "Cold", "Dormant"] as const).map((b) => ({ label: b, value: a.bands[b] }))} /></Card>
      </div>
    </div>
  );
}
