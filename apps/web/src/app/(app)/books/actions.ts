"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACCOUNT_TYPES, parseAmountToCents, parseDateRange } from "@aah/core";
import { audit } from "@aah/db";
import { autoProcess, codeTransaction, ensureBankAccount, importStatement, settleWithInvoice } from "@/lib/books/bank";
import { chartIndex, postJournal, reverseJournal, syncInvoiceJournal } from "@/lib/books/ledger";
import { blankToNull, fail, parseForm } from "@/lib/forms";
import { requireStaff } from "@/lib/session";

async function clientFor(clientId: string) {
  const session = await requireStaff();
  const client = await session.db.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true, name: true } });
  if (!client) fail("/books", "Client not found.");
  return { ...session, client };
}

const MAX_STATEMENT_BYTES = 4 * 1024 * 1024;

export async function importBankStatement(clientId: string, formData: FormData) {
  const s = await clientFor(clientId);
  const back = `/books/${clientId}/bank`;
  const file = formData.get("statement");
  if (!(file instanceof File) || file.size === 0) fail(back, "Choose a CSV bank statement to import.");
  if (file.size > MAX_STATEMENT_BYTES) fail(back, "That file is larger than 4 MB. Export a shorter date range.");
  if (!/\.(csv|txt)$/i.test(file.name) && !/csv|text/.test(file.type)) fail(back, "Bank statements must be CSV files (most banks offer “Download as CSV”).");

  const accountId = String(formData.get("bankAccountId") ?? "");
  const account = accountId
    ? await s.db.bankAccount.findFirst({ where: { id: accountId, clientId } })
    : await ensureBankAccount(s.db, s.ctx, clientId);
  if (!account) fail(back, "Bank account not found.");

  const summary = await importStatement(s.db, s.ctx, account.id, await file.text());
  await audit(s.ctx, { action: "bank.imported", entityType: "BankAccount", entityId: account.id, clientId, metadata: { file: file.name.slice(0, 120), ...summary } }, s.user.name);
  revalidatePath(back);
  const q = new URLSearchParams(Object.entries(summary).map(([k, v]) => [k, String(v)]));
  redirect(`${back}?imported=1&${q}`);
}

export async function addBankAccount(clientId: string, formData: FormData) {
  const s = await clientFor(clientId);
  const back = `/books/${clientId}/bank`;
  const input = parseForm(
    z.object({
      name: z.string().trim().min(2).max(100),
      bankName: z.preprocess(blankToNull, z.string().max(100).nullable()),
      accountLast4: z.preprocess(blankToNull, z.string().regex(/^\d{4}$/, "Last 4 digits only").nullable()),
    }),
    formData,
    back,
  );
  const chart = await chartIndex(s.db, s.ctx, clientId);
  const bankCodes = [...chart.byCode.values()].filter((a) => a.type === "BANK").map((a) => Number(a.code)).filter(Number.isFinite);
  let code = Math.max(7000, ...bankCodes) + 10;
  while (chart.byCode.has(String(code))) code += 10;
  const ledger = await s.db.ledgerAccount.create({
    data: { practiceId: s.ctx.practiceId, clientId, code: String(code), name: `Bank: ${input.name}`, type: "BANK" },
  });
  await s.db.bankAccount.create({ data: { practiceId: s.ctx.practiceId, clientId, name: input.name, bankName: input.bankName, accountLast4: input.accountLast4, ledgerAccountId: ledger.id } });
  revalidatePath(back);
  redirect(back);
}

