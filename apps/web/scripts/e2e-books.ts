// Live end-to-end check of the books engine. Runs against the DEMO practice only, creates a
// throwaway client and deletes it afterwards. Usage (from apps/web):
//   npx tsx --env-file=../../.env --conditions=react-server --tsconfig tsconfig.json scripts/e2e-books.ts

const { rootDb, tenantDb } = await import("@aah/db");
const { checkInvoice, createInvoice } = await import("../src/lib/invoice-service");
const { importStatement, ensureBankAccount } = await import("../src/lib/books/bank");
const { statementsFor } = await import("../src/lib/books/analytics");
const { syncInvoiceJournal, accountTotals } = await import("../src/lib/books/ledger");
const { trialBalance } = await import("@aah/core");

let f = 0;
const check = (n: string, ok: boolean, x = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
  if (!ok) f++;
};

const root = rootDb();
const practice = await root.practice.findUniqueOrThrow({ where: { slug: "demo" } });
const ctx = { practiceId: practice.id, userId: "system", role: "OWNER" as const, clientId: null };
const db = tenantDb(ctx);
// A fresh throwaway client so the run is repeatable.
const client = await db.client.create({ data: { practiceId: practice.id, code: `E2E-${Date.now()}`, name: "E2E Books Test (Pty) Ltd", vatRegistered: true, vatCategory: "A", financialYearEndMonth: 2, status: "ACTIVE" } });

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const today = new Date(new Date().toISOString().slice(0, 10));
const day = (offset: number) => new Date(today.getTime() - offset * 86_400_000);
const base = { clientId: client.id, sourceDocumentId: null, captureSource: "MANUAL" as const, confidence: null, capturedByUserId: null, description: null, dueDate: null };

// Bill: Vodacom R1 150 incl VAT → should code to telephone (3200) by keyword.
const billIn = { ...base, direction: "PAYABLE" as const, supplierName: "Vodacom", supplierVatNumber: "4910101010", invoiceNumber: "VC-1001", issueDate: day(20), subtotalCents: 100000n, vatCents: 15000n, totalCents: 115000n };
const bill = await createInvoice(db, ctx, billIn, await checkInvoice(db, ctx, billIn));
// Sale: R2 300 incl VAT.
const saleIn = { ...base, direction: "RECEIVABLE" as const, supplierName: "Customer A", supplierVatNumber: null, invoiceNumber: "INV-55", issueDate: day(15), subtotalCents: 200000n, vatCents: 30000n, totalCents: 230000n };
const sale = await createInvoice(db, ctx, saleIn, await checkInvoice(db, ctx, saleIn));

const billRow = await db.invoice.findFirstOrThrow({ where: { id: bill.id } });
check("bill posted to the ledger", !!billRow.journalEntryId);
check("bill coded by supplier keyword", billRow.accountCode === "3200", String(billRow.accountCode));

// Bank statement: pays the bill, receives the sale, bank charges, unknown line.
const acc = await ensureBankAccount(db, ctx, client.id);
await db.bankRule.create({ data: { practiceId: practice.id, clientId: client.id, matchText: "monthly fee", direction: "OUT", accountCode: "3020", vatInclusive: true } });
const iso = (x: Date) => x.toISOString().slice(0, 10).split("-").reverse().join("/");
const csv = `Date,Description,Debit,Credit,Balance
${iso(day(10))},EFT VODACOM VC-1001,1150.00,,10000.00
${iso(day(9))},DEPOSIT CUSTOMER A INV-55,,2300.00,12300.00
${iso(day(5))},MONTHLY FEE,115.00,,12185.00
${iso(day(3))},MYSTERY PAYMENT,500.00,,11685.00
`;
const sum = await importStatement(db, ctx, acc.id, csv);
check("imported 4 lines", sum.imported === 4, JSON.stringify(sum));
check("2 matched to invoices", sum.matched === 2);
check("1 coded by rule", sum.coded === 1);
check("1 left to code", sum.left === 1);
const again = await importStatement(db, ctx, acc.id, csv);
check("re-import is de-duplicated", again.imported === 0 && again.duplicates === 4, JSON.stringify(again));

const paidBill = await db.invoice.findFirstOrThrow({ where: { id: bill.id } });
check("bill marked paid", paidBill.amountPaidCents === 115000n);

const tb = trialBalance(await accountTotals(db, client.id));
check("trial balance balances", tb.balanced, `${tb.totalDebitCents} / ${tb.totalCreditCents}`);

const s = await statementsFor(db, client.id, { from: d("2000-01-01"), to: new Date(today.getTime() + 86_400_000), yearEndMonth: 2 });
check("sales R2 000", s.is.totals.salesCents === 200000n, String(s.is.totals.salesCents));
check("expenses R1 100 (1 000 phone + 100 fees)", s.is.totals.expensesCents === 110000n, String(s.is.totals.expensesCents));
check("balance sheet balances", s.bs.balanced);
check("VAT payable 30 000 − 15 000 − 1 500", s.vatPayableCents === 13500n, String(s.vatPayableCents));
check("cash flow ties to the bank", s.cf.reconciles, `${s.cf.netChangeCents} vs ${s.cf.bankMovementCents}`);

// Rejecting the sale reverses its journal.
await db.invoice.updateMany({ where: { id: sale.id }, data: { status: "REJECTED" } });
await syncInvoiceJournal(db, ctx, sale.id);
const s2 = await statementsFor(db, client.id, { from: d("2000-01-01"), to: new Date(today.getTime() + 86_400_000), yearEndMonth: 2 });
check("rejected sale reversed out of sales", s2.is.totals.salesCents === 0n, String(s2.is.totals.salesCents));
check("still balances after reversal", s2.bs.balanced);

// Tenant isolation for the new tables.
const other = tenantDb({ practiceId: "someone-else", userId: "x", role: "OWNER", clientId: null });
check("other practice sees no journals", (await other.journalLine.count({ where: { clientId: client.id } })) === 0);
const clientUser = tenantDb({ practiceId: practice.id, userId: "x", role: "CLIENT", clientId: "another-client" });
check("another client sees no bank lines", (await clientUser.bankTransaction.count()) === 0);

// Clean up the throwaway client (cascades its books).
await root.bankTransaction.deleteMany({ where: { clientId: client.id } });
await root.auditLog.count();
await root.journalLine.deleteMany({ where: { clientId: client.id } });
await root.invoice.updateMany({ where: { clientId: client.id }, data: { journalEntryId: null } });
await root.journalEntry.deleteMany({ where: { clientId: client.id } });
await root.invoice.deleteMany({ where: { clientId: client.id } });
await root.supplier.deleteMany({ where: { clientId: client.id } });
await root.client.delete({ where: { id: client.id } });
console.log(f ? `${f} FAILED` : "ALL PASSED");
await root.$disconnect();
