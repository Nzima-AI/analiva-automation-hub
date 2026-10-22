import { describe, expect, it } from "vitest";
import { applyBankRules, matchBankLineToInvoice, parseBankStatement } from "./bank";
import { SA_STANDARD_CHART, suggestAccountCode } from "./chart";
import { deadlinesBetween, lastBusinessDay, vatPeriodRange } from "./compliance";
import { assertBalanced, postBankLine, postInvoice, postSettlement, reverseLines, UnbalancedJournalError, type PostingLine } from "./posting";
import { balanceSheet, cashFlow, incomeStatement, ratios, trialBalance, type AccountTotal } from "./statements";

const ACC = { mainAccountId: "exp", creditorsAccountId: "cred", debtorsAccountId: "debt", vatInputAccountId: "vin", vatOutputAccountId: "vout" };

describe("posting", () => {
  it("posts a supplier bill with input VAT", () => {
    const lines = postInvoice({ direction: "PAYABLE", subtotalCents: 100000n, vatCents: 15000n, totalCents: 115000n, clientVatRegistered: true, description: "Bill" }, ACC);
    expect(lines.map((l) => [l.accountId, l.debitCents, l.creditCents])).toEqual([
      ["exp", 100000n, 0n],
      ["vin", 15000n, 0n],
      ["cred", 0n, 115000n],
    ]);
  });

  it("puts VAT into the cost when the client isn't VAT registered", () => {
    const lines = postInvoice({ direction: "PAYABLE", subtotalCents: 100000n, vatCents: 15000n, totalCents: 115000n, clientVatRegistered: false, description: "Bill" }, ACC);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountId: "exp", debitCents: 115000n });
  });

  it("posts a sales invoice with output VAT", () => {
    const lines = postInvoice({ direction: "RECEIVABLE", subtotalCents: 20000n, vatCents: 3000n, totalCents: 23000n, clientVatRegistered: true, description: "Sale" }, { ...ACC, mainAccountId: "sales" });
    expect(lines.map((l) => [l.accountId, l.debitCents, l.creditCents])).toEqual([
      ["debt", 23000n, 0n],
      ["sales", 0n, 20000n],
      ["vout", 0n, 3000n],
    ]);
  });

  it("settles bills and receipts through the bank", () => {
    expect(postSettlement("PAYABLE", 500n, { bankAccountId: "bank", creditorsAccountId: "cred", debtorsAccountId: "debt" }, "Pay")).toEqual([
      { accountId: "cred", debitCents: 500n, creditCents: 0n, description: "Pay" },
      { accountId: "bank", debitCents: 0n, creditCents: 500n, description: "Pay" },
    ]);
  });

  it("splits VAT out of a coded bank line", () => {
    const lines = postBankLine(-11500n, { bankAccountId: "bank", targetAccountId: "fuel", vatInputAccountId: "vin", vatOutputAccountId: "vout" }, { vatInclusive: true, clientVatRegistered: true, description: "Engen" });
    expect(lines.map((l) => [l.accountId, l.debitCents, l.creditCents])).toEqual([
      ["fuel", 10000n, 0n],
      ["vin", 1500n, 0n],
      ["bank", 0n, 11500n],
    ]);
    const income = postBankLine(5000n, { bankAccountId: "bank", targetAccountId: "int", vatInputAccountId: "vin", vatOutputAccountId: "vout" }, { vatInclusive: false, clientVatRegistered: true, description: "Interest" });
    expect(income.map((l) => [l.accountId, l.debitCents, l.creditCents])).toEqual([
      ["bank", 5000n, 0n],
      ["int", 0n, 5000n],
    ]);
  });

  it("rejects unbalanced or malformed journals", () => {
    const bad: PostingLine[] = [
      { accountId: "a", debitCents: 100n, creditCents: 0n },
      { accountId: "b", debitCents: 0n, creditCents: 90n },
    ];
    expect(() => assertBalanced(bad)).toThrow(UnbalancedJournalError);
    expect(() => assertBalanced([{ accountId: "a", debitCents: -1n, creditCents: 0n }, { accountId: "b", debitCents: 0n, creditCents: -1n }])).toThrow();
  });

  it("reverses", () => {
    expect(reverseLines([{ accountId: "a", debitCents: 5n, creditCents: 0n }])).toEqual([{ accountId: "a", debitCents: 0n, creditCents: 5n }]);
  });
});

const row = (accountId: string, code: string, type: AccountTotal["type"], debitCents: bigint, creditCents: bigint): AccountTotal => ({ accountId, code, name: accountId, type, debitCents, creditCents });

