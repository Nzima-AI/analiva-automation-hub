import "server-only";
import {
  assertBalanced,
  postInvoice,
  reverseLines,
  SA_STANDARD_CHART,
  suggestAccountCode,
  type AccountTotal,
  type PostingLine,
  type SystemKey,
  type TenantContext,
} from "@aah/core";
import type { TenantDb } from "@aah/db";

/** Give a client the standard chart of accounts the first time its books are used. */
export async function ensureChart(db: TenantDb, ctx: TenantContext, clientId: string): Promise<void> {
  const count = await db.ledgerAccount.count({ where: { clientId } });
  if (count > 0) return;
  await db.ledgerAccount.createMany({
    data: SA_STANDARD_CHART.map((a) => ({
      practiceId: ctx.practiceId,
      clientId,
      code: a.code,
      name: a.name,
      type: a.type,
      systemKey: a.systemKey ?? null,
      keywords: a.keywords ?? [],
    })),
    skipDuplicates: true,
  });
}

export interface ChartIndex {
  byKey: Map<SystemKey, string>;
  byCode: Map<string, { id: string; code: string; name: string; type: string; keywords: string[] }>;
}

export async function chartIndex(db: TenantDb, ctx: TenantContext, clientId: string): Promise<ChartIndex> {
  await ensureChart(db, ctx, clientId);
  const accounts = await db.ledgerAccount.findMany({ where: { clientId, isActive: true } });
  return {
    byKey: new Map(accounts.filter((a) => a.systemKey).map((a) => [a.systemKey as SystemKey, a.id])),
    byCode: new Map(accounts.map((a) => [a.code, { id: a.id, code: a.code, name: a.name, type: a.type, keywords: a.keywords }])),
  };
}

export function requireKey(chart: ChartIndex, key: SystemKey): string {
  const id = chart.byKey.get(key);
  if (!id) throw new Error(`Chart of accounts has no ${key} account`);
  return id;
}

export async function postJournal(
  db: TenantDb,
  ctx: TenantContext,
  j: {
    clientId: string;
    date: Date;
    description: string;
    reference?: string | null;
    source: "INVOICE" | "PAYMENT" | "BANK" | "MANUAL" | "OPENING" | "REVERSAL";
    sourceId?: string | null;
    reversesId?: string | null;
    lines: PostingLine[];
  },
) {
  const lines = assertBalanced(j.lines);
  const entry = await db.journalEntry.create({
    data: {
      practiceId: ctx.practiceId,
      clientId: j.clientId,
      date: j.date,
      description: j.description.slice(0, 500),
      reference: j.reference ?? null,
      source: j.source,
      sourceId: j.sourceId ?? null,
      reversesId: j.reversesId ?? null,
      postedByUserId: ctx.userId === "system" ? null : ctx.userId,
    },
  });
  await db.journalLine.createMany({
    data: lines.map((l) => ({
      practiceId: ctx.practiceId,
      clientId: j.clientId,
      entryId: entry.id,
      accountId: l.accountId,
      date: j.date,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      description: l.description?.slice(0, 500) ?? null,
    })),
  });
  return entry;
}

/** Cancel a journal with an equal and opposite one dated today (books are never edited). */
export async function reverseJournal(db: TenantDb, ctx: TenantContext, entryId: string, reason: string) {
  const entry = await db.journalEntry.findFirst({ where: { id: entryId }, include: { lines: true, reversedBy: { select: { id: true } } } });
  if (!entry || entry.reversedBy) return null;
  const today = new Date(new Date().toISOString().slice(0, 10));
  return postJournal(db, ctx, {
    clientId: entry.clientId,
    date: entry.date > today ? entry.date : today,
    description: `Reversal: ${entry.description} (${reason})`,
    reference: entry.reference,
    source: "REVERSAL",
    sourceId: entry.id,
    reversesId: entry.id,
    lines: reverseLines(entry.lines.map((l) => ({ accountId: l.accountId, debitCents: l.debitCents, creditCents: l.creditCents, description: l.description ?? undefined }))),
  });
}

/**
 * Which account an invoice goes to: explicit code, else the supplier's learned
 * account, else a keyword suggestion from the chart, else general expenses / sales.
 */
export function chooseInvoiceAccount(
  chart: ChartIndex,
  inv: { direction: "PAYABLE" | "RECEIVABLE"; accountCode: string | null; supplierName: string | null; supplierDefault: string | null },
): string {
  for (const code of [inv.accountCode, inv.supplierDefault]) {
    if (code && chart.byCode.has(code)) return code;
  }
  if (inv.direction === "PAYABLE" && inv.supplierName) {
    const suggested = suggestAccountCode(
      inv.supplierName,
      [...chart.byCode.values()].map((a) => ({ code: a.code, keywords: a.keywords })),
    );
    if (suggested) return suggested;
  }
  const fallback = inv.direction === "PAYABLE" ? "EXPENSE_DEFAULT" : "SALES_DEFAULT";
  const id = requireKey(chart, fallback);
  return [...chart.byCode.values()].find((a) => a.id === id)!.code;
}

