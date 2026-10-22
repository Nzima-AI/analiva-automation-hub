import Link from "next/link";
import { FileText } from "@phosphor-icons/react/dist/ssr";
import { PrintButton } from "@/components/print-button";
import { BalanceSheetView, CashFlowView, IncomeStatementView } from "@/components/statements";
import { Card, Empty, PageHeader, cx } from "@/components/ui";
import { statementsFor } from "@/lib/books/analytics";
import { describePeriod, presetPeriods, resolvePeriod } from "@/lib/books/periods";
import { formatCalendarDate } from "@/lib/format";
import { requireClient } from "@/lib/session";

export const metadata = { title: "Reports" };

const REPORTS = [
  { key: "is", label: "Income statement" },
  { key: "bs", label: "Balance sheet" },
  { key: "cf", label: "Cash flow" },
] as const;

export default async function PortalReportsPage({ searchParams }: { searchParams: Promise<{ r?: string; p?: string }> }) {
  const { db, clientId } = await requireClient();
  const sp = await searchParams;
  const client = await db.client.findFirstOrThrow({ where: { id: clientId }, select: { name: true, financialYearEndMonth: true, portalShowsBooks: true } });
  if (!client.portalShowsBooks) {
    return (
      <div>
        <PageHeader title="Reports" />
        <Card>
          <Empty icon={FileText}>Your accountant hasn&apos;t shared reports in the portal yet.</Empty>
        </Card>
      </div>
    );
  }
  const r = REPORTS.find((x) => x.key === sp.r)?.key ?? "is";
  const period = resolvePeriod({ p: sp.p }, client.financialYearEndMonth);
  const s = await statementsFor(db, clientId, { from: period.from, to: period.to, yearEndMonth: client.financialYearEndMonth });
  const q = (o: Record<string, string>) => `/portal/reports?${new URLSearchParams({ r, p: period.key, ...o })}`;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Prepared from your books by your accountant. Figures update as invoices and bank statements are processed." actions={<PrintButton />} />
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-line bg-panel p-1 shadow-xs">
          {REPORTS.map((x) => (
            <Link key={x.key} href={q({ r: x.key })} className={cx("rounded-lg px-3 py-1.5 text-sm transition-colors", x.key === r ? "bg-brand-soft font-medium text-brand-text" : "text-muted hover:text-ink")}>
              {x.label}
            </Link>
          ))}
        </div>
        {r !== "bs" ? (
          <div className="flex flex-wrap gap-1">
            {presetPeriods(client.financialYearEndMonth).map((p) => (
              <Link key={p.key} href={q({ p: p.key })} className={cx("rounded-full border px-3 py-1 text-xs transition-colors", period.key === p.key ? "border-brand bg-brand-soft text-brand-text" : "border-line text-muted hover:text-ink")}>
                {p.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <Card>
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 text-center">
            <p className="font-display text-lg font-semibold">{client.name}</p>
            <p className="text-sm text-muted">
              {r === "bs" ? `Balance sheet as at ${formatCalendarDate(new Date(period.to.getTime() - 86_400_000))}` : `${REPORTS.find((x) => x.key === r)!.label}, ${describePeriod(period)}`}
            </p>
          </div>
          {r === "is" ? <IncomeStatementView is={s.is} /> : r === "bs" ? <BalanceSheetView bs={s.bs} /> : <CashFlowView cf={s.cf} />}
        </div>
      </Card>
    </div>
  );
}