export async function codeBankLine(clientId: string, txnId: string, formData: FormData) {
  const s = await clientFor(clientId);
  const back = `/books/${clientId}/bank`;
  const input = parseForm(
    z.object({
      accountCode: z.string().min(1, "Choose an account."),
      vatInclusive: z.preprocess((v) => v === "on", z.boolean()),
      remember: z.enum(["no", "client", "practice"]).default("no"),
      ruleText: z.preprocess(blankToNull, z.string().max(100).nullable()),
    }),
    formData,
    back,
  );
  const txn = await s.db.bankTransaction.findFirst({ where: { id: txnId, clientId }, select: { amountCents: true } });
  if (!txn) fail(back, "Bank line not found.");

  let ruleId: string | null = null;
  if (input.remember !== "no" && input.ruleText) {
    const rule = await s.db.bankRule.create({
      data: {
        practiceId: s.ctx.practiceId,
        clientId: input.remember === "client" ? clientId : null,
        matchText: input.ruleText.toLowerCase(),
        direction: txn.amountCents < 0n ? "OUT" : "IN",
        accountCode: input.accountCode,
        vatInclusive: input.vatInclusive,
      },
    });
    ruleId = rule.id;
    await audit(s.ctx, { action: "bank_rule.created", entityType: "BankRule", entityId: rule.id, clientId, metadata: { text: rule.matchText, account: rule.accountCode } }, s.user.name);
  }
  const ok = await codeTransaction(s.db, s.ctx, txnId, { accountCode: input.accountCode, vatInclusive: input.vatInclusive, ruleId });
  if (!ok) fail(back, "That line was already dealt with, or the account doesn't exist.");
  await audit(s.ctx, { action: "bank.coded", entityType: "BankTransaction", entityId: txnId, clientId, metadata: { account: input.accountCode } }, s.user.name);
  // A new rule may code other waiting lines too.
  if (ruleId) await autoProcess(s.db, s.ctx, clientId);
  revalidatePath(back);
}

export async function matchBankLine(clientId: string, txnId: string, formData: FormData) {
  const s = await clientFor(clientId);
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const ok = invoiceId && (await settleWithInvoice(s.db, s.ctx, txnId, invoiceId, "matched by staff"));
  if (!ok) fail(`/books/${clientId}/bank`, "Could not match that line.");
  await audit(s.ctx, { action: "bank.matched", entityType: "BankTransaction", entityId: txnId, clientId, metadata: { invoiceId } }, s.user.name);
  revalidatePath(`/books/${clientId}/bank`);
}

export async function ignoreBankLine(clientId: string, txnId: string) {
  const s = await clientFor(clientId);
  await s.db.bankTransaction.updateMany({ where: { id: txnId, clientId, status: "UNMATCHED" }, data: { status: "IGNORED" } });
  revalidatePath(`/books/${clientId}/bank`);
}

/** Put a coded/matched line back to "to code": reverses its journal (and payment). */
export async function undoBankLine(clientId: string, txnId: string) {
  const s = await clientFor(clientId);
  const txn = await s.db.bankTransaction.findFirst({ where: { id: txnId, clientId } });
  if (!txn) return;
  if (txn.journalEntryId) await reverseJournal(s.db, s.ctx, txn.journalEntryId, "bank line undone");
  if (txn.status === "MATCHED" && txn.invoiceId) {
    const amount = txn.amountCents < 0n ? -txn.amountCents : txn.amountCents;
    await s.db.invoice.updateMany({ where: { id: txn.invoiceId }, data: { amountPaidCents: { decrement: amount } } });
  }
  await s.db.bankTransaction.updateMany({
    where: { id: txnId },
    data: { status: "UNMATCHED", accountCode: null, invoiceId: null, journalEntryId: null, ruleId: null, matchReason: null },
  });
  revalidatePath(`/books/${clientId}/bank`);
}

export async function runAutoCoding(clientId: string) {
  const s = await clientFor(clientId);
  const r = await autoProcess(s.db, s.ctx, clientId);
  revalidatePath(`/books/${clientId}/bank`);
  redirect(`/books/${clientId}/bank?auto=1&matched=${r.matched}&coded=${r.coded}&left=${r.left}`);
}

export async function addLedgerAccount(clientId: string, formData: FormData) {
  const s = await clientFor(clientId);
  const back = `/books/${clientId}/accounts`;
  const input = parseForm(
    z.object({ code: z.string().trim().regex(/^\d{3,6}$/, "Use a 3 to 6 digit code"), name: z.string().trim().min(2).max(120), type: z.enum(ACCOUNT_TYPES) }),
    formData,
    back,
  );
  await chartIndex(s.db, s.ctx, clientId);
  try {
    const a = await s.db.ledgerAccount.create({ data: { practiceId: s.ctx.practiceId, clientId, ...input } });
    await audit(s.ctx, { action: "ledger_account.created", entityType: "LedgerAccount", entityId: a.id, clientId, metadata: { code: a.code } }, s.user.name);
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002") fail(back, `Account code ${input.code} already exists.`);
    throw e;
  }
  revalidatePath(back);
  redirect(back);
}

