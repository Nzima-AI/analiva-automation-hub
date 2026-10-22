import type { BalanceSheet, CashFlow, IncomeStatement, StatementLine } from "@aah/core";
import { formatCents } from "@aah/core";
import { cx } from "@/components/ui";

function Money({ c, strong }: { c: bigint; strong?: boolean }) {
  return <span className={cx("tabular", strong && "font-semibold", c < 0n && "text-danger")}>{c < 0n ? `(${formatCents(-c)})` : formatCents(c)}</span>;
}

function Section({ title, lines, total }: { title: string; lines: StatementLine[]; total: bigint }) {
  if (lines.length === 0 && total === 0n) return null;
  return (
    <>
      <tr>
        <td colSpan={2} className="pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-faint">
          {title}
        </td>
      </tr>
      {lines.map((l) => (
        <tr key={l.accountId} className="text-ink-2">
          <td className="py-1 pl-3">{l.name}</td>
          <td className="py-1 text-right">
            <Money c={l.amountCents} />
          </td>
        </tr>
      ))}
      <tr className="border-t border-line">
        <td className="py-1.5 font-medium">Total {title.toLowerCase()}</td>
        <td className="py-1.5 text-right">
          <Money c={total} strong />
        </td>
      </tr>
    </>
  );
}

function Total({ label, c, big }: { label: string; c: bigint; big?: boolean }) {
  return (
    <tr className={cx("border-t-2 border-line-strong", big && "bg-subtle")}>
      <td className={cx("py-2.5 font-semibold", big && "pl-3")}>{label}</td>
      <td className={cx("py-2.5 text-right", big && "pr-3")}>
        <Money c={c} strong />
      </td>
    </tr>
  );
}

export function IncomeStatementView({ is }: { is: IncomeStatement }) {
  const t = is.totals;
  return (
    <table className="w-full text-sm">
      <tbody>
        <Section title="Sales" lines={is.sales} total={t.salesCents} />
        <Section title="Cost of sales" lines={is.costOfSales} total={t.costOfSalesCents} />
        <Total label={`Gross profit${is.grossMarginPct !== null ? ` (${is.grossMarginPct}%)` : ""}`} c={t.grossProfitCents} />
        <Section title="Other income" lines={is.otherIncome} total={t.otherIncomeCents} />
        <Section title="Operating expenses" lines={is.expenses} total={t.expensesCents} />
        <Total label="Profit before tax" c={t.profitBeforeTaxCents} />
        <Section title="Income tax" lines={is.incomeTax} total={t.incomeTaxCents} />
        <Total label={`Net profit${is.netMarginPct !== null ? ` (${is.netMarginPct}%)` : ""}`} c={t.netProfitCents} big />
      </tbody>
    </table>
  );
}

export function BalanceSheetView({ bs }: { bs: BalanceSheet }) {
  const equity: StatementLine[] = [
    ...bs.equity,
    ...(bs.priorYearsProfitCents ? [{ accountId: "prior", code: "", name: "Accumulated profit (earlier years)", amountCents: bs.priorYearsProfitCents }] : []),
    { accountId: "current", code: "", name: "Profit for the current year", amountCents: bs.currentYearProfitCents },
  ];
  return (
    <table className="w-full text-sm">
      <tbody>
        <Section title="Non-current assets" lines={bs.nonCurrentAssets} total={bs.totals.nonCurrentAssetsCents} />
        <Section title="Current assets" lines={[...bs.currentAssets, ...bs.bank]} total={bs.totals.currentAssetsCents + bs.totals.bankCents} />
        <Total label="Total assets" c={bs.totals.totalAssetsCents} big />
        <Section title="Equity" lines={equity} total={bs.totals.equityCents} />
        <Section title="Non-current liabilities" lines={bs.nonCurrentLiabilities} total={bs.totals.nonCurrentLiabilitiesCents} />
        <Section title="Current liabilities" lines={bs.currentLiabilities} total={bs.totals.currentLiabilitiesCents} />
        <Total label="Total equity and liabilities" c={bs.totals.liabilitiesAndEquityCents} big />
      </tbody>
    </table>
  );
}

export function CashFlowView({ cf }: { cf: CashFlow }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        <tr>
          <td className="py-1.5">Net profit</td>
          <td className="py-1.5 text-right">
            <Money c={cf.netProfitCents} />
          </td>
        </tr>
        <Section title="Working capital changes" lines={cf.workingCapital} total={cf.operatingCents - cf.netProfitCents} />
        <Total label="Cash from operating activities" c={cf.operatingCents} />
        <Section title="Investing activities" lines={cf.investing} total={cf.investingCents} />
        <Section title="Financing activities" lines={cf.financing} total={cf.financingCents} />
        <Total label="Net change in cash" c={cf.netChangeCents} big />
      </tbody>
    </table>
  );
}
