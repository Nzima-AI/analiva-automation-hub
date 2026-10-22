import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";
import { formatCents, natural, trialBalance, vatPeriodRange, type StatementLine } from "@aah/core";
import { PrintButton } from "@/components/print-button";
import { Badge, ButtonLink, Card, Empty, Input, Notice, Select, cx } from "@/components/ui";
import { statementsFor } from "@/lib/books/analytics";
import { accountTotals } from "@/lib/books/ledger";
import { describePeriod, presetPeriods, resolvePeriod } from "@/lib/books/periods";
import { formatCalendarDate } from "@/lib/format";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Reports" };

const REPORTS = [
  { key: "is", label: "Income statement" },
  { key: "bs", label: "Balance sheet" },
  { key: "cf", label: "Cash flow" },
  { key: "tb", label: "Trial balance" },
  { key: "gl", label: "General ledger" },
  { key: "vat", label: "VAT201" },
  { key: "aged", label: "Aged creditors & debtors" },
] as const;
type ReportKey = (typeof REPORTS)[number]["key"];

function Money({ c, strong, negativeRed }: { c: bigint; strong?: boolean; negativeRed?: boolean }) {
  return <span className={cx("tabular", strong && "font-semibold", negativeRed && c < 0n && "text-danger")}>{c < 0n ? `(${formatCents(-c)})` : formatCents(c)}</span>;
}