/** Post (or re-post) the journal for an invoice. Rejected or deleted invoices get reversed instead. */
export async function syncInvoiceJournal(db: TenantDb, ctx: TenantContext, invoiceId: string): Promise<void> {
  const inv = await db.invoice.findFirst({
    where: { id: invoiceId },
    include: { supplier: { select: { name: true, defaultAccountCode: true } }, client: { select: { vatRegistered: true } } },
  });
  if (!inv) return;
  const shouldPost = !inv.deletedAt && inv.status !== "REJECTED";

  if (inv.journalEntryId) {
    // Already posted: reverse if it should no longer count.
    if (!shouldPost) {
      await reverseJournal(db, ctx, inv.journalEntryId, inv.deletedAt ? "invoice removed" : "invoice rejected");
      await db.invoice.updateMany({ where: { id: inv.id }, data: { journalEntryId: null } });
    }
    return;
  }
  if (!shouldPost) return;

  const chart = await chartIndex(db, ctx, inv.clientId);
  const code = chooseInvoiceAccount(chart, {
    direction: inv.direction,
    accountCode: inv.accountCode,
    supplierName: inv.supplier?.name ?? null,
    supplierDefault: inv.supplier?.defaultAccountCode ?? null,
  });
  const lines = postInvoice(
    {
      direction: inv.direction,
      subtotalCents: inv.subtotalCents,
      vatCents: inv.vatCents,
      totalCents: inv.totalCents,
      clientVatRegistered: inv.client.vatRegistered,
      description: `${inv.supplier?.name ?? "Invoice"} ${inv.invoiceNumber}`,
    },
    {
      mainAccountId: chart.byCode.get(code)!.id,
      creditorsAccountId: requireKey(chart, "CREDITORS"),
      debtorsAccountId: requireKey(chart, "DEBTORS"),
      vatInputAccountId: requireKey(chart, "VAT_INPUT"),
      vatOutputAccountId: requireKey(chart, "VAT_OUTPUT"),
    },
  );
  const entry = await postJournal(db, ctx, {
    clientId: inv.clientId,
    date: inv.issueDate,
    description: `${inv.direction === "PAYABLE" ? "Bill" : "Invoice"} ${inv.invoiceNumber}${inv.supplier ? ` · ${inv.supplier.name}` : ""}`,
    reference: inv.invoiceNumber,
    source: "INVOICE",
    sourceId: inv.id,
    lines,
  });
  await db.invoice.updateMany({ where: { id: inv.id }, data: { journalEntryId: entry.id, accountCode: code } });
}

/** Re-code an invoice to another account: reverse the old journal and post again. */
export async function recodeInvoice(db: TenantDb, ctx: TenantContext, invoiceId: string, accountCode: string): Promise<void> {
  const inv = await db.invoice.findFirst({ where: { id: invoiceId }, select: { id: true, journalEntryId: true, supplierId: true } });
  if (!inv) return;
  if (inv.journalEntryId) await reverseJournal(db, ctx, inv.journalEntryId, "re-coded");
  await db.invoice.updateMany({ where: { id: inv.id }, data: { accountCode, journalEntryId: null } });
  if (inv.supplierId) await db.supplier.updateMany({ where: { id: inv.supplierId }, data: { defaultAccountCode: accountCode } });
  await syncInvoiceJournal(db, ctx, inv.id);
}

/** Debit/credit totals per account for a client between dates (to is exclusive). */
export async function accountTotals(db: TenantDb, clientId: string, range: { from?: Date; to?: Date; types?: string[] } = {}): Promise<AccountTotal[]> {
  const [accounts, grouped] = await Promise.all([
    db.ledgerAccount.findMany({ where: { clientId } }),
    db.journalLine.groupBy({
      by: ["accountId"],
      where: {
        clientId,
        ...(range.from || range.to ? { date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) } } : {}),
      },
      _sum: { debitCents: true, creditCents: true },
    }),
  ]);
  const sums = new Map(grouped.map((g) => [g.accountId, g._sum]));
  return accounts
    .filter((a) => !range.types || range.types.includes(a.type))
    .map((a) => ({
      accountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debitCents: sums.get(a.id)?.debitCents ?? 0n,
      creditCents: sums.get(a.id)?.creditCents ?? 0n,
    }));
}

/** First day of the financial year containing `date` (UTC dates). */
export function financialYearStart(date: Date, yearEndMonth: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const startMonth0 = yearEndMonth % 12; // month after year end, 0-based
  const startYear = m > yearEndMonth ? y : y - 1;
  return new Date(Date.UTC(yearEndMonth === 12 ? startYear + 1 : startYear, startMonth0, 1));
}
