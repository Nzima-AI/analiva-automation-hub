import "server-only";
import {
  applyBankRules,
  matchBankLineToInvoice,
  parseBankStatement,
  postBankLine,
  postSettlement,
  suggestAccountCode,
  type TenantContext,
} from "@aah/core";
import type { TenantDb } from "@aah/db";
import { chartIndex, postJournal, requireKey } from "./ledger";

export interface ImportSummary {
  imported: number;
  duplicates: number;
  skipped: number;
  matched: number;
  coded: number;
  left: number;
}

/** The client's default bank account, created (linked to ledger 7000) on first use. */
export async function ensureBankAccount(db: TenantDb, ctx: TenantContext, clientId: string, name = "Current account") {
  const existing = await db.bankAccount.findFirst({ where: { clientId }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  const chart = await chartIndex(db, ctx, clientId);
  return db.bankAccount.create({
    data: { practiceId: ctx.practiceId, clientId, name, ledgerAccountId: requireKey(chart, "BANK_DEFAULT") },
  });
}

export async function importStatement(db: TenantDb, ctx: TenantContext, bankAccountId: string, csv: string): Promise<ImportSummary> {
  const account = await db.bankAccount.findFirst({ where: { id: bankAccountId } });
  if (!account) throw new Error("Bank account not found");
  const parsed = parseBankStatement(csv, account.id);
  const batch = new Date().toISOString();
  const before = await db.bankTransaction.count({ where: { bankAccountId } });
  await db.bankTransaction.createMany({
    data: parsed.lines.map((l) => ({
      practiceId: ctx.practiceId,
      clientId: account.clientId,
      bankAccountId,
      date: l.date,
      description: l.description.slice(0, 500),
      amountCents: l.amountCents,
      balanceCents: l.balanceCents,
      fingerprint: l.fingerprint,
      importBatch: batch,
    })),
    skipDuplicates: true,
  });
  const after = await db.bankTransaction.count({ where: { bankAccountId } });
  const imported = after - before;
  const auto = await autoProcess(db, ctx, account.clientId, { importBatch: batch });
  return { imported, duplicates: parsed.lines.length - imported, skipped: parsed.skipped, ...auto };
}

/**
 * Settle open invoices first (exact amount + reference/name), then apply rules
 * (client rules, then practice-wide). Anything left waits for a person.
 */
export async function autoProcess(db: TenantDb, ctx: TenantContext, clientId: string, where: { importBatch?: string } = {}) {
  const pending = await db.bankTransaction.findMany({ where: { clientId, status: "UNMATCHED", ...where }, orderBy: { date: "asc" } });
  if (pending.length === 0) return { matched: 0, coded: 0, left: 0 };
  const [openInvoices, rules] = await Promise.all([
    db.invoice.findMany({
      where: { clientId, deletedAt: null, status: { not: "REJECTED" }, journalEntryId: { not: null } },
      include: { supplier: { select: { name: true } } },
    }),
    db.bankRule.findMany({ where: { OR: [{ clientId }, { clientId: null }] }, orderBy: { createdAt: "asc" } }),
  ]);
  const open = openInvoices
    .map((i) => ({ id: i.id, direction: i.direction, invoiceNumber: i.invoiceNumber, supplierName: i.supplier?.name ?? null, outstandingCents: i.totalCents - i.amountPaidCents, issueDate: i.issueDate }))
    .filter((i) => i.outstandingCents > 0n);
  // Client rules beat practice-wide ones with the same text.
  const clientRules = rules.filter((r) => r.clientId);
  const practiceRules = rules.filter((r) => !r.clientId);

  let matched = 0;
  let coded = 0;
  for (const txn of pending) {
    const m = matchBankLineToInvoice(txn, open);
    if (m) {
      await settleWithInvoice(db, ctx, txn.id, m.invoiceId, m.reason);
      const inv = open.find((o) => o.id === m.invoiceId)!;
      inv.outstandingCents -= txn.amountCents < 0n ? -txn.amountCents : txn.amountCents;
      matched++;
      continue;
    }
    const rule = applyBankRules(txn, clientRules) ?? applyBankRules(txn, practiceRules);
    if (rule) {
      const ok = await codeTransaction(db, ctx, txn.id, { accountCode: rule.accountCode, vatInclusive: rule.vatInclusive, ruleId: rule.id });
      if (ok) {
        coded++;
        await db.bankRule.updateMany({ where: { id: rule.id }, data: { timesApplied: { increment: 1 } } });
      }
    }
  }
  return { matched, coded, left: pending.length - matched - coded };
}

export async function settleWithInvoice(db: TenantDb, ctx: TenantContext, txnId: string, invoiceId: string, reason: string): Promise<boolean> {
  const txn = await db.bankTransaction.findFirst({ where: { id: txnId, status: "UNMATCHED" }, include: { bankAccount: true } });
  const inv = await db.invoice.findFirst({ where: { id: invoiceId, deletedAt: null } });
  if (!txn || !inv || txn.clientId !== inv.clientId) return false;
  const chart = await chartIndex(db, ctx, txn.clientId);
  const amount = txn.amountCents < 0n ? -txn.amountCents : txn.amountCents;
  const entry = await postJournal(db, ctx, {
    clientId: txn.clientId,
    date: txn.date,
    description: `${inv.direction === "PAYABLE" ? "Payment" : "Receipt"}: ${inv.invoiceNumber}`,
    reference: inv.invoiceNumber,
    source: "PAYMENT",
    sourceId: txn.id,
    lines: postSettlement(inv.direction, amount, {
      bankAccountId: txn.bankAccount.ledgerAccountId,
      creditorsAccountId: requireKey(chart, "CREDITORS"),
      debtorsAccountId: requireKey(chart, "DEBTORS"),
    }, txn.description),
  });
  await db.bankTransaction.updateMany({ where: { id: txn.id }, data: { status: "MATCHED", invoiceId: inv.id, journalEntryId: entry.id, matchReason: reason } });
  await db.invoice.updateMany({ where: { id: inv.id }, data: { amountPaidCents: { increment: amount } } });
  return true;
}

export async function codeTransaction(
  db: TenantDb,
  ctx: TenantContext,
  txnId: string,
  c: { accountCode: string; vatInclusive: boolean; ruleId?: string | null },
): Promise<boolean> {
  const txn = await db.bankTransaction.findFirst({ where: { id: txnId, status: "UNMATCHED" }, include: { bankAccount: true, client: { select: { vatRegistered: true } } } });
  if (!txn) return false;
  const chart = await chartIndex(db, ctx, txn.clientId);
  const target = chart.byCode.get(c.accountCode);
  if (!target) return false;
  const entry = await postJournal(db, ctx, {
    clientId: txn.clientId,
    date: txn.date,
    description: txn.description,
    source: "BANK",
    sourceId: txn.id,
    lines: postBankLine(
      txn.amountCents,
      {
        bankAccountId: txn.bankAccount.ledgerAccountId,
        targetAccountId: target.id,
        vatInputAccountId: requireKey(chart, "VAT_INPUT"),
        vatOutputAccountId: requireKey(chart, "VAT_OUTPUT"),
      },
      { vatInclusive: c.vatInclusive, clientVatRegistered: txn.client.vatRegistered, description: txn.description },
    ),
  });
  await db.bankTransaction.updateMany({
    where: { id: txn.id },
    data: { status: "CODED", accountCode: c.accountCode, vatInclusive: c.vatInclusive, journalEntryId: entry.id, ruleId: c.ruleId ?? null },
  });
  return true;
}

/** A keyword suggestion for an uncoded line, to pre-select in the UI. */
export function suggestForLine(description: string, chart: Array<{ code: string; keywords: string[] }>): string | null {
  return suggestAccountCode(description, chart);
}
