import Link from "next/link";
import { ArrowRight, CalendarDots, ListChecks, Pulse, Receipt, Sparkle, Tray } from "@phosphor-icons/react/dist/ssr";
import { formatCents } from "@aah/core";
import { BarList } from "@/components/bar-list";
import { BarTrend, MiniBars } from "@/components/charts";
import { compactRand } from "@/lib/compact-rand";
import { ButtonLink, Card, Empty, Figure, InkPanel } from "@/components/ui";
import { WhatsAppHero } from "@/components/marketing/whatsapp-hero";
import { clientDeadlines } from "@/lib/compliance";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Dashboard" };

const DAY = 86_400_000;
const WAITING = ["NEEDS_CLIENT", "SUGGESTED", "NEEDS_REVIEW", "FAILED"] as const;

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-ZA", { hour: "numeric", hour12: false, timeZone: "Africa/Johannesburg" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const { db, user } = await requireStaff();
  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const since30 = new Date(today.getTime() - 29 * DAY);

  const [waiting, unmatchedBank, emails7, captures30, invoicesMonth, invoicesLastMonth, recentCaptures, topSuppliers, activity, clientsCount, deadlines] = await Promise.all([
    db.capture.groupBy({ by: ["status"], where: { status: { in: [...WAITING] } }, _count: { _all: true } }),
    db.bankTransaction.count({ where: { status: "UNMATCHED" } }),
    db.emailMessage.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    db.capture.findMany({ where: { createdAt: { gte: since30 } }, select: { status: true, decidedByUserId: true, createdAt: true } }),
    db.invoice.aggregate({ where: { deletedAt: null, capturedAt: { gte: monthStart } }, _count: { _all: true }, _sum: { totalCents: true, vatCents: true } }),
    db.invoice.aggregate({ where: { deletedAt: null, capturedAt: { gte: lastMonthStart, lt: monthStart } }, _count: { _all: true } }),
    db.capture.findMany({
      where: { status: { in: [...WAITING] } },
      orderBy: { createdAt: "asc" },
      take: 5,
      include: { email: { select: { fromName: true, fromAddress: true, subject: true } }, client: { select: { name: true } } },
    }),
    db.invoice.groupBy({
      by: ["supplierId"],
      where: { deletedAt: null, direction: "PAYABLE", issueDate: { gte: new Date(today.getTime() - 90 * DAY) }, supplierId: { not: null } },
      _sum: { totalCents: true },
      orderBy: { _sum: { totalCents: "desc" } },
      take: 6,
    }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.client.count({ where: { deletedAt: null, status: { not: "ARCHIVED" } } }),
    clientDeadlines(db, { from: new Date(today.getTime() - 60 * DAY), to: new Date(today.getTime() + 45 * DAY) }),
  ]);

  const waitingTotal = waiting.reduce((n, w) => n + w._count._all, 0);
  const decided = captures30.filter((c) => c.status === "FILED");
  const autoFiled = decided.filter((c) => !c.decidedByUserId).length;
  const autoRate = decided.length ? Math.round((autoFiled / decided.length) * 100) : null;
  const supplierNames = await db.supplier.findMany({ where: { id: { in: topSuppliers.map((s) => s.supplierId!) } }, select: { id: true, name: true } });
  const openDeadlines = deadlines.filter((d) => !d.done && (d.overdue || d.dueDate.getTime() <= today.getTime() + 30 * DAY));
  const overdue = openDeadlines.filter((d) => d.overdue).length;

  // Captures per day, last 30 days: auto-filed vs filed by staff vs still waiting.
  const days = Array.from({ length: 30 }, (_, i) => new Date(since30.getTime() + i * DAY));
  const chart = days.map((d) => {
    const key = d.toISOString().slice(0, 10);
    const same = captures30.filter((c) => c.createdAt.toISOString().slice(0, 10) === key);
    return {
      day: new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" }).format(d),
      auto: same.filter((c) => c.status === "FILED" && !c.decidedByUserId).length,
      staff: same.filter((c) => c.status === "FILED" && c.decidedByUserId).length,
      waiting: same.filter((c) => (WAITING as readonly string[]).includes(c.status)).length,
    };
  });

  const monthCount = invoicesMonth._count._all;
  const lastCount = invoicesLastMonth._count._all;
  const trend = lastCount > 0 ? Math.round(((monthCount - lastCount) / lastCount) * 100) : null;

  const monthTotal = formatCents(invoicesMonth._sum.totalCents ?? 0n);
  const dateLine = new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Johannesburg" }).format(now);

  return (
    <div className="space-y-6">
      <InkPanel tour="dash-hero" className="px-6 pb-6 pt-7 sm:px-9 sm:pb-8 sm:pt-9">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5fd3ff]"><span className="h-px w-6 bg-[#5fd3ff]/60" aria-hidden />{dateLine}</p>
            <h1 className="mt-3 editorial-heading text-[clamp(2.9rem,5.4vw,4.9rem)] font-normal leading-[1.02] text-white">
              {greeting()}, {user.name.split(" ")[0]}
            </h1>
            <p className="mt-2 max-w-[52ch] text-sm text-white/65">
              {waitingTotal || overdue
                ? `${waitingTotal} item${waitingTotal === 1 ? "" : "s"} waiting for review${overdue ? ` and ${overdue} overdue deadline${overdue === 1 ? "" : "s"}` : ""}.`
                : "Everything is up to date. New mail is checked every five minutes."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/invoices/new" variant="ghost" className="border border-white/15 text-white/85 hover:bg-white/10 hover:text-white">
              <Receipt className="h-4 w-4" /> Capture invoice
            </ButtonLink>
            <ButtonLink href="/review" className="!from-white !to-white !text-[#04111b] hover:!from-[#e6f7ff] hover:!to-[#e6f7ff]">
              <ListChecks className="h-4 w-4" /> Open review queue
            </ButtonLink>
          </div>
        </div>

        <div className="figure-rule mt-10 grid gap-8 sm:grid-cols-3">
          <Figure label="Waiting for review" value={String(waitingTotal)} hint={waitingTotal ? "Oldest first in the queue" : "Queue is clear"} />
          <Figure label="Captured this month" value={monthTotal} hint={`${monthCount} invoice${monthCount === 1 ? "" : "s"} · VAT ${formatCents(invoicesMonth._sum.vatCents ?? 0n)}${trend === null ? "" : ` · ${trend >= 0 ? "up" : "down"} ${Math.abs(trend)}% on last month`}`} />
          <Figure label="Filed without a person" value={autoRate === null ? "-" : `${autoRate}%`} tone={autoRate !== null && autoRate >= 50 ? "up" : "default"} hint={`${autoFiled} of ${decided.length} invoices in 30 days`} />
        </div>

        <div className="mt-8 border-t border-white/10 pt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-white/50">
            <span>Invoices captured per day, last 30 days</span>
            <span className="num">{captures30.length}</span>
          </div>
          <MiniBars data={chart.map((c) => c.auto + c.staff + c.waiting)} height={44} />
        </div>
      </InkPanel>
      <WhatsAppHero db={db} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card title="Capture activity" description="Last 30 days, by outcome" icon={Sparkle} className="lg:col-span-8">
          {captures30.length === 0 ? (
            <Empty icon={Tray}>Nothing captured in the last 30 days. Connect an inbox under Settings, Email accounts.</Empty>
          ) : (
            <BarTrend
              data={chart}
              xKey="day"
              stacked
              money={false}
              series={[
                { key: "auto", label: "Filed automatically" },
                { key: "staff", label: "Filed by staff" },
                { key: "waiting", label: "Waiting" },
              ]}
            />
          )}
        </Card>

        <section data-reveal data-spotlight className="edge-light paper relative overflow-hidden rounded-2xl border border-line shadow-xs lg:col-span-4 lg:row-span-2">
          <span className="edge" aria-hidden />
          <div className="flex items-center justify-between px-5 pb-2 pl-14 pt-4">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight">
              <CalendarDots className="h-4 w-4 text-brand-text" weight="duotone" /> Deadlines
            </h2>
            <Link href="/compliance" className="arrow-link inline-flex items-center gap-1 text-xs font-medium text-brand-text">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {openDeadlines.length === 0 ? (
            <p className="px-5 pb-6 pl-14 text-sm text-muted">Nothing due. Set each client&apos;s tax profile to fill the calendar.</p>
          ) : (
            <ul className="pb-3">
              {openDeadlines.slice(0, 9).map((d) => (
                <li key={`${d.clientId}-${d.periodKey}`} className="flex min-h-16 items-center gap-3 py-2 pl-14 pr-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{d.label}</p>
                    <p className="truncate text-xs text-muted">{d.clientName}</p>
                  </div>
                  <span className={`num shrink-0 text-xs ${d.overdue ? "font-semibold text-danger" : d.dueDate.getTime() - today.getTime() <= 7 * DAY ? "text-warn" : "text-muted"}`}>
                    {d.overdue ? "Overdue" : formatCalendarDate(d.dueDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Card title="Next in the queue" icon={ListChecks} className="lg:col-span-5" padded={false} actions={<Link href="/review" className="arrow-link inline-flex items-center gap-1 text-xs font-medium text-brand-text">Open queue <ArrowRight className="h-3 w-3" /></Link>}>
          {recentCaptures.length === 0 ? (
            <Empty icon={ListChecks}>Nothing waiting.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {recentCaptures.map((c) => (
                <li key={c.id}>
                  <Link href={`/review/${c.id}`} className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-subtle/70">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink group-hover:text-brand-text">{c.email?.subject ?? "Uploaded document"}</p>
                      <p className="truncate text-xs text-muted">
                        {c.email?.fromName ?? c.email?.fromAddress} · {c.client?.name ?? "client not identified"}
                      </p>
                    </div>
                    <span className="num text-xs text-muted">{Math.round(c.confidence * 100)}%</span>
                    <ArrowRight className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand-text" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Top suppliers" description="Last 90 days, all clients" icon={Receipt} className="lg:col-span-3">
          {topSuppliers.length === 0 ? (
            <p className="text-sm text-muted">No supplier bills yet.</p>
          ) : (
            <BarList items={topSuppliers.map((s) => ({ label: supplierNames.find((n) => n.id === s.supplierId)?.name ?? "Supplier", value: Number(s._sum.totalCents ?? 0n) / 100 }))} format={compactRand} />
          )}
        </Card>

        <Card title="Recent activity" icon={Pulse} className="lg:col-span-8" actions={<Link href="/audit" className="arrow-link inline-flex items-center gap-1 text-xs font-medium text-brand-text">Activity log <ArrowRight className="h-3 w-3" /></Link>}>
          <ol className="relative space-y-3 border-l border-line pl-5">
            {activity.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full border-2 border-panel bg-brand" aria-hidden />
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-ink">{a.actorLabel ?? a.actorType}</span> <span className="text-muted">{a.action.replace(/[._]/g, " ")}</span>
                    {a.reason ? <span className="text-faint"> · {a.reason}</span> : null}
                  </span>
                  <span className="num shrink-0 text-[11px] text-faint">{formatDateTime(a.createdAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <section data-reveal className="ink rounded-2xl border border-white/10 p-5 lg:col-span-4">
          <h2 className="text-[14px] font-semibold text-white">Practice at a glance</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
            {(
              [
                ["Active clients", clientsCount, "/lookup"],
                ["Emails, 7 days", emails7, "/inbox"],
                ["Overdue deadlines", overdue, "/compliance"],
                ["Bank lines to code", unmatchedBank, "/books"],
              ] as Array<[string, number, string]>
            ).map(([label, v, href]) => (
              <Link key={label} href={href} className="group">
                <dt className="text-xs text-white/55 transition-colors group-hover:text-white/80">{label}</dt>
                <dd className={`num mt-1 text-2xl ${label === "Overdue deadlines" && v ? "text-[#fda4af]" : "text-white"}`}>{v}</dd>
              </Link>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