describe("statements", () => {
  it("trial balance balances", () => {
    // Capital in, a sale, a bill paid, equipment bought.
    const rows: AccountTotal[] = [
      row("bank", "7000", "BANK", 73000n, 61500n), // capital 50,000 + sale 23,000 − bill 11,500 − equipment 50,000
      row("capital", "9000", "EQUITY", 0n, 50000n),
      row("sales", "1000", "SALES", 0n, 20000n),
      row("vout", "8100", "CURRENT_LIABILITY", 0n, 3000n),
      row("exp", "3200", "EXPENSE", 10000n, 0n),
      row("vin", "6300", "CURRENT_ASSET", 1500n, 0n),
      row("cred", "8000", "CURRENT_LIABILITY", 11500n, 11500n),
      row("equip", "5000", "FIXED_ASSET", 50000n, 0n),
    ];
    const tb = trialBalance(rows);
    expect(tb.balanced).toBe(true);
    expect(tb.rows.find((r) => r.accountId === "cred")).toBeUndefined(); // settled to zero

    const is = incomeStatement(rows);
    expect(is.totals.grossProfitCents).toBe(20000n);
    expect(is.totals.netProfitCents).toBe(10000n);
    expect(is.netMarginPct).toBe(50);

    const bs = balanceSheet(rows, rows);
    expect(bs.totals.bankCents).toBe(11500n);
    expect(bs.totals.totalAssetsCents).toBe(11500n + 1500n + 50000n);
    expect(bs.totals.equityCents).toBe(60000n);
    expect(bs.currentYearProfitCents).toBe(10000n);
    expect(bs.balanced).toBe(true);

    const cf = cashFlow(rows);
    expect(cf.netProfitCents).toBe(10000n);
    expect(cf.investingCents).toBe(-50000n);
    expect(cf.financingCents).toBe(50000n);
    expect(cf.bankMovementCents).toBe(11500n);
    expect(cf.reconciles).toBe(true);

    const r = ratios({ bs, is, operatingCashCents: cf.operatingCents, monthlyNetCashCents: 1000n, inventoryCents: 0n, debtorsCents: 0n, creditorsCents: 0n, periodDays: 365 });
    expect(r.find((x) => x.key === "current")?.value).toBe(4.33); // 13,000 / 3,000
    expect(r.find((x) => x.key === "runway")?.tone).toBe("good");
  });

  it("splits profit between this year and earlier years", () => {
    const all = [row("sales", "1000", "SALES", 0n, 30000n), row("bank", "7000", "BANK", 30000n, 0n)];
    const thisYear = [row("sales", "1000", "SALES", 0n, 10000n)];
    const bs = balanceSheet(all, thisYear);
    expect(bs.currentYearProfitCents).toBe(10000n);
    expect(bs.priorYearsProfitCents).toBe(20000n);
    expect(bs.balanced).toBe(true);
  });

});

describe("chart", () => {
  it("has the system accounts the engine needs, once each", () => {
    for (const key of ["BANK_DEFAULT", "DEBTORS", "CREDITORS", "VAT_INPUT", "VAT_OUTPUT", "RETAINED_EARNINGS", "SUSPENSE", "SALES_DEFAULT", "EXPENSE_DEFAULT"]) {
      expect(SA_STANDARD_CHART.filter((a) => a.systemKey === key)).toHaveLength(1);
    }
    expect(new Set(SA_STANDARD_CHART.map((a) => a.code)).size).toBe(SA_STANDARD_CHART.length);
  });
  it("suggests accounts from supplier names", () => {
    expect(suggestAccountCode("ENGEN QUICKSHOP JHB")).toBe("3090");
    expect(suggestAccountCode("Vodacom Service Provider")).toBe("3200");
    expect(suggestAccountCode("Something unknown")).toBeNull();
  });
});

