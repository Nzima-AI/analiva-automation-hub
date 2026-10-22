import { ACCOUNT_TYPE_INFO, type AccountType } from "./chart";

/**
 * Financial statements from account totals. All money is bigint cents.
 * Figures follow Analiva's definitions so both platforms agree:
 *   Gross profit = Sales − Cost of sales
 *   Profit before tax = Gross profit + Other income − Operating expenses
 *   Net profit = Profit before tax − Income tax
 */

export interface AccountTotal {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debitCents: bigint;
  creditCents: bigint;
}

export interface StatementLine {
  accountId: string;
  code: string;
  name: string;
  /** In the account's natural sign (income/liabilities positive when credited). */
  amountCents: bigint;
}

/** Natural-sign amount for an account. */
export function natural(t: Pick<AccountTotal, "type" | "debitCents" | "creditCents">): bigint {
  return ACCOUNT_TYPE_INFO[t.type].normal === "DEBIT" ? t.debitCents - t.creditCents : t.creditCents - t.debitCents;
}

function lines(rows: AccountTotal[], types: AccountType[]): StatementLine[] {
  return rows
    .filter((r) => types.includes(r.type))
    .map((r) => ({ accountId: r.accountId, code: r.code, name: r.name, amountCents: natural(r) }))
    .filter((l) => l.amountCents !== 0n)
    .sort((a, b) => a.code.localeCompare(b.code));
}

const sum = (ls: StatementLine[]) => ls.reduce((s, l) => s + l.amountCents, 0n);

// ------------------------------------------------------------------ trial balance

export interface TrialBalanceRow extends AccountTotal {
  balanceDebitCents: bigint;
  balanceCreditCents: bigint;
}

export function trialBalance(rows: AccountTotal[]): { rows: TrialBalanceRow[]; totalDebitCents: bigint; totalCreditCents: bigint; balanced: boolean } {
  const out = rows
    .map((r) => {
      const net = r.debitCents - r.creditCents;
      return { ...r, balanceDebitCents: net > 0n ? net : 0n, balanceCreditCents: net < 0n ? -net : 0n };
    })
    .filter((r) => r.balanceDebitCents !== 0n || r.balanceCreditCents !== 0n)
    .sort((a, b) => a.code.localeCompare(b.code));
  const totalDebitCents = out.reduce((s, r) => s + r.balanceDebitCents, 0n);
  const totalCreditCents = out.reduce((s, r) => s + r.balanceCreditCents, 0n);
  return { rows: out, totalDebitCents, totalCreditCents, balanced: totalDebitCents === totalCreditCents };
}

// ------------------------------------------------------------------ income statement

export interface IncomeStatement {
  sales: StatementLine[];
  costOfSales: StatementLine[];
  otherIncome: StatementLine[];
  expenses: StatementLine[];
  incomeTax: StatementLine[];
  totals: {
    salesCents: bigint;
    costOfSalesCents: bigint;
    grossProfitCents: bigint;
    otherIncomeCents: bigint;
    expensesCents: bigint;
    profitBeforeTaxCents: bigint;
    incomeTaxCents: bigint;
    netProfitCents: bigint;
  };
  grossMarginPct: number | null;
  netMarginPct: number | null;
}

export function incomeStatement(rows: AccountTotal[]): IncomeStatement {
  const sales = lines(rows, ["SALES"]);
  const costOfSales = lines(rows, ["COST_OF_SALES"]);
  const otherIncome = lines(rows, ["OTHER_INCOME"]);
  const expenses = lines(rows, ["EXPENSE"]);
  const incomeTax = lines(rows, ["INCOME_TAX"]);
  const salesCents = sum(sales);
  const costOfSalesCents = sum(costOfSales);
  const grossProfitCents = salesCents - costOfSalesCents;
  const otherIncomeCents = sum(otherIncome);
  const expensesCents = sum(expenses);
  const profitBeforeTaxCents = grossProfitCents + otherIncomeCents - expensesCents;
  const incomeTaxCents = sum(incomeTax);
  const netProfitCents = profitBeforeTaxCents - incomeTaxCents;
  return {
    sales,
    costOfSales,
    otherIncome,
    expenses,
    incomeTax,
    totals: { salesCents, costOfSalesCents, grossProfitCents, otherIncomeCents, expensesCents, profitBeforeTaxCents, incomeTaxCents, netProfitCents },
    grossMarginPct: pct(grossProfitCents, salesCents),
    netMarginPct: pct(netProfitCents, salesCents),
  };
}

function pct(a: bigint, b: bigint): number | null {
  if (b === 0n) return null;
  return Math.round((Number(a) / Number(b)) * 1000) / 10;
}

// ------------------------------------------------------------------ balance sheet

