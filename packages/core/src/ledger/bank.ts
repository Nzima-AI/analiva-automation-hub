import { parseAmountToCents } from "../money";
import { parseDateRange } from "../lookup";
import { normaliseInvoiceNumber } from "../sa-identifiers";

/**
 * Bank statement CSV import. SA banks export different layouts; we detect the
 * header row and columns by name (date, description, amount or debit/credit,
 * balance) so FNB, ABSA, Standard Bank, Nedbank and Capitec exports all work.
 */

export interface BankLine {
  date: Date;
  description: string;
  /** Signed from the bank's view: positive = money in. */
  amountCents: bigint;
  balanceCents: bigint | null;
  /** Stable id for de-duplicating re-imports. */
  fingerprint: string;
}

export interface BankParseResult {
  lines: BankLine[];
  skipped: number;
  columns: { date: number; description: number[]; amount: number | null; debit: number | null; credit: number | null; balance: number | null };
}

/** 64-bit FNV-1a, hex. Pure JS so this module also runs in the browser. */
function fnv1a64(input: string): string {
  let h = 0xcbf29ce484222325n;
  for (const ch of new TextEncoder().encode(input)) {
    h ^= BigInt(ch);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(src);
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 15).join("\n");
  const counts = [",", ";", "\t", "|"].map((d) => [d, sample.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![0];
}

const H = {
  date: /^(transaction\s*)?date$|^posting\s*date$|^value\s*date$|^trans\.?\s*date$/i,
  description: /description|details|narrative|transaction$|particulars|reference|beneficiary/i,
  amount: /^amount(\s*\(zar\))?$|^value$|^transaction\s*amount$/i,
  debit: /^debit(s)?(\s*amount)?$|money\s*out|^withdrawals?$|^paid\s*out$/i,
  credit: /^credit(s)?(\s*amount)?$|money\s*in|^deposits?$|^paid\s*in$/i,
  balance: /balance/i,
};

function parseBankDate(raw: string): Date | null {
  const s = raw.trim();
  // 20240314
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (compact) {
    const r = parseDateRange(`${compact[1]}-${compact[2]}-${compact[3]}`);
    return r ? r.from : null;
  }
  // "14 Mar 2024", "2024/03/14", "14/03/2024" (day first, SA)
  const r = parseDateRange(s.replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, ""));
  return r && r.to.getTime() - r.from.getTime() === 86_400_000 ? r.from : null;
}

function money(raw: string | undefined): bigint | null {
  if (!raw) return null;
  let s = raw.replace(/\s/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/(cr|dr)$/i.test(s)) {
    negative = /dr$/i.test(s);
    s = s.slice(0, -2);
  }
  const c = parseAmountToCents(s);
  if (c === null) return null;
  return negative ? -(c < 0n ? -c : c) : c;
}

export function parseBankStatement(text: string, accountKey: string): BankParseResult {
  const rows = parseCsv(text);
  // Header: the first row in the top 25 with a date column and an amount or debit/credit column.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const r = rows[i]!;
    if (r.some((c) => H.date.test(c)) && (r.some((c) => H.amount.test(c)) || (r.some((c) => H.debit.test(c)) && r.some((c) => H.credit.test(c))))) {
      headerIdx = i;
      break;
    }
  }

  let cols: BankParseResult["columns"];
  let dataRows: string[][];
  if (headerIdx >= 0) {
    const h = rows[headerIdx]!;
    const find = (re: RegExp) => {
      const i = h.findIndex((c) => re.test(c));
      return i >= 0 ? i : null;
    };
    const date = find(H.date)!;
    const amount = find(H.amount);
    const debit = amount === null ? find(H.debit) : null;
    const credit = amount === null ? find(H.credit) : null;
    const balance = find(H.balance);
    const used = new Set([date, amount, debit, credit, balance].filter((x): x is number => x !== null));
    const description = h.map((c, i) => i).filter((i) => !used.has(i) && H.description.test(h[i]!));
    cols = { date, description: description.length ? description : h.map((_, i) => i).filter((i) => !used.has(i)), amount, debit, credit, balance };
    dataRows = rows.slice(headerIdx + 1);
  } else {
    // FNB-style headerless: date, amount, balance, description
    cols = { date: 0, amount: 1, debit: null, credit: null, balance: 2, description: [3] };
    dataRows = rows;
  }

  const lines: BankLine[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  for (const r of dataRows) {
    const date = parseBankDate(r[cols.date] ?? "");
    let amount: bigint | null = null;
    if (cols.amount !== null) amount = money(r[cols.amount]);
    else {
      const dr = money(r[cols.debit!]);
      const cr = money(r[cols.credit!]);
      if (dr !== null || cr !== null) amount = (cr ?? 0n) - (dr === null ? 0n : dr < 0n ? -dr : dr);
    }
    const description = cols.description.map((i) => r[i] ?? "").filter(Boolean).join(" · ").replace(/\s+/g, " ").trim();
    if (!date || amount === null || amount === 0n || !description) {
      skipped++;
      continue;
    }
    const balance = cols.balance !== null ? money(r[cols.balance]) : null;
    // Identical lines on the same day (two R50 airtime buys) get an occurrence number.
    const base = `${accountKey}|${date.toISOString().slice(0, 10)}|${amount}|${description.toLowerCase()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    lines.push({ date, description, amountCents: amount, balanceCents: balance, fingerprint: fnv1a64(`${base}|${n}`) });
  }
  return { lines, skipped, columns: cols };
}

// ------------------------------------------------------------------ matching

export interface OpenInvoice {
  id: string;
  direction: "PAYABLE" | "RECEIVABLE";
  invoiceNumber: string;
  supplierName: string | null;
  outstandingCents: bigint;
  issueDate: Date;
}

/**
 * Find the invoice a bank line settles. Money out settles a supplier bill, money in a
 * sales invoice. Needs the exact outstanding amount plus either the invoice number or
 * the counterparty name in the description, or a single candidate with that amount.
 */
export function matchBankLineToInvoice(line: Pick<BankLine, "amountCents" | "description" | "date">, open: OpenInvoice[]): { invoiceId: string; reason: string } | null {
  const direction = line.amountCents < 0n ? "PAYABLE" : "RECEIVABLE";
  const abs = line.amountCents < 0n ? -line.amountCents : line.amountCents;
  const desc = line.description.toLowerCase();
  const descNorm = normaliseInvoiceNumber(line.description);
  const candidates = open.filter((i) => i.direction === direction && i.outstandingCents === abs && i.issueDate <= line.date);
  if (candidates.length === 0) return null;
  const byNumber = candidates.filter((i) => {
    const n = normaliseInvoiceNumber(i.invoiceNumber);
    return n.length >= 3 && descNorm.includes(n);
  });
  if (byNumber.length === 1) return { invoiceId: byNumber[0]!.id, reason: "amount and invoice number" };
  const byName = candidates.filter((i) => {
    const words = (i.supplierName ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 4 && !["(pty)", "ltd", "limited", "trading"].includes(w));
    return words.length > 0 && words.some((w) => desc.includes(w));
  });
  if (byName.length === 1) return { invoiceId: byName[0]!.id, reason: "amount and name" };
  if (candidates.length === 1) return { invoiceId: candidates[0]!.id, reason: "only invoice with this amount" };
  return null;
}

export interface BankRuleInput {
  id: string;
  matchText: string;
  direction: "IN" | "OUT" | "ANY";
  accountCode: string;
  vatInclusive: boolean;
}

/** First rule whose text appears in the description (longest match wins). */
export function applyBankRules(line: Pick<BankLine, "amountCents" | "description">, rules: BankRuleInput[]): BankRuleInput | null {
  const desc = line.description.toLowerCase();
  const dir = line.amountCents < 0n ? "OUT" : "IN";
  let best: BankRuleInput | null = null;
  for (const r of rules) {
    if (r.direction !== "ANY" && r.direction !== dir) continue;
    const t = r.matchText.trim().toLowerCase();
    if (t && desc.includes(t) && (!best || t.length > best.matchText.length)) best = r;
  }
  return best;
}