const journalSchema = z.object({
  date: z.string().min(1),
  description: z.string().trim().min(2).max(300),
  reference: z.preprocess(blankToNull, z.string().max(80).nullable()),
  lines: z.string().min(2),
});

export async function postManualJournal(clientId: string, formData: FormData) {
  const s = await clientFor(clientId);
  const back = `/books/${clientId}/journals`;
  const input = parseForm(journalSchema, formData, back);
  const date = parseDateRange(input.date);
  if (!date) fail(back, "Enter the journal date.");
  const raw = z.array(z.object({ accountCode: z.string(), debit: z.string(), credit: z.string(), description: z.string().optional() })).safeParse(JSON.parse(input.lines));
  if (!raw.success) fail(back, "The journal lines couldn't be read.");
  const chart = await chartIndex(s.db, s.ctx, clientId);
  const lines = [];
  for (const l of raw.data) {
    if (!l.accountCode && !l.debit && !l.credit) continue;
    const acc = chart.byCode.get(l.accountCode);
    if (!acc) fail(back, `Account ${l.accountCode || "(blank)"} not found.`);
    const debitCents = l.debit ? parseAmountToCents(l.debit) : 0n;
    const creditCents = l.credit ? parseAmountToCents(l.credit) : 0n;
    if (debitCents === null || creditCents === null) fail(back, "An amount isn't valid.");
    lines.push({ accountId: acc.id, debitCents, creditCents, description: l.description || undefined });
  }
  let entry;
  try {
    entry = await postJournal(s.db, s.ctx, { clientId, date: date.from, description: input.description, reference: input.reference, source: "MANUAL", lines });
  } catch (e) {
    fail(back, e instanceof Error ? e.message : "Journal could not be posted.");
  }
  await audit(s.ctx, { action: "journal.posted", entityType: "JournalEntry", entityId: entry.id, clientId, reason: input.description }, s.user.name);
  revalidatePath(back);
  redirect(`${back}?posted=1`);
}

export async function reverseJournalEntry(clientId: string, entryId: string, formData: FormData) {
  const s = await clientFor(clientId);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || "reversed by staff";
  const entry = await s.db.journalEntry.findFirst({ where: { id: entryId, clientId }, select: { source: true } });
  if (!entry) fail(`/books/${clientId}/journals`, "Journal not found.");
  if (entry.source !== "MANUAL" && entry.source !== "OPENING") {
    fail(`/books/${clientId}/journals`, "Invoice and bank journals are reversed from the invoice or bank line instead.");
  }
  const rev = await reverseJournal(s.db, s.ctx, entryId, reason);
  if (rev) await audit(s.ctx, { action: "journal.reversed", entityType: "JournalEntry", entityId: entryId, clientId, reason }, s.user.name);
  revalidatePath(`/books/${clientId}/journals`);
}

/** Post journals for invoices that were filed before the books existed (or failed to post). */
export async function postMissingInvoices(clientId: string) {
  const s = await clientFor(clientId);
  const missing = await s.db.invoice.findMany({
    where: { clientId, deletedAt: null, journalEntryId: null, status: { not: "REJECTED" } },
    select: { id: true },
    take: 500,
  });
  let posted = 0;
  for (const inv of missing) {
    await syncInvoiceJournal(s.db, s.ctx, inv.id);
    posted++;
  }
  if (posted) await audit(s.ctx, { action: "journal.posted", entityType: "Client", entityId: clientId, clientId, reason: `Posted ${posted} earlier invoices to the books` }, s.user.name);
  revalidatePath(`/books/${clientId}`);
  redirect(`/books/${clientId}?backfilled=${posted}`);
}
