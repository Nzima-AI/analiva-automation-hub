import Link from "next/link";
import { ArrowRight, Bank, CalendarDots, ChatsCircle, FileArrowUp, Receipt, TrendDown, TrendUp, Wallet } from "@phosphor-icons/react/dist/ssr";
import { formatCents, type Ratio } from "@aah/core";
import { BarTrend } from "@/components/charts";
import { EnquiryStatusBadge } from "@/components/enquiry-thread";
import { Badge, ButtonLink, Card, Empty, PageHeader, StatCard } from "@/components/ui";
import { monthlySeries, statementsFor } from "@/lib/books/analytics";
import { financialYearStart } from "@/lib/books/ledger";
import { clientDeadlines } from "@/lib/compliance";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { requireClient } from "@/lib/session";

export const metadata = { title: "My business" };

const toneBadge = { good: "positive", watch: "warn", risk: "danger", neutral: "neutral" } as const;
const fmtRatio = (r: Ratio) =>
  r.value === null ? "-" : r.format === "pct" ? `${r.value}%` : r.format === "times" ? `${r.value.toFixed(2)}x` : r.format === "months" ? `${r.value} months` : r.format === "days" ? `${r.value} days` : formatCents(BigInt(Math.round(r.value * 100)));

export default async function PortalHome() {
  const { db, clientId, user, practice } = await requireClient();
  const client = await db.client.findFirstOrThrow({ where: { id: clientId }, select: { name: true, tradingName: true, financialYearEndMonth: true, portalShowsBooks: true } });
  const today = new Date(new Date().toISOString().slice(0, 10));
  const fyStart = financialYearStart(today, client.financialYearEndMonth);
  const to = new Date(today.getTime() + 86_400_000);

  const [s, series, enquiries, deadlines, unpaid] = await Promise.all([
    client.portalShowsBooks ? statementsFor(db, clientId, { from: fyStart, to, yearEndMonth: client.financialYearEndMonth }) : Promise.resolve(null),
    client.portalShowsBooks ? monthlySeries(db, clientId, 12) : Promise.resolve([]),
    db.enquiry.findMany({ where: { clientId }, orderBy: { lastMessageAt: "desc" }, take: 4 }),
    clientDeadlines(db, { from: new Date(today.getTime() - 30 * 86_400_000), to: new Date(today.getTime() + 90 * 86_400_000), clientId }),
    db.invoice.findMany({ where: { clientId, deletedAt: null, status: { not: "REJECTED" } }, select: { direction: true, totalCents: true, amountPaidCents: true } }),
  ]);
  const owedToYou = unpaid.filter((i) => i.direction === "RECEIVABLE").reduce((n, i) => n + (i.totalCents - i.amountPaidCents), 0n);
  const youOwe = unpaid.filter((i) => i.direction === "PAYABLE").reduce((n, i) => n + (i.totalCents - i.amountPaidCents), 0n);
  const open = deadlines.filter((d) => !d.done).slice(0, 4);
  const replyNeeded = enquiries.filter((e) => e.status === "AWAITING_CLIENT").length;

  return (
    <div>
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        subtitle={`${client.tradingName || client.name}. Your books are kept by ${practice.name}.${replyNeeded ? ` Your accountant is waiting on ${replyNeeded} repl${replyNeeded === 1 ? "y" : "ies"}.` : ""}`}
        actions={
          <>
            <ButtonLink href="/portal/documents" variant="secondary">
              <FileArrowUp className="h-4 w-4" /> Upload documents
            </ButtonLink>
            <ButtonLink href="/portal/enquiries/new">
              <ChatsCircle className="h-4 w-4" /> Ask your accountant
            </ButtonLink>
          </>
        }
      />

      {s ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-reveal-group>
            <StatCard label="Income this year" value={formatCents(s.is.totals.salesCents + s.is.totals.otherIncomeCents)} icon={TrendUp} hint={`Since ${formatCalendarDate(fyStart)}`} href="/portal/reports" />
            <StatCard label="Expenses this year" value={formatCents(s.is.totals.costOfSalesCents + s.is.totals.expensesCents)} icon={TrendDown} href="/portal/reports" />
            <StatCard
              label="Net profit"
              value={formatCents(s.is.totals.netProfitCents)}
              icon={Wallet}
              tone={s.is.totals.netProfitCents < 0n ? "negative" : "positive"}
              hint={s.is.netMarginPct === null ? "No sales yet" : `${s.is.netMarginPct}% of sales`}
              href="/portal/reports"
            />
            <StatCard label="Bank balance" value={formatCents(s.bs.totals.bankCents)} icon={Bank} hint="Per your books" />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card title="Income, expenses and profit" description="Last 12 months" icon={TrendUp} className="xl:col-span-2">
              <BarTrend
                data={series.map((p) => ({ label: p.label, income: Number(p.incomeCents) / 100, expenses: Number(p.expensesCents) / 100, profit: Number(p.profitCents) / 100 }))}
                xKey="label"
                series={[
                  { key: "income", label: "Income" },
                  { key: "expenses", label: "Expenses" },
                  { key: "profit", label: "Profit", kind: "line" },
                ]}
              />
            </Card>
            <Card title="Business health" icon={Wallet}>
              <ul className="space-y-3">
                {s.ratios
                  .filter((r) => ["current", "nm", "runway", "debtorDays"].includes(r.key))
                  .map((r) => (
                    <li key={r.key} className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block text-sm font-medium text-ink">{r.label}</span>
                        <span className="block text-xs text-muted">{r.hint}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-display font-semibold tabular">{fmtRatio(r)}</span>
                        <Badge tone={toneBadge[r.tone]}>{r.tone === "good" ? "Good" : r.tone === "watch" ? "Watch" : r.tone === "risk" ? "Risk" : "-"}</Badge>
                      </span>
                    </li>
                  ))}
              </ul>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <Empty icon={Wallet}>Your accountant hasn&apos;t shared your reports in the portal yet. Ask them if you&apos;d like to see your figures here.</Empty>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Money" icon={Receipt} actions={<Link href="/portal/invoices" className="text-xs font-medium text-brand-text hover:underline">Invoices</Link>}>
          <dl className="space-y-3">
            <div className="flex items-baseline justify-between">
              <dt className="text-sm text-muted">Customers owe you</dt>
              <dd className="font-display text-lg font-semibold tabular">{formatCents(owedToYou)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-sm text-muted">You owe suppliers</dt>
              <dd className="font-display text-lg font-semibold tabular">{formatCents(youOwe)}</dd>
            </div>
          </dl>
        </Card>
        <Card title="Coming up" icon={CalendarDots} actions={<Link href="/portal/deadlines" className="text-xs font-medium text-brand-text hover:underline">All dates</Link>}>
          {open.length === 0 ? (
            <p className="text-sm text-muted">No tax or CIPC deadlines in the next three months.</p>
          ) : (
            <ul className="space-y-2.5">
              {open.map((d) => (
                <li key={d.periodKey} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{d.label}</span>
                    <span className="block text-xs text-muted">{d.periodLabel}</span>
                  </span>
                  <Badge tone={d.overdue ? "danger" : "neutral"}>{d.overdue ? "Overdue" : formatCalendarDate(d.dueDate)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Your enquiries" icon={ChatsCircle} actions={<Link href="/portal/enquiries" className="text-xs font-medium text-brand-text hover:underline">All</Link>} padded={false}>
          {enquiries.length === 0 ? (
            <Empty icon={ChatsCircle} action={<ButtonLink href="/portal/enquiries/new" size="sm">Ask a question</ButtonLink>}>
              Questions about your books, tax or CIPC? Ask here and your accountant replies in the portal.
            </Empty>
          ) : (
            <ul className="divide-y divide-line">
              {enquiries.map((e) => (
                <li key={e.id}>
                  <Link href={`/portal/enquiries/${e.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-subtle/70">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.subject}</span>
                      <span className="block text-xs text-faint tabular">{formatDateTime(e.lastMessageAt)}</span>
                    </span>
                    <EnquiryStatusBadge status={e.status} viewer="CLIENT" />
                    <ArrowRight className="h-4 w-4 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
