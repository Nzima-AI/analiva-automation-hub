import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { ACCOUNT_TYPE_INFO, centsToDecimalString, natural, trialBalance, type AccountType, type StatementLine } from "@aah/core";
import { audit } from "@aah/db";
import { statementsFor } from "@/lib/books/analytics";
import { accountTotals } from "@/lib/books/ledger";
import { describePeriod, resolvePeriod } from "@/lib/books/periods";
import { requireStaff } from "@/lib/session";

export const maxDuration = 60;

/** Category text Analiva's import wizard recognises for each account type. */
const ANALIVA_CATEGORY: Record<AccountType, string> = {
  SALES: "Sales",
  OTHER_INCOME: "Other Income",
  COST_OF_SALES: "Cost of Sales",
  EXPENSE: "Expenses",
  INCOME_TAX: "Income Tax",
  BANK: "Bank",
  CURRENT_ASSET: "Current Assets",
  FIXED_ASSET: "Non-Current Assets",
  CURRENT_LIABILITY: "Current Liabilities",
  LONG_TERM_LIABILITY: "Non-Current Liabilities",
  EQUITY: "Equity",
};

function csvCell(v: string | null | undefined): string {
  const s = v ?? "";
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

const rands = (c: bigint) => Number(c) / 100;
const MONEY_FMT = '"R" #,##0.00;[Red]-"R" #,##0.00';

export async function GET(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { db, ctx, user } = await requireStaff();
  const { clientId } = await params;
  const client = await db.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true, name: true, code: true, financialYearEndMonth: true } });
  if (!client) return new NextResponse("Not found", { status: 404 });
  const sp = request.nextUrl.searchParams;
  const period = resolvePeriod({ p: sp.get("p") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }, client.financialYearEndMonth);
  const format = sp.get("format") === "analiva" ? "analiva" : "xlsx";
  const stamp = `${client.code}-${period.from.toISOString().slice(0, 10)}-to-${new Date(period.to.getTime() - 86_400_000).toISOString().slice(0, 10)}`;

  const lines = await db.journalLine.findMany({
    where: { clientId, date: { gte: period.from, lt: period.to } },
    orderBy: [{ date: "asc" }, { entryId: "asc" }],
    take: 100_000,
    include: { account: { select: { code: true, name: true, type: true } }, entry: { select: { description: true, reference: true, source: true } } },
  });

  await audit(ctx, { action: "books.exported", entityType: "Client", entityId: clientId, clientId, reason: format === "analiva" ? "Analiva ledger export" : "Excel statements pack", metadata: { lines: lines.length } }, user.name);

  if (format === "analiva") {
    const header = ["Date", "Account", "Account code", "Category", "Description", "Reference", "Debit", "Credit", "Customer / supplier"];
    const rows = lines.map((l) =>
      [
        l.date.toISOString().slice(0, 10),
        l.account.name,
        l.account.code,
        ANALIVA_CATEGORY[l.account.type as AccountType],
        l.description ?? l.entry.description,
        l.entry.reference,
        l.debitCents ? centsToDecimalString(l.debitCents) : "",
        l.creditCents ? centsToDecimalString(l.creditCents) : "",
        "",
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = "﻿" + [header.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="analiva-ledger-${stamp}.csv"`, "Cache-Control": "no-store" },
    });
  }

  const s = await statementsFor(db, clientId, { from: period.from, to: period.to, yearEndMonth: client.financialYearEndMonth });
  const tb = trialBalance(await accountTotals(db, clientId, { to: period.to }));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Analiva Automation Hub";
  wb.created = new Date();

  const sheet = (name: string, title: string) => {
    const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 48 }, { width: 18 }, { width: 18 }, { width: 18 }];
    ws.addRow([client.name]).font = { bold: true, size: 14 };
    ws.addRow([title]).font = { color: { argb: "FF556070" } };
    ws.addRow([describePeriod(period)]).font = { color: { argb: "FF556070" } };
    ws.addRow([]);
    return ws;
  };
  const section = (ws: ExcelJS.Worksheet, title: string, ls: StatementLine[], total: bigint) => {
    ws.addRow([title.toUpperCase()]).font = { bold: true, size: 9, color: { argb: "FF6B7585" } };
    for (const l of ls) {
      const r = ws.addRow([`   ${l.name}`, rands(l.amountCents)]);
      r.getCell(2).numFmt = MONEY_FMT;
    }
    const t = ws.addRow([`Total ${title.toLowerCase()}`, rands(total)]);
    t.font = { bold: true };
    t.getCell(2).numFmt = MONEY_FMT;
    t.getCell(2).border = { top: { style: "thin" } };
  };
  const total = (ws: ExcelJS.Worksheet, label: string, c: bigint) => {
    const r = ws.addRow([label, rands(c)]);
    r.font = { bold: true };
    r.getCell(2).numFmt = MONEY_FMT;
    r.getCell(2).border = { top: { style: "thin" }, bottom: { style: "double" } };
    ws.addRow([]);
  };

  const is = sheet("Income statement", "Income statement");
  section(is, "Sales", s.is.sales, s.is.totals.salesCents);
  section(is, "Cost of sales", s.is.costOfSales, s.is.totals.costOfSalesCents);
  total(is, "Gross profit", s.is.totals.grossProfitCents);
  section(is, "Other income", s.is.otherIncome, s.is.totals.otherIncomeCents);
  section(is, "Operating expenses", s.is.expenses, s.is.totals.expensesCents);
  total(is, "Profit before tax", s.is.totals.profitBeforeTaxCents);
  if (s.is.totals.incomeTaxCents) section(is, "Income tax", s.is.incomeTax, s.is.totals.incomeTaxCents);
  total(is, "Net profit", s.is.totals.netProfitCents);

  const bs = sheet("Balance sheet", `Balance sheet as at ${new Date(period.to.getTime() - 86_400_000).toISOString().slice(0, 10)}`);
  section(bs, "Non-current assets", s.bs.nonCurrentAssets, s.bs.totals.nonCurrentAssetsCents);
  section(bs, "Current assets", [...s.bs.currentAssets, ...s.bs.bank], s.bs.totals.currentAssetsCents + s.bs.totals.bankCents);
  total(bs, "Total assets", s.bs.totals.totalAssetsCents);
  section(
    bs,
    "Equity",
    [
      ...s.bs.equity,
      ...(s.bs.priorYearsProfitCents ? [{ accountId: "p", code: "", name: "Accumulated profit (earlier years)", amountCents: s.bs.priorYearsProfitCents }] : []),
      { accountId: "c", code: "", name: "Profit for the current year", amountCents: s.bs.currentYearProfitCents },
    ],
    s.bs.totals.equityCents,
  );
  section(bs, "Non-current liabilities", s.bs.nonCurrentLiabilities, s.bs.totals.nonCurrentLiabilitiesCents);
  section(bs, "Current liabilities", s.bs.currentLiabilities, s.bs.totals.currentLiabilitiesCents);
  total(bs, "Total equity and liabilities", s.bs.totals.liabilitiesAndEquityCents);

  const cf = sheet("Cash flow", "Cash flow statement (indirect method)");
  const np = cf.addRow(["Net profit", rands(s.cf.netProfitCents)]);
  np.getCell(2).numFmt = MONEY_FMT;
  section(cf, "Working capital changes", s.cf.workingCapital, s.cf.operatingCents - s.cf.netProfitCents);
  total(cf, "Cash from operating activities", s.cf.operatingCents);
  section(cf, "Investing activities", s.cf.investing, s.cf.investingCents);
  section(cf, "Financing activities", s.cf.financing, s.cf.financingCents);
  total(cf, "Net change in cash", s.cf.netChangeCents);

  const ratios = sheet("Ratios", "Financial ratios");
  ratios.addRow(["Ratio", "Value", "Reading"]).font = { bold: true };
  for (const r of s.ratios) ratios.addRow([r.label, r.value ?? "-", r.hint]);
  ratios.getColumn(3).width = 52;

  const tbs = sheet("Trial balance", "Trial balance");
  tbs.addRow(["Account", "Code", "Debit", "Credit"]).font = { bold: true };
  for (const r of tb.rows) {
    const row = tbs.addRow([r.name, r.code, r.balanceDebitCents ? rands(r.balanceDebitCents) : null, r.balanceCreditCents ? rands(r.balanceCreditCents) : null]);
    row.getCell(3).numFmt = MONEY_FMT;
    row.getCell(4).numFmt = MONEY_FMT;
  }
  const tbt = tbs.addRow(["Totals", "", rands(tb.totalDebitCents), rands(tb.totalCreditCents)]);
  tbt.font = { bold: true };
  tbt.getCell(3).numFmt = MONEY_FMT;
  tbt.getCell(4).numFmt = MONEY_FMT;

  const gl = wb.addWorksheet("General ledger", { views: [{ state: "frozen", ySplit: 1 }] });
  gl.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Code", key: "code", width: 8 },
    { header: "Account", key: "account", width: 32 },
    { header: "Type", key: "type", width: 20 },
    { header: "Description", key: "desc", width: 44 },
    { header: "Reference", key: "ref", width: 16 },
    { header: "Debit", key: "dr", width: 14, style: { numFmt: MONEY_FMT } },
    { header: "Credit", key: "cr", width: 14, style: { numFmt: MONEY_FMT } },
    { header: "Net (natural)", key: "net", width: 16, style: { numFmt: MONEY_FMT } },
  ];
  gl.getRow(1).font = { bold: true };
  gl.autoFilter = { from: "A1", to: "I1" };
  for (const l of lines) {
    gl.addRow({
      date: l.date.toISOString().slice(0, 10),
      code: l.account.code,
      account: l.account.name,
      type: ACCOUNT_TYPE_INFO[l.account.type as AccountType].label,
      desc: l.description ?? l.entry.description,
      ref: l.entry.reference ?? "",
      dr: l.debitCents ? rands(l.debitCents) : null,
      cr: l.creditCents ? rands(l.creditCents) : null,
      net: rands(natural({ type: l.account.type as AccountType, debitCents: l.debitCents, creditCents: l.creditCents })),
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="statements-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