export interface BalanceSheet {
  nonCurrentAssets: StatementLine[];
  currentAssets: StatementLine[];
  bank: StatementLine[];
  currentLiabilities: StatementLine[];
  nonCurrentLiabilities: StatementLine[];
  equity: StatementLine[];
  /** Profit since the financial year started (not yet closed to retained earnings). */
  currentYearProfitCents: bigint;
  /** P&L from earlier years that was never closed off by a journal. */
  priorYearsProfitCents: bigint;
  totals: {
    nonCurrentAssetsCents: bigint;
    currentAssetsCents: bigint;
    bankCents: bigint;
    totalAssetsCents: bigint;
    currentLiabilitiesCents: bigint;
    nonCurrentLiabilitiesCents: bigint;
    totalLiabilitiesCents: bigint;
    equityCents: bigint;
    liabilitiesAndEquityCents: bigint;
  };
  balanced: boolean;
}

/**
 * cumulativeRows: every account from the beginning of the books to the as-at date.
 * yearRows: income-statement accounts from the financial year start to the as-at date.
 */
export function balanceSheet(cumulativeRows: AccountTotal[], yearRows: AccountTotal[]): BalanceSheet {
  const nonCurrentAssets = lines(cumulativeRows, ["FIXED_ASSET"]);
  const currentAssets = lines(cumulativeRows, ["CURRENT_ASSET"]);
  const bank = lines(cumulativeRows, ["BANK"]);
  const currentLiabilities = lines(cumulativeRows, ["CURRENT_LIABILITY"]);
  const nonCurrentLiabilities = lines(cumulativeRows, ["LONG_TERM_LIABILITY"]);
  const equity = lines(cumulativeRows, ["EQUITY"]);

  const allProfit = incomeStatement(cumulativeRows).totals.netProfitCents;
  const currentYearProfitCents = incomeStatement(yearRows).totals.netProfitCents;
  const priorYearsProfitCents = allProfit - currentYearProfitCents;

  const nonCurrentAssetsCents = sum(nonCurrentAssets);
  const currentAssetsCents = sum(currentAssets);
  const bankCents = sum(bank);
  const totalAssetsCents = nonCurrentAssetsCents + currentAssetsCents + bankCents;
  const currentLiabilitiesCents = sum(currentLiabilities);
  const nonCurrentLiabilitiesCents = sum(nonCurrentLiabilities);
  const totalLiabilitiesCents = currentLiabilitiesCents + nonCurrentLiabilitiesCents;
  const equityCents = sum(equity) + allProfit;
  const liabilitiesAndEquityCents = totalLiabilitiesCents + equityCents;

  return {
    nonCurrentAssets,
    currentAssets,
    bank,
    currentLiabilities,
    nonCurrentLiabilities,
    equity,
    currentYearProfitCents,
    priorYearsProfitCents,
    totals: {
      nonCurrentAssetsCents,
      currentAssetsCents,
      bankCents,
      totalAssetsCents,
      currentLiabilitiesCents,
      nonCurrentLiabilitiesCents,
      totalLiabilitiesCents,
      equityCents,
      liabilitiesAndEquityCents,
    },
    balanced: totalAssetsCents === liabilitiesAndEquityCents,
  };
}

// ------------------------------------------------------------------ cash flow (indirect)

export interface CashFlow {
  netProfitCents: bigint;
  /** Working-capital movements: positive releases cash. */
  workingCapital: StatementLine[];
  operatingCents: bigint;
  investing: StatementLine[];
  investingCents: bigint;
  financing: StatementLine[];
  financingCents: bigint;
  netChangeCents: bigint;
  /** Movement actually seen on bank accounts; should equal netChangeCents. */
  bankMovementCents: bigint;
  reconciles: boolean;
}

/** periodRows: every account's movement within the period. */
export function cashFlow(periodRows: AccountTotal[]): CashFlow {
  const netProfitCents = incomeStatement(periodRows).totals.netProfitCents;
  // Each non-cash balance-sheet account contributes (credit − debit) to cash.
  const contribution = (types: AccountType[]): StatementLine[] =>
    periodRows
      .filter((r) => types.includes(r.type))
      .map((r) => ({ accountId: r.accountId, code: r.code, name: r.name, amountCents: r.creditCents - r.debitCents }))
      .filter((l) => l.amountCents !== 0n)
      .sort((a, b) => a.code.localeCompare(b.code));
  const workingCapital = contribution(["CURRENT_ASSET", "CURRENT_LIABILITY"]);
  const investing = contribution(["FIXED_ASSET"]);
  const financing = contribution(["LONG_TERM_LIABILITY", "EQUITY"]);
  const operatingCents = netProfitCents + sum(workingCapital);
  const investingCents = sum(investing);
  const financingCents = sum(financing);
  const netChangeCents = operatingCents + investingCents + financingCents;
  const bankMovementCents = periodRows.filter((r) => r.type === "BANK").reduce((s, r) => s + r.debitCents - r.creditCents, 0n);
  return {
    netProfitCents,
    workingCapital,
    operatingCents,
    investing,
    investingCents,
    financing,
    financingCents,
    netChangeCents,
    bankMovementCents,
    reconciles: netChangeCents === bankMovementCents,
  };
}

// ------------------------------------------------------------------ ratios (Analiva set)

export interface Ratio {
  key: string;
  label: string;
  value: number | null;
  format: "times" | "pct" | "money" | "months" | "days";
  hint: string;
  tone: "good" | "watch" | "risk" | "neutral";
}

