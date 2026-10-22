import "server-only";
import { ACCOUNT_TYPE_INFO, balanceSheet, cashFlow, incomeStatement, ratios, type AccountType } from "@aah/core";
import type { TenantDb } from "@aah/db";
import { accountTotals, financialYearStart } from "./ledger";

const DAY = 86_400_000;
const IS_TYPES: AccountType[] = ["SALES", "OTHER_INCOME", "COST_OF_SALES", "EXPENSE", "INCOME_TAX"];

export interface MonthPoint {
  month: string;
  label: string;
  incomeCents: bigint;
  expensesCents: bigint;
  profitCents: bigint;
  bankMovementCents: bigint;
}

/** Income, expenses, profit and bank movement per month for the last `months` months. */
export async function monthlySeries(db: TenantDb, clientId: string, months = 12): Promise<MonthPoint[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const accounts = await db.ledgerAccount.findMany({ where: { clientId }, select: { id: true, type: true } });
  const typeOf = new Map(accounts.map((a) => [a.id, a.type as AccountType]));
  const lines = await db.journalLine.findMany({
    where: { clientId, date: { gte: start } },
    select: { accountId: true, date: true, debitCents: true, creditCents: true },
  });
  const points = new Map<string, MonthPoint>();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const key = d.toISOString().slice(0, 7);
    points.set(key, {
      month: key,
      label: new Intl.DateTimeFormat("en-ZA", { month: "short", year: "2-digit", timeZone: "UTC" }).format(d),
      incomeCents: 0n,
      expensesCents: 0n,
      profitCents: 0n,
      bankMovementCents: 0n,
    });
  }
  for (const l of lines) {
    const p = points.get(l.date.toISOString().slice(0, 7));
    const t = typeOf.get(l.accountId);
    if (!p || !t) continue;
    if (t === "SALES" || t === "OTHER_INCOME") p.incomeCents += l.creditCents - l.debitCents;
    else if (t === "COST_OF_SALES" || t === "EXPENSE" || t === "INCOME_TAX") p.expensesCents += l.debitCents - l.creditCents;
    else if (t === "BANK") p.bankMovementCents += l.debitCents - l.creditCents;
  }
  for (const p of points.values()) p.profitCents = p.incomeCents - p.expensesCents;
  return [...points.values()];
}

/** Everything the overview and the statements pages need for one period. */
export async function statementsFor(db: TenantDb, clientId: string, opts: { from: Date; to: Date; yearEndMonth: number }) {
  const [periodRows, cumulativeRows, yearRows] = await Promise.all([
    accountTotals(db, clientId, { from: opts.from, to: opts.to }),
    accountTotals(db, clientId, { to: opts.to }),
    accountTotals(db, clientId, { from: financialYearStart(new Date(opts.to.getTime() - DAY), opts.yearEndMonth), to: opts.to, types: IS_TYPES }),
  ]);
  const is = incomeStatement(periodRows);
  const bs = balanceSheet(cumulativeRows, yearRows);
  const cf = cashFlow(periodRows);
  const periodDays = Math.max(1, Math.round((opts.to.getTime() - opts.from.getTime()) / DAY));
  const months = Math.max(1, periodDays / 30.4);
  const byKey = (re: RegExp) => cumulativeRows.filter((r) => re.test(r.name)).reduce((s, r) => s + (r.debitCents - r.creditCents), 0n);
  const debtors = cumulativeRows.filter((r) => r.type === "CURRENT_ASSET" && /debtor|receivable/i.test(r.name)).reduce((s, r) => s + r.debitCents - r.creditCents, 0n);
  const creditors = cumulativeRows.filter((r) => r.type === "CURRENT_LIABILITY" && /creditor|payable/i.test(r.name) && !/vat|paye|tax/i.test(r.name)).reduce((s, r) => s + r.creditCents - r.debitCents, 0n);
  const r = ratios({
    bs,
    is,
    operatingCashCents: cf.operatingCents,
    monthlyNetCashCents: BigInt(Math.round(Number(cf.bankMovementCents) / months)),
    inventoryCents: byKey(/inventory|stock/i),
    debtorsCents: debtors,
    creditorsCents: creditors,
    periodDays,
  });
  const vatInput = cumulativeRows.filter((x) => /vat input/i.test(x.name)).reduce((s, x) => s + x.debitCents - x.creditCents, 0n);
  const vatOutput = cumulativeRows.filter((x) => /vat output/i.test(x.name)).reduce((s, x) => s + x.creditCents - x.debitCents, 0n);
  return { periodRows, cumulativeRows, is, bs, cf, ratios: r, debtors, creditors, vatPayableCents: vatOutput - vatInput };
}

export function typeLabel(t: AccountType): string {
  return ACCOUNT_TYPE_INFO[t].label;
}
