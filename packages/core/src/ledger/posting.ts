import { vatFromInclusive } from "../invoice-validation";

/**
 * Turns business events into balanced journal lines. Pure: callers resolve
 * account roles (creditors, VAT input, ...) to account ids first.
 */

export interface PostingLine {
  accountId: string;
  debitCents: bigint;
  creditCents: bigint;
  description?: string;
}

export class UnbalancedJournalError extends Error {
  constructor(debits: bigint, credits: bigint) {
    super(`Journal does not balance: debits ${debits} vs credits ${credits}`);
    this.name = "UnbalancedJournalError";
  }
}

/** Drop zero lines, reject negatives, and check debits equal credits. */
export function assertBalanced(lines: PostingLine[]): PostingLine[] {
  const kept = lines.filter((l) => l.debitCents !== 0n || l.creditCents !== 0n);
  let dr = 0n;
  let cr = 0n;
  for (const l of kept) {
    if (l.debitCents < 0n || l.creditCents < 0n) throw new Error("Journal lines cannot be negative; swap debit and credit instead");
    if (l.debitCents > 0n && l.creditCents > 0n) throw new Error("A line is either a debit or a credit");
    dr += l.debitCents;
    cr += l.creditCents;
  }
  if (dr !== cr) throw new UnbalancedJournalError(dr, cr);
  if (kept.length < 2) throw new Error("A journal needs at least two lines");
  return kept;
}

export interface InvoiceAccounts {
  /** Expense / cost of sales account for a bill, sales account for a sales invoice */
  mainAccountId: string;
  creditorsAccountId: string;
  debtorsAccountId: string;
  vatInputAccountId: string;
  vatOutputAccountId: string;
}

export interface InvoiceForPosting {
  direction: "PAYABLE" | "RECEIVABLE";
  subtotalCents: bigint;
  vatCents: bigint;
  totalCents: bigint;
  /** A client that isn't VAT registered can't claim input VAT: it's part of the cost. */
  clientVatRegistered: boolean;
  description: string;
}

export function postInvoice(inv: InvoiceForPosting, acc: InvoiceAccounts): PostingLine[] {
  const d = inv.description;
  if (inv.direction === "PAYABLE") {
    const claimVat = inv.clientVatRegistered && inv.vatCents > 0n;
    return assertBalanced([
      { accountId: acc.mainAccountId, debitCents: claimVat ? inv.subtotalCents : inv.totalCents, creditCents: 0n, description: d },
      ...(claimVat ? [{ accountId: acc.vatInputAccountId, debitCents: inv.vatCents, creditCents: 0n, description: `VAT: ${d}` }] : []),
      { accountId: acc.creditorsAccountId, debitCents: 0n, creditCents: inv.totalCents, description: d },
    ]);
  }
  const chargeVat = inv.vatCents > 0n;
  return assertBalanced([
    { accountId: acc.debtorsAccountId, debitCents: inv.totalCents, creditCents: 0n, description: d },
    { accountId: acc.mainAccountId, debitCents: 0n, creditCents: chargeVat ? inv.subtotalCents : inv.totalCents, description: d },
    ...(chargeVat ? [{ accountId: acc.vatOutputAccountId, debitCents: 0n, creditCents: inv.vatCents, description: `VAT: ${d}` }] : []),
  ]);
}

/** Paying a supplier bill (or receiving from a customer) through the bank. */
export function postSettlement(
  direction: "PAYABLE" | "RECEIVABLE",
  amountCents: bigint,
  acc: { bankAccountId: string; creditorsAccountId: string; debtorsAccountId: string },
  description: string,
): PostingLine[] {
  return direction === "PAYABLE"
    ? assertBalanced([
        { accountId: acc.creditorsAccountId, debitCents: amountCents, creditCents: 0n, description },
        { accountId: acc.bankAccountId, debitCents: 0n, creditCents: amountCents, description },
      ])
    : assertBalanced([
        { accountId: acc.bankAccountId, debitCents: amountCents, creditCents: 0n, description },
        { accountId: acc.debtorsAccountId, debitCents: 0n, creditCents: amountCents, description },
      ]);
}

/**
 * A bank line coded straight to an account (bank charges, a sale paid in cash, ...).
 * amountCents is signed from the bank's view: positive = money in.
 */
export function postBankLine(
  amountCents: bigint,
  acc: { bankAccountId: string; targetAccountId: string; vatInputAccountId: string; vatOutputAccountId: string },
  opts: { vatInclusive: boolean; clientVatRegistered: boolean; description: string },
): PostingLine[] {
  const abs = amountCents < 0n ? -amountCents : amountCents;
  const vat = opts.vatInclusive && opts.clientVatRegistered ? vatFromInclusive(abs) : 0n;
  const net = abs - vat;
  const d = opts.description;
  if (amountCents < 0n) {
    return assertBalanced([
      { accountId: acc.targetAccountId, debitCents: net, creditCents: 0n, description: d },
      ...(vat > 0n ? [{ accountId: acc.vatInputAccountId, debitCents: vat, creditCents: 0n, description: `VAT: ${d}` }] : []),
      { accountId: acc.bankAccountId, debitCents: 0n, creditCents: abs, description: d },
    ]);
  }
  return assertBalanced([
    { accountId: acc.bankAccountId, debitCents: abs, creditCents: 0n, description: d },
    { accountId: acc.targetAccountId, debitCents: 0n, creditCents: net, description: d },
    ...(vat > 0n ? [{ accountId: acc.vatOutputAccountId, debitCents: 0n, creditCents: vat, description: `VAT: ${d}` }] : []),
  ]);
}

/** Swap debits and credits to cancel an earlier journal. */
export function reverseLines(lines: PostingLine[]): PostingLine[] {
  return lines.map((l) => ({ ...l, debitCents: l.creditCents, creditCents: l.debitCents }));
}
