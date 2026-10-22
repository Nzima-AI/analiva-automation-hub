import Link from "next/link";
import { AlertTriangle, ArrowRight, Bot, CalendarClock, Inbox, Landmark, ListChecks, Receipt, Sparkles } from "lucide-react";
import { formatCents } from "@aah/core";
import { BarList } from "@/components/bar-list";
import { BarTrend, compactRand } from "@/components/charts";
import { Badge, ButtonLink, Card, Empty, PageHeader, Progress, StatCard } from "@/components/ui";
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

  return (
    <div>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Johannesburg" }).format(now)}
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        subtitle={
          waitingTotal || overdue
            ? `${waitingTotal} item${waitingTotal === 1 ? "" : "s"} to review${overdue ? ` · ${overdue} overdue deadline${overdue === 1 ? "" : "s"}` : ""}.`
            : "Everything is up to date."
        }
        actions={
          <>
            <ButtonLink href="/invoices/new" variant="secondary">
              <Receipt className="h-4 w-4" /> Capture invoice
            </ButtonLink>
            <ButtonLink href="/review">
              <ListChecks className="h-4 w-4" /> Review queue
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Waiting for review" value={waitingTotal} icon={ListChecks} tone={waitingTotal ? "warn" : "positive"} href="/review" hint={waitingTotal ? "Oldest first" : "Queue is clear"} />
        <StatCard
          label="Filed automatically (30 days)"
          value={autoRate === null ? "—" : `${autoRate}%`}
          icon={Bot}
          tone="brand"
          hint={`${autoFiled} of ${decided.length} filed invoices`}
        />
        <StatCard
          label="Invoices captured this month"
          value={monthCount}
          icon={Receipt}
          href="/invoices"
          trend={trend === null ? null : { value: `${Math.abs(trend)}%`, up: trend >= 0, good: trend >= 0 }}
          hint={`${formatCents(invoicesMonth._sum.totalCents ?? 0n)} · VAT ${formatCents(invoicesMonth._sum.vatCents ?? 0n)}`}
        />
        <StatCard label="Bank lines to code" value={unmatchedBank} icon={Landmark} tone={unmatchedBank ? "warn" : "neutral"} href="/books" hint={`${emails7} emails fetched in 7 days`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Capture activity" description="Last 30 days, by outcome" icon={Sparkles} className="xl:col-span-2">
          {captures30.length === 0 ? (
            <Empty icon={Inbox}>Nothing captured in the last 30 days. Connect an inbox under Settings → Email accounts.</Empty>
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

        <Card title="Deadlines" description="Next 30 days and overdue" icon={CalendarClock} actions={<Link href="/compliance" className="text-xs font-medium text-brand-text hover:underline">All deadlines</Link>}>
          {openDeadlines.length === 0 ? (
            <Empty icon={CalendarClock}>
              No deadlines due. Set each client&apos;s tax profile (VAT, PAYE, year-end) to fill the calendar.
            </Empty>
          ) : (
            <ul className="space-y-3">
              {openDeadlines.slice(0, 7).map((d) => (
                <li key={`${d.clientId}-${d.periodKey}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{d.label}</p>
                    <p className="truncate text-xs text-muted">
                      {d.clientName} · {d.periodLabel}
                    </p>
                  </div>
                  <Badge tone={d.overdue ? "danger" : d.dueDate.getTime() - today.getTime() <= 7 * DAY ? "warn" : "neutral"}>
                    {d.overdue ? "Overdue" : formatCalendarDate(d.dueDate)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Next up in the queue" icon={ListChecks} className="xl:col-span-2" actions={<Link href="/review" className="text-xs font-medium text-brand-text hover:underline">Open queue</Link>} padded={false}>
          {recentCaptures.length === 0 ? (
            <Empty icon={ListChecks}>Nothing waiting.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {recentCaptures.map((c) => (
                <li key={c.id}>
                  <Link href={`/review/${c.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-subtle">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{c.email?.subject ?? "Uploaded document"}</p>
                      <p className="truncate text-xs text-muted">
                        {c.email?.fromName ?? c.email?.fromAddress} · {c.client?.name ?? "client not identified"}
                      </p>
                    </div>
                    <div className="hidden w-24 sm:block">
                      <Progress value={c.confidence * 100} tone={c.confidence >= 0.9 ? "positive" : c.confidence >= 0.6 ? "brand" : "warn"} />
                      <p className="mt-1 text-right text-[11px] text-faint tabular">{Math.round(c.confidence * 100)}% read</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Top suppliers" description="Spend across clients, last 90 days" icon={Receipt}>
          {topSuppliers.length === 0 ? (
            <Empty>No supplier bills yet.</Empty>
          ) : (
            <BarList
              items={topSuppliers.map((s) => ({ label: supplierNames.find((n) => n.id === s.supplierId)?.name ?? "Supplier", value: Number(s._sum.totalCents ?? 0n) / 100 }))}
              format={compactRand}
            />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Recent activity" icon={AlertTriangle} className="xl:col-span-2" actions={<Link href="/audit" className="text-xs font-medium text-brand-text hover:underline">Activity log</Link>}>
          <ol className="space-y-2.5">
            {activity.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-ink">{a.actorLabel ?? a.actorType}</span>{" "}
                  <span className="text-muted">{a.action.replace(/[._]/g, " ")}</span>
                  {a.reason ? <span className="text-faint"> · {a.reason}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-faint tabular">{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Practice" icon={Landmark}>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted">Active clients</dt>
              <dd className="font-display text-xl font-semibold tabular">{clientsCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Emails (7 days)</dt>
              <dd className="font-display text-xl font-semibold tabular">{emails7}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Overdue deadlines</dt>
              <dd className={`font-display text-xl font-semibold tabular ${overdue ? "text-danger" : ""}`}>{overdue}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Bank lines to code</dt>
              <dd className="font-display text-xl font-semibold tabular">{unmatchedBank}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/clients/new" size="sm" variant="secondary">
              New client
            </ButtonLink>
            <ButtonLink href="/books" size="sm" variant="secondary">
              Books & reports
            </ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
}