function Section({ title, lines, total, clientId }: { title: string; lines: StatementLine[]; total: bigint; clientId: string }) {
  return (
    <>
      <tr>
        <td colSpan={2} className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-faint">
          {title}
        </td>
      </tr>
      {lines.map((l) => (
        <tr key={l.accountId} className="text-ink-2">
          <td className="py-1 pl-3">
            <Link href={`/books/${clientId}/reports?r=gl&account=${l.code}`} className="hover:text-brand-text">
              {l.name}
            </Link>
          </td>
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

function TotalRow({ label, c, big }: { label: string; c: bigint; big?: boolean }) {
  return (
    <tr className={cx("border-t-2 border-line-strong", big && "bg-subtle")}>
      <td className={cx("py-2 font-semibold", big && "pl-2")}>{label}</td>
      <td className={cx("py-2 text-right", big && "pr-2")}>
        <Money c={c} strong negativeRed />
      </td>
    </tr>
  );
}

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { db } = await requireStaff();
  const { clientId } = await params;
  const sp = await searchParams;
  const r: ReportKey = (REPORTS.find((x) => x.key === sp.r)?.key ?? "is") as ReportKey;
  const client = await db.client.findFirst({ where: { id: clientId }, select: { name: true, financialYearEndMonth: true, vatRegistered: true, vatCategory: true } });
  if (!client) notFound();
  const period = resolvePeriod(sp, client.financialYearEndMonth);
  const presets = presetPeriods(client.financialYearEndMonth);
  const qs = (extra: Record<string, string>) => {
    const base: Record<string, string> = { r, ...(period.key === "custom" ? { from: sp.from ?? "", to: sp.to ?? "" } : { p: period.key }) };
    return `/books/${clientId}/reports?${new URLSearchParams({ ...base, ...extra })}`;
  };
  const exportQs = new URLSearchParams(period.key === "custom" ? { from: sp.from ?? "", to: sp.to ?? "" } : { p: period.key }).toString();

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-panel p-1 shadow-xs">
          {REPORTS.map((x) => (
            <Link key={x.key} href={qs({ r: x.key })} className={cx("rounded-lg px-3 py-1.5 text-sm", x.key === r ? "bg-brand-soft font-medium text-brand-text" : "text-muted hover:text-ink")}>
              {x.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`/books/${clientId}/export?format=xlsx&${exportQs}`} variant="secondary" size="sm" prefetch={false}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel pack
          </ButtonLink>
          <ButtonLink href={`/books/${clientId}/export?format=analiva&${exportQs}`} variant="secondary" size="sm" prefetch={false}>
            <Download className="h-3.5 w-3.5" /> Analiva ledger
          </ButtonLink>
        </div>
      </div>

      {r !== "vat" && r !== "aged" ? (
        <form className="no-print flex flex-wrap items-end gap-2">
          <input type="hidden" name="r" value={r} />
          {r === "gl" && sp.account ? <input type="hidden" name="account" value={sp.account} /> : null}
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <Link key={p.key} href={qs({ p: p.key, from: "", to: "" }).replace(/&?(from|to)=(?=&|$)/g, "")} className={cx("rounded-full border px-3 py-1 text-xs", period.key === p.key ? "border-brand bg-brand-soft text-brand-text" : "border-line text-muted hover:text-ink")}>
                {p.label}
              </Link>
            ))}
          </div>
          <Input type="date" name="from" defaultValue={sp.from} className="h-8 w-36 text-xs" aria-label="From" />
          <Input type="date" name="to" defaultValue={sp.to} className="h-8 w-36 text-xs" aria-label="To" />
          <button className="h-8 rounded-lg border border-line bg-panel px-3 text-xs hover:bg-subtle">Apply</button>
          <PrintButton />
        </form>
      ) : null}

      {r === "is" || r === "bs" || r === "cf" ? <Statements clientId={clientId} r={r} period={period} yearEndMonth={client.financialYearEndMonth} clientName={client.name} /> : null}
      {r === "tb" ? <TrialBalanceReport clientId={clientId} to={period.to} clientName={client.name} /> : null}
      {r === "gl" ? <GeneralLedger clientId={clientId} period={period} account={sp.account} /> : null}
      {r === "vat" ? <VatReport clientId={clientId} vatRegistered={client.vatRegistered} category={client.vatCategory} periodEnd={sp.period} /> : null}
      {r === "aged" ? <AgedReport clientId={clientId} /> : null}
    </div>
  );

  async function Statements({ clientId, r, period, yearEndMonth, clientName }: { clientId: string; r: "is" | "bs" | "cf"; period: { from: Date; to: Date; label: string }; yearEndMonth: number; clientName: string }) {
    const s = await statementsFor(db, clientId, { from: period.from, to: period.to, yearEndMonth });
    const head = (
      <div className="mb-4 text-center">
        <p className="font-display text-lg font-semibold">{clientName}</p>
        <p className="text-sm text-muted">
          {r === "is" ? "Income statement" : r === "bs" ? `Balance sheet as at ${formatCalendarDate(new Date(period.to.getTime() - 86_400_000))}` : "Cash flow statement"}
          {r !== "bs" ? ` · ${describePeriod(period as never)}` : ""}
        </p>
      </div>
    );
    if (r === "is") {
      const t = s.is.totals;
      return (
        <Card>
          {head}
          <table className="mx-auto w-full max-w-2xl text-sm">
            <tbody>
              <Section title="Sales" lines={s.is.sales} total={t.salesCents} clientId={clientId} />
              <Section title="Cost of sales" lines={s.is.costOfSales} total={t.costOfSalesCents} clientId={clientId} />
              <TotalRow label={`Gross profit${s.is.grossMarginPct !== null ? ` (${s.is.grossMarginPct}%)` : ""}`} c={t.grossProfitCents} />
              <Section title="Other income" lines={s.is.otherIncome} total={t.otherIncomeCents} clientId={clientId} />
              <Section title="Operating expenses" lines={s.is.expenses} total={t.expensesCents} clientId={clientId} />
              <TotalRow label="Profit before tax" c={t.profitBeforeTaxCents} />
              {t.incomeTaxCents ? <Section title="Income tax" lines={s.is.incomeTax} total={t.incomeTaxCents} clientId={clientId} /> : null}
              <TotalRow label={`Net profit${s.is.netMarginPct !== null ? ` (${s.is.netMarginPct}%)` : ""}`} c={t.netProfitCents} big />
            </tbody>
          </table>
        </Card>
      );
    }
    if (r === "bs") {
      const b = s.bs;
      const equityLines: StatementLine[] = [
        ...b.equity,
        ...(b.priorYearsProfitCents ? [{ accountId: "prior", code: "", name: "Accumulated profit (earlier years)", amountCents: b.priorYearsProfitCents }] : []),
        { accountId: "current", code: "", name: "Profit for the current year", amountCents: b.currentYearProfitCents },
      ];
      return (
        <Card>
          {head}
          {!b.balanced ? <Notice>The balance sheet is out by {formatCents(b.totals.totalAssetsCents - b.totals.liabilitiesAndEquityCents)}. Check the trial balance.</Notice> : null}
          <table className="mx-auto w-full max-w-2xl text-sm">
            <tbody>
              <Section title="Non-current assets" lines={b.nonCurrentAssets} total={b.totals.nonCurrentAssetsCents} clientId={clientId} />
              <Section title="Current assets" lines={[...b.currentAssets, ...b.bank]} total={b.totals.currentAssetsCents + b.totals.bankCents} clientId={clientId} />
              <TotalRow label="Total assets" c={b.totals.totalAssetsCents} big />
              <Section title="Equity" lines={equityLines} total={b.totals.equityCents} clientId={clientId} />
              <Section title="Non-current liabilities" lines={b.nonCurrentLiabilities} total={b.totals.nonCurrentLiabilitiesCents} clientId={clientId} />
              <Section title="Current liabilities" lines={b.currentLiabilities} total={b.totals.currentLiabilitiesCents} clientId={clientId} />
              <TotalRow label="Total equity and liabilities" c={b.totals.liabilitiesAndEquityCents} big />
            </tbody>
          </table>
        </Card>
      );
    }
    const c = s.cf;
    return (
      <Card>
        {head}
        <table className="mx-auto w-full max-w-2xl text-sm">
          <tbody>
            <tr>
              <td className="py-1">Net profit</td>
              <td className="py-1 text-right">
                <Money c={c.netProfitCents} />
              </td>
            </tr>
            <Section title="Working capital changes" lines={c.workingCapital} total={c.operatingCents - c.netProfitCents} clientId={clientId} />
            <TotalRow label="Cash from operating activities" c={c.operatingCents} />
            <Section title="Investing activities" lines={c.investing} total={c.investingCents} clientId={clientId} />
            <Section title="Financing activities" lines={c.financing} total={c.financingCents} clientId={clientId} />
            <TotalRow label="Net change in cash" c={c.netChangeCents} big />
            <tr>
              <td className="pt-3 text-xs text-muted">Movement on bank accounts</td>
              <td className="pt-3 text-right text-xs">
                <Money c={c.bankMovementCents} /> {c.reconciles ? <Badge tone="positive">Ties</Badge> : <Badge tone="warn">Doesn&apos;t tie</Badge>}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    );
  }

  async function TrialBalanceReport({ clientId, to, clientName }: { clientId: string; to: Date; clientName: string }) {
    const tb = trialBalance(await accountTotals(db, clientId, { to }));
    return (
      <Card>
        <div className="mb-4 text-center">
          <p className="font-display text-lg font-semibold">{clientName}</p>
          <p className="text-sm text-muted">Trial balance as at {formatCalendarDate(new Date(to.getTime() - 86_400_000))}</p>
        </div>
        {tb.rows.length === 0 ? (
          <Empty>No balances yet.</Empty>
        ) : (
          <table className="mx-auto w-full max-w-3xl text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-faint">
                <th className="py-2">Account</th>
                <th className="py-2 text-right">Debit</th>
                <th className="py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((row) => (
                <tr key={row.accountId} className="border-b border-line/60">
                  <td className="py-1.5">
                    <Link href={`/books/${clientId}/reports?r=gl&account=${row.code}`} className="hover:text-brand-text">
                      <span className="mr-3 text-faint tabular">{row.code}</span>
                      {row.name}
                    </Link>
                  </td>
                  <td className="py-1.5 text-right tabular">{row.balanceDebitCents ? formatCents(row.balanceDebitCents) : ""}</td>
                  <td className="py-1.5 text-right tabular">{row.balanceCreditCents ? formatCents(row.balanceCreditCents) : ""}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line-strong font-semibold">
                <td className="py-2">Totals {tb.balanced ? <Badge tone="positive">Balanced</Badge> : <Badge tone="danger">Out of balance</Badge>}</td>
                <td className="py-2 text-right tabular">{formatCents(tb.totalDebitCents)}</td>
                <td className="py-2 text-right tabular">{formatCents(tb.totalCreditCents)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    );
  }

  async function GeneralLedger({ clientId, period, account }: { clientId: string; period: { from: Date; to: Date }; account?: string }) {
    const accounts = await db.ledgerAccount.findMany({ where: { clientId }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true } });
    const acc = accounts.find((a) => a.code === account) ?? null;
    const [opening, lines] = acc
      ? await Promise.all([
          db.journalLine.aggregate({ where: { accountId: acc.id, date: { lt: period.from } }, _sum: { debitCents: true, creditCents: true } }),
          db.journalLine.findMany({
            where: { accountId: acc.id, date: { gte: period.from, lt: period.to } },
            orderBy: [{ date: "asc" }, { id: "asc" }],
            take: 2000,
            include: { entry: { select: { description: true, reference: true, source: true, sourceId: true } } },
          }),
        ])
      : [null, []];
    const openingNet = acc && opening ? natural({ type: acc.type, debitCents: opening._sum.debitCents ?? 0n, creditCents: opening._sum.creditCents ?? 0n }) : 0n;
    let running = openingNet;
    return (
      <Card>
        <form className="no-print mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="r" value="gl" />
          {period ? <input type="hidden" name="p" value={sp.p ?? "fy"} /> : null}
          <Select name="account" defaultValue={acc?.code ?? ""} className="w-80 max-w-full">
            <option value="" disabled>
              Choose an account…
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.code}>
                {a.code} · {a.name}
              </option>
            ))}
          </Select>
          <button className="h-9 rounded-lg border border-line bg-panel px-3 text-sm hover:bg-subtle">Show</button>
        </form>
        {!acc ? (
          <Empty>Choose an account to see every line posted to it, with a running balance.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-faint">
                <th className="py-2">Date</th>
                <th className="py-2">Description</th>
                <th className="py-2">Ref</th>
                <th className="py-2 text-right">Debit</th>
                <th className="py-2 text-right">Credit</th>
                <th className="py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="text-muted">
                <td className="py-1.5" colSpan={5}>
                  Opening balance
                </td>
                <td className="py-1.5 text-right tabular">{formatCents(openingNet)}</td>
              </tr>
              {lines.map((l) => {
                running += natural({ type: acc.type, debitCents: l.debitCents, creditCents: l.creditCents });
                const href = l.entry.source === "INVOICE" && l.entry.sourceId ? `/invoices/${l.entry.sourceId}` : null;
                return (
                  <tr key={l.id} className="border-b border-line/60">
                    <td className="py-1.5 tabular text-muted">{formatCalendarDate(l.date)}</td>
                    <td className="py-1.5">{href ? <Link href={href} className="hover:text-brand-text">{l.entry.description}</Link> : l.entry.description}</td>
                    <td className="py-1.5 text-muted">{l.entry.reference ?? ""}</td>
                    <td className="py-1.5 text-right tabular">{l.debitCents ? formatCents(l.debitCents) : ""}</td>
                    <td className="py-1.5 text-right tabular">{l.creditCents ? formatCents(l.creditCents) : ""}</td>
                    <td className="py-1.5 text-right font-medium tabular">{formatCents(running)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-line-strong font-semibold">
                <td className="py-2" colSpan={5}>
                  Closing balance
                </td>
                <td className="py-2 text-right tabular">{formatCents(running)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    );
  }

  async function VatReport({ clientId, vatRegistered, category, periodEnd }: { clientId: string; vatRegistered: boolean; category: string | null; periodEnd?: string }) {
    if (!vatRegistered || !(category === "A" || category === "B" || category === "C")) {
      return (
        <Card>
          <Empty>
            The VAT201 report needs the client marked as VAT registered with a VAT category.{" "}
            <Link href={`/clients/${clientId}/edit`} className="text-brand-text hover:underline">
              Edit the tax profile
            </Link>
            .
          </Empty>
        </Card>
      );
    }
    // Recent period ends for this category.
    const now = new Date();
    const ends: string[] = [];
    for (let i = 0; i < 18 && ends.length < 8; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const m = d.getUTCMonth() + 1;
      if (category === "C" || (category === "A" && m % 2 === 0) || (category === "B" && m % 2 === 1)) ends.push(d.toISOString().slice(0, 7));
    }
    const chosen = periodEnd && ends.includes(periodEnd) ? periodEnd : ends[0]!;
    const range = vatPeriodRange(category, chosen);
    const rows = await accountTotals(db, clientId, { from: range.from, to: range.to });
    const accounts = await db.ledgerAccount.findMany({ where: { clientId, systemKey: { in: ["VAT_INPUT", "VAT_OUTPUT"] } }, select: { id: true, systemKey: true } });
    const idOf = (k: string) => accounts.find((a) => a.systemKey === k)?.id;
    const out = rows.find((x) => x.accountId === idOf("VAT_OUTPUT"));
    const inp = rows.find((x) => x.accountId === idOf("VAT_INPUT"));
    const outputTax = out ? out.creditCents - out.debitCents : 0n;
    const inputTax = inp ? inp.debitCents - inp.creditCents : 0n;
    const sales = rows.filter((x) => x.type === "SALES" || x.type === "OTHER_INCOME").reduce((s, x) => s + x.creditCents - x.debitCents, 0n);
    const standardRated = (outputTax * 10000n + 750n) / 1500n;
    const net = outputTax - inputTax;
    const fields: Array<[string, string, bigint]> = [
      ["1", "Standard-rated supplies (excl. VAT)", standardRated],
      ["4", "Output tax on standard-rated supplies", outputTax],
      ["15", "Input tax: other goods and services", inputTax],
      ["19", "Total input tax", inputTax],
      ["20", net >= 0n ? "VAT payable" : "VAT refundable", net < 0n ? -net : net],
    ];
    return (
      <Card title={`VAT201 · ${new Intl.DateTimeFormat("en-ZA", { month: "short", year: "numeric", timeZone: "UTC" }).format(range.from)} to ${new Intl.DateTimeFormat("en-ZA", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(range.to.getTime() - 86_400_000))}`} description={`Category ${category}. Prepared from the books; check against source documents before submitting on eFiling.`}>
        <form className="no-print mb-4 flex gap-2">
          <input type="hidden" name="r" value="vat" />
          <Select name="period" defaultValue={chosen} className="w-56">
            {ends.map((e) => (
              <option key={e} value={e}>
                Period ending {new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${e}-01T00:00:00Z`))}
              </option>
            ))}
          </Select>
          <button className="h-9 rounded-lg border border-line bg-panel px-3 text-sm hover:bg-subtle">Show</button>
        </form>
        <table className="w-full max-w-2xl text-sm">
          <tbody>
            {fields.map(([f, label, v]) => (
              <tr key={f} className={cx("border-b border-line/60", f === "20" && "bg-subtle font-semibold")}>
                <td className="w-16 py-2 pl-2 text-faint tabular">Field {f}</td>
                <td className="py-2">{label}</td>
                <td className="py-2 pr-2 text-right tabular">{formatCents(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-muted">
          Total income in the period: {formatCents(sales)}. Zero-rated and exempt supplies, capital goods (field 14) and adjustments aren&apos;t split out by the books yet; enter those on eFiling if they apply.
        </p>
      </Card>
    );
  }

  async function AgedReport({ clientId }: { clientId: string }) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const invoices = await db.invoice.findMany({
      where: { clientId, deletedAt: null, status: { not: "REJECTED" } },
      select: { id: true, direction: true, invoiceNumber: true, issueDate: true, dueDate: true, totalCents: true, amountPaidCents: true, supplier: { select: { name: true } } },
    });
    const buckets = ["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days"] as const;
    const bucketOf = (due: Date) => {
      const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
      return days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
    };
    const build = (dir: "PAYABLE" | "RECEIVABLE") => {
      const byParty = new Map<string, { name: string; b: bigint[]; total: bigint; items: number }>();
      for (const i of invoices.filter((x) => x.direction === dir)) {
        const owed = i.totalCents - i.amountPaidCents;
        if (owed <= 0n) continue;
        const due = i.dueDate ?? new Date(i.issueDate.getTime() + 30 * 86_400_000);
        const name = i.supplier?.name ?? "Unknown";
        const row = byParty.get(name) ?? { name, b: [0n, 0n, 0n, 0n, 0n], total: 0n, items: 0 };
        row.b[bucketOf(due)]! += owed;
        row.total += owed;
        row.items++;
        byParty.set(name, row);
      }
      return [...byParty.values()].sort((a, b) => Number(b.total - a.total));
    };
    const table = (title: string, rows: ReturnType<typeof build>) => (
      <Card title={title} padded>
        {rows.length === 0 ? (
          <Empty>Nothing outstanding.</Empty>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-faint">
                  <th className="py-2">Name</th>
                  {buckets.map((b) => (
                    <th key={b} className="py-2 text-right">
                      {b}
                    </th>
                  ))}
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-b border-line/60">
                    <td className="py-1.5">
                      {r.name} <span className="text-xs text-faint">({r.items})</span>
                    </td>
                    {r.b.map((v, i) => (
                      <td key={i} className={cx("py-1.5 text-right tabular", i >= 3 && v > 0n && "text-danger")}>
                        {v ? formatCents(v) : ""}
                      </td>
                    ))}
                    <td className="py-1.5 text-right font-semibold tabular">{formatCents(r.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line-strong font-semibold">
                  <td className="py-2">Total</td>
                  {buckets.map((_, i) => (
                    <td key={i} className="py-2 text-right tabular">
                      {formatCents(rows.reduce((s, r) => s + r.b[i]!, 0n))}
                    </td>
                  ))}
                  <td className="py-2 text-right tabular">{formatCents(rows.reduce((s, r) => s + r.total, 0n))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    );
    return (
      <div className="space-y-6">
        {table("Aged creditors (what the client owes suppliers)", build("PAYABLE"))}
        {table("Aged debtors (what customers owe the client)", build("RECEIVABLE"))}
        <p className="text-xs text-faint">Ageing is from the due date (or 30 days after the invoice date when there isn&apos;t one). Payments come from matched bank lines.</p>
      </div>
    );
  }
}
