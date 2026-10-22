import Link from "next/link";
import { notFound } from "next/navigation";
import { Bank, ChartPieSlice, Gauge, Pulse, Receipt, Scales, TrendUp, Wallet } from "@phosphor-icons/react/dist/ssr";
import { formatCents, natural, type Ratio } from "@aah/core";
import { BarTrend, Donut } from "@/components/charts";
import { Badge, Button, ButtonLink, Card, Empty, Notice, StatCard } from "@/components/ui";
import { postMissingInvoices } from "../actions";
import { monthlySeries, statementsFor } from "@/lib/books/analytics";
import { financialYearStart } from "@/lib/books/ledger";
import { formatCalendarDate } from "@/lib/format";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Books overview" };

const toneBadge = { good: "positive", watch: "warn", risk: "danger", neutral: "neutral" } as const;

function formatRatio(r: Ratio): string {
  if (r.value === null) return "-";
  switch (r.format) {
    case "pct":
      return `${r.value}%`;
    case "times":
      return `${r.value.toFixed(2)}×`;
    case "money":
      return formatCents(BigInt(Math.round(r.value * 100)));
    case "months":
      return `${r.value} mo`;
    case "days":
      return `${r.value} days`;
  }
}

export default async function BooksOverviewPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ backfilled?: string }> }) {
  const { db } = await requireStaff();
  const { clientId } = await params;
  const { backfilled } = await searchParams;
  const client = await db.client.findFirst({ where: { id: clientId }, select: { financialYearEndMonth: true, vatRegistered: true } });
  if (!client) notFound();

  const today = new Date(new Date().toISOString().slice(0, 10));
  const to = new Date(today.getTime() + 86_400_000);
  const from = financialYearStart(today, client.financialYearEndMonth);
  const [s, series, lineCount, unposted] = await Promise.all([
    statementsFor(db, clientId, { from, to, yearEndMonth: client.financialYearEndMonth }),
    monthlySeries(db, clientId, 12),
    db.journalLine.count({ where: { clientId } }),
    db.invoice.count({ where: { clientId, deletedAt: null, journalEntryId: null, status: { not: "REJECTED" } } }),
  ]);
  const backfill = unposted ? (
    <Notice tone="warn">
      <span className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {unposted} filed invoice{unposted === 1 ? " isn't" : "s aren't"} in the books yet (captured before the ledger existed).
        </span>
        <form action={postMissingInvoices.bind(null, clientId)}>
          <Button size="sm">Post {unposted === 1 ? "it" : "them"} now</Button>
        </form>
      </span>
    </Notice>
  ) : backfilled ? (
    <Notice tone="positive">Posted {backfilled} invoice{backfilled === "1" ? "" : "s"} to the books.</Notice>
  ) : null;

  if (lineCount === 0) {
    return (
      <>
      {backfill}
      <Card>
        <Empty
          icon={Bank}
          action={
            <div className="flex gap-2">
              <ButtonLink href={`/books/${clientId}/bank`}>Import a bank statement</ButtonLink>
              <ButtonLink href={`/invoices/new?client=${clientId}`} variant="secondary">
                Capture an invoice
              </ButtonLink>
            </div>
          }
        >
          <span className="block font-medium text-ink">These books are empty</span>
          Filed invoices post here automatically. Import a bank statement to bring in payments, bank charges and income.
        </Empty>
      </Card>
      </>
    );
  }

  const t = s.is.totals;
  const expenseSlices = [...s.is.expenses, ...s.is.costOfSales]
    .sort((a, b) => Number(b.amountCents - a.amountCents))
    .slice(0, 6)
    .map((l) => ({ name: l.name, value: Number(l.amountCents) / 100 }));

  return (
    <div className="space-y-6">
      {backfill}
      <p className="text-sm text-muted">
        Financial year to date: {formatCalendarDate(from)} to {formatCalendarDate(today)}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales" value={formatCents(t.salesCents)} icon={TrendUp} hint={t.otherIncomeCents ? `+ ${formatCents(t.otherIncomeCents)} other income` : "Year to date"} href={`/books/${clientId}/reports?r=is`} />
        <StatCard label="Gross profit" value={formatCents(t.grossProfitCents)} icon={Pulse} hint={s.is.grossMarginPct === null ? "-" : `${s.is.grossMarginPct}% gross margin`} />
        <StatCard
          label="Net profit"
          value={formatCents(t.netProfitCents)}
          icon={Wallet}
          tone={t.netProfitCents < 0n ? "negative" : "positive"}
          hint={s.is.netMarginPct === null ? "-" : `${s.is.netMarginPct}% net margin`}
          href={`/books/${clientId}/reports?r=is`}
        />
        <StatCard label="Bank" value={formatCents(s.bs.totals.bankCents)} icon={Bank} hint={`Moved ${formatCents(s.cf.bankMovementCents)} this year`} href={`/books/${clientId}/bank`} />
        <StatCard label="Owed by customers" value={formatCents(s.debtors)} icon={Receipt} href={`/books/${clientId}/reports?r=aged`} />
        <StatCard label="Owed to suppliers" value={formatCents(s.creditors)} icon={Receipt} href={`/books/${clientId}/reports?r=aged`} />
        <StatCard
          label={s.vatPayableCents >= 0n ? "VAT payable" : "VAT refundable"}
          value={formatCents(s.vatPayableCents < 0n ? -s.vatPayableCents : s.vatPayableCents)}
          icon={Scales}
          tone={s.vatPayableCents >= 0n ? "warn" : "positive"}
          hint={client.vatRegistered ? "Output less input VAT, all periods" : "Client not VAT registered"}
          href={`/books/${clientId}/reports?r=vat`}
        />
        <StatCard label="Balance sheet" value={s.bs.balanced ? "Balances" : "Out of balance"} icon={Scales} tone={s.bs.balanced ? "positive" : "negative"} href={`/books/${clientId}/reports?r=bs`} hint={`Assets ${formatCents(s.bs.totals.totalAssetsCents)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
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
        <Card title="Where the money goes" description="Biggest costs this year" icon={ChartPieSlice}>
          {expenseSlices.length ? (
            <>
              <Donut data={expenseSlices} />
              <ul className="mt-4 space-y-1.5 text-sm">
                {expenseSlices.map((e) => (
                  <li key={e.name} className="flex justify-between gap-3">
                    <span className="truncate text-ink-2">{e.name}</span>
                    <span className="tabular text-muted">{formatCents(BigInt(Math.round(e.value * 100)))}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty>No expenses yet this year.</Empty>
          )}
        </Card>
      </div>

      <Card title="Financial health" description="Same ratios as Analiva, from this year's figures and today's balances" icon={Gauge}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {s.ratios.map((r) => (
            <div key={r.key} className="rounded-xl border border-line p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">{r.label}</span>
                <Badge tone={toneBadge[r.tone]} dot>
                  {r.tone === "good" ? "Good" : r.tone === "watch" ? "Watch" : r.tone === "risk" ? "Risk" : "-"}
                </Badge>
              </div>
              <p className="mt-1.5 font-display text-xl font-semibold tabular text-ink">{formatRatio(r)}</p>
              <p className="mt-0.5 text-xs text-faint">{r.hint}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top accounts this year" icon={Pulse} actions={<Link href={`/books/${clientId}/reports?r=tb`} className="text-xs font-medium text-brand-text hover:underline">Trial balance</Link>}>
          <ul className="divide-y divide-line text-sm">
            {[...s.periodRows]
              .filter((r) => r.debitCents !== 0n || r.creditCents !== 0n)
              .sort((a, b) => Number((b.debitCents + b.creditCents) - (a.debitCents + a.creditCents)))
              .slice(0, 8)
              .map((r) => (
                <li key={r.accountId} className="flex justify-between gap-3 py-2">
                  <Link href={`/books/${clientId}/reports?r=gl&account=${r.code}`} className="truncate hover:text-brand-text">
                    <span className="mr-2 text-faint tabular">{r.code}</span>
                    {r.name}
                  </Link>
                  <span className="tabular">{formatCents(natural(r))}</span>
                </li>
              ))}
          </ul>
        </Card>
        <Card title="Cash flow this year" icon={Wallet} actions={<Link href={`/books/${clientId}/reports?r=cf`} className="text-xs font-medium text-brand-text hover:underline">Full statement</Link>}>
          <dl className="space-y-2 text-sm">
            {(
              [
                ["Net profit", s.cf.netProfitCents],
                ["Working capital", s.cf.operatingCents - s.cf.netProfitCents],
                ["Operating activities", s.cf.operatingCents],
                ["Investing activities", s.cf.investingCents],
                ["Financing activities", s.cf.financingCents],
              ] as Array<[string, bigint]>
            ).map(([label, v]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-muted">{label}</dt>
                <dd className={`tabular ${v < 0n ? "text-danger" : "text-ink"}`}>{formatCents(v)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-line pt-2 font-medium">
              <dt>Net change in cash</dt>
              <dd className="tabular">{formatCents(s.cf.netChangeCents)}</dd>
            </div>
          </dl>
          {!s.cf.reconciles ? <p className="mt-3 text-xs text-warn">Doesn&apos;t tie to the bank accounts yet; check unposted or suspense items.</p> : null}
        </Card>
      </div>
    </div>
  );
}