export function ratios(p: {
  bs: BalanceSheet;
  is: IncomeStatement;
  operatingCashCents: bigint;
  /** Average monthly net change in bank over the period (negative = burning cash). */
  monthlyNetCashCents: bigint;
  inventoryCents: bigint;
  debtorsCents: bigint;
  creditorsCents: bigint;
  /** Number of days the income statement covers. */
  periodDays: number;
}): Ratio[] {
  const n = (c: bigint) => Number(c) / 100;
  const div = (a: number, b: number) => (b ? Math.round((a / b) * 100) / 100 : null);
  const ca = n(p.bs.totals.currentAssetsCents + p.bs.totals.bankCents);
  const cl = n(p.bs.totals.currentLiabilitiesCents);
  const current = div(ca, cl);
  const quick = div(ca - n(p.inventoryCents), cl);
  const wc = ca - cl;
  const debtEquity = div(n(p.bs.totals.totalLiabilitiesCents), n(p.bs.totals.equityCents));
  const gm = p.is.grossMarginPct;
  const nm = p.is.netMarginPct;
  const np = n(p.is.totals.netProfitCents);
  const conversion = np > 0 ? Math.round((n(p.operatingCashCents) / np) * 100) : null;
  const bank = n(p.bs.totals.bankCents);
  const burn = n(p.monthlyNetCashCents);
  const runway = burn < 0 && bank > 0 ? Math.round((bank / -burn) * 10) / 10 : null;
  const sales = n(p.is.totals.salesCents);
  const purchases = n(p.is.totals.costOfSalesCents + p.is.totals.expensesCents);
  const debtorDays = sales > 0 ? Math.round((n(p.debtorsCents) / sales) * p.periodDays) : null;
  const creditorDays = purchases > 0 ? Math.round((n(p.creditorsCents) / purchases) * p.periodDays) : null;

  return [
    {
      key: "current",
      label: "Current ratio",
      value: current,
      format: "times",
      hint: current == null ? "No current liabilities" : current >= 1.5 ? "Comfortably covers short-term debts" : current >= 1 ? "Covers short-term debts, little headroom" : "Short-term debts exceed short-term assets",
      tone: current == null ? "neutral" : current >= 1.5 ? "good" : current >= 1 ? "watch" : "risk",
    },
    { key: "quick", label: "Quick ratio", value: quick, format: "times", hint: "Like the current ratio, without stock", tone: quick == null ? "neutral" : quick >= 1 ? "good" : quick >= 0.7 ? "watch" : "risk" },
    { key: "workingCapital", label: "Working capital", value: Math.round(wc * 100) / 100, format: "money", hint: "Current assets less current liabilities", tone: wc >= 0 ? "good" : "risk" },
    {
      key: "debtEquity",
      label: "Debt to equity",
      value: debtEquity,
      format: "times",
      hint: debtEquity == null ? "No equity recorded" : debtEquity <= 1 ? "Funded mostly by the owners" : debtEquity <= 2 ? "Fairly geared" : "Highly geared: funded mostly by debt",
      tone: debtEquity == null ? "neutral" : debtEquity < 0 ? "risk" : debtEquity <= 1 ? "good" : debtEquity <= 2 ? "watch" : "risk",
    },
    { key: "gm", label: "Gross margin", value: gm, format: "pct", hint: "Gross profit per R100 of sales", tone: gm == null ? "neutral" : gm >= 30 ? "good" : gm >= 15 ? "watch" : "risk" },
    { key: "nm", label: "Net margin", value: nm, format: "pct", hint: "Net profit per R100 of sales", tone: nm == null ? "neutral" : nm >= 10 ? "good" : nm >= 0 ? "watch" : "risk" },
    {
      key: "conversion",
      label: "Cash conversion",
      value: conversion,
      format: "pct",
      hint: conversion == null ? "Needs a profit to measure" : "Operating cash generated per R100 of profit",
      tone: conversion == null ? "neutral" : conversion >= 80 ? "good" : conversion >= 40 ? "watch" : "risk",
    },
    {
      key: "runway",
      label: "Cash runway",
      value: runway,
      format: "months",
      hint: runway == null ? (burn >= 0 ? "Cash is growing: no burn" : "No cash on hand") : "Months the cash lasts at the current burn rate",
      tone: runway == null ? (burn >= 0 ? "good" : "risk") : runway >= 12 ? "good" : runway >= 6 ? "watch" : "risk",
    },
    {
      key: "debtorDays",
      label: "Debtor days",
      value: debtorDays,
      format: "days",
      hint: "Average days customers take to pay",
      tone: debtorDays == null ? "neutral" : debtorDays <= 30 ? "good" : debtorDays <= 60 ? "watch" : "risk",
    },
    {
      key: "creditorDays",
      label: "Creditor days",
      value: creditorDays,
      format: "days",
      hint: "Average days taken to pay suppliers",
      tone: creditorDays == null ? "neutral" : creditorDays <= 45 ? "good" : creditorDays <= 75 ? "watch" : "risk",
    },
  ];
}