describe("compliance", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  it("VAT category A periods end in even months, due last business day of the next month", () => {
    const due = deadlinesBetween(
      { vatRegistered: true, vatCategory: "A", payeRegistered: false, financialYearEndMonth: 2, isCompany: false, incorporationDate: null },
      d("2026-09-01"),
      d("2026-12-01"),
    ).filter((x) => x.type === "VAT201");
    expect(due.map((x) => [x.periodLabel, x.dueDate.toISOString().slice(0, 10)])).toEqual([
      ["Jul-Aug 2026", "2026-09-30"],
      ["Sep-Oct 2026", "2026-11-30"],
    ]);
  });

  it("EMP201 on the 7th (earlier if a weekend), provisional tax for a Feb year-end", () => {
    const due = deadlinesBetween(
      { vatRegistered: false, vatCategory: null, payeRegistered: true, financialYearEndMonth: 2, isCompany: true, incorporationDate: d("2019-03-10") },
      d("2026-08-01"),
      d("2026-09-01"),
    );
    const emp = due.find((x) => x.type === "EMP201")!;
    expect(emp.dueDate.toISOString().slice(0, 10)).toBe("2026-08-07");
    const irp6 = due.find((x) => x.type === "IRP6_1")!;
    expect(irp6.dueDate.toISOString().slice(0, 10)).toBe("2026-08-31");
    expect(irp6.periodLabel).toBe("FY ending Feb 2027");
  });

  it("CIPC annual return 30 business days after the anniversary", () => {
    const due = deadlinesBetween(
      { vatRegistered: false, vatCategory: null, payeRegistered: false, financialYearEndMonth: 2, isCompany: true, incorporationDate: d("2019-03-10") },
      d("2026-01-01"),
      d("2027-01-01"),
    ).filter((x) => x.type === "CIPC_AR");
    expect(due).toHaveLength(1);
    expect(due[0]!.dueDate.toISOString().slice(0, 10)).toBe("2026-04-21");
  });

  it("helpers", () => {
    expect(lastBusinessDay(2026, 4).toISOString().slice(0, 10)).toBe("2026-05-29"); // 31 May 2026 is a Sunday
    expect(vatPeriodRange("A", "2026-08")).toEqual({ from: d("2026-07-01"), to: d("2026-09-01") });
  });
});

describe("bank statements", () => {
  it("reads a debit/credit export with a preamble", () => {
    const csv = `Account,62000000000
Statement,March 2026

Date,Description,Reference,Debit,Credit,Balance
14/03/2026,ENGEN QUICKSHOP,POS 1234,115.00,,1000.00
15/03/2026,Payment from Ubuntu Bakes,INV-0042,,"2,300.00","3,300.00"
15/03/2026,Payment from Ubuntu Bakes,INV-0042,,"2,300.00","5,600.00"
bad row,,,,,
`;
    const r = parseBankStatement(csv, "acc1");
    expect(r.skipped).toBe(1);
    expect(r.lines.map((l) => [l.date.toISOString().slice(0, 10), l.amountCents, l.description])).toEqual([
      ["2026-03-14", -11500n, "ENGEN QUICKSHOP · POS 1234"],
      ["2026-03-15", 230000n, "Payment from Ubuntu Bakes · INV-0042"],
      ["2026-03-15", 230000n, "Payment from Ubuntu Bakes · INV-0042"],
    ]);
    // Same-day duplicates still get distinct fingerprints, but re-imports reproduce them.
    expect(r.lines[1]!.fingerprint).not.toBe(r.lines[2]!.fingerprint);
    expect(parseBankStatement(csv, "acc1").lines[2]!.fingerprint).toBe(r.lines[2]!.fingerprint);
  });

  it("reads a signed-amount export with semicolons", () => {
    const r = parseBankStatement("Transaction Date;Description;Amount;Balance\n2026-03-01;Monthly fee;-65,00;100,00\n", "x");
    expect(r.lines[0]).toMatchObject({ amountCents: -6500n, balanceCents: 10000n });
  });

  it("matches payments to open invoices", () => {
    const open = [
      { id: "i1", direction: "PAYABLE" as const, invoiceNumber: "INV-0042", supplierName: "Cellnet Communications", outstandingCents: 115000n, issueDate: new Date("2026-03-01") },
      { id: "i2", direction: "PAYABLE" as const, invoiceNumber: "A-77", supplierName: "Office Supplies Co", outstandingCents: 115000n, issueDate: new Date("2026-03-02") },
    ];
    const when = new Date("2026-03-20");
    expect(matchBankLineToInvoice({ amountCents: -115000n, description: "EFT CELLNET COMMS", date: when }, open)).toEqual({ invoiceId: "i1", reason: "amount and name" });
    expect(matchBankLineToInvoice({ amountCents: -115000n, description: "Payment ref A77", date: when }, open)).toEqual({ invoiceId: "i2", reason: "amount and invoice number" });
    expect(matchBankLineToInvoice({ amountCents: -115000n, description: "Unknown", date: when }, open)).toBeNull();
    expect(matchBankLineToInvoice({ amountCents: 115000n, description: "CELLNET", date: when }, open)).toBeNull();
  });

  it("applies the most specific rule", () => {
    const rules = [
      { id: "a", matchText: "fee", direction: "OUT" as const, accountCode: "3020", vatInclusive: false },
      { id: "b", matchText: "monthly fee", direction: "OUT" as const, accountCode: "3021", vatInclusive: false },
    ];
    expect(applyBankRules({ amountCents: -100n, description: "MONTHLY FEE MAR" }, rules)?.id).toBe("b");
    expect(applyBankRules({ amountCents: 100n, description: "MONTHLY FEE MAR" }, rules)).toBeNull();
  });
});
