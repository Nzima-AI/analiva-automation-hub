import { parseAmountToCents } from "../money";
import { parseDateRange } from "../lookup";
import { isValidSaVatNumber, normaliseInvoiceNumber } from "../sa-identifiers";

/**
 * Rule-based invoice reading (no AI). Works on the text layer of a PDF or OCR output.
 * Each field carries its own confidence; per-supplier learned labels (from user
 * corrections) are tried first and score higher.
 */

export const INVOICE_FIELDS = ["supplierName", "supplierVatNumber", "invoiceNumber", "issueDate", "dueDate", "subtotal", "vat", "total"] as const;
export type InvoiceField = (typeof INVOICE_FIELDS)[number];

export interface FieldValue<T> {
  value: T;
  confidence: number;
  /** How it was found, for the review screen. */
  source: string;
}

export interface ParsedInvoice {
  supplierName: FieldValue<string> | null;
  supplierVatNumber: FieldValue<string> | null;
  invoiceNumber: FieldValue<string> | null;
  issueDate: FieldValue<Date> | null;
  dueDate: FieldValue<Date> | null;
  subtotalCents: FieldValue<bigint> | null;
  vatCents: FieldValue<bigint> | null;
  totalCents: FieldValue<bigint> | null;
  /** subtotal + VAT = total, within 2 cents */
  arithmeticConsistent: boolean;
  /** 0..1 */
  confidence: number;
  looksLikeInvoice: boolean;
  looksLikeCreditNote: boolean;
}

export interface ParseHints {
  /** Labels learned for this supplier, tried before the built-in ones. */
  labels?: Partial<Record<InvoiceField, string[]>>;
  supplierName?: string | null;
  /** VAT numbers that belong to the recipient (client/practice), never the supplier. */
  excludeVatNumbers?: string[];
  /** Email subject; "Invoice from X" names the supplier. */
  subject?: string | null;
  /** Sender display name or domain, used as a weak supplier-name guess. */
  senderName?: string | null;
}

const LEARNED = 0.95;
const LABELLED = 0.8;
const GUESSED = 0.4;

// With cents ("1 234,50"), or rand-prefixed whole rands ("R14 000"), but not a reference like "R0106/001".
const AMOUNT_RE =
  /-?(?:(?:R|ZAR)?\s?-?(?:\d{1,3}(?:[ , ]\d{3})+|\d+)[.,]\d{2}(?!\d)|(?<![A-Za-z0-9])(?:R|ZAR)\s?(?:\d{1,3}(?:[ , ]\d{3})+|\d+)(?![\d/A-Za-z]|[.,]\d))/i;
const AMOUNT_RE_G = new RegExp(AMOUNT_RE.source, "gi");
const DATE_RE =
  /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+\d{4})\b/i;
const DATE_RE_G = new RegExp(DATE_RE.source, "gi");
const SUPPLIER_IN_SUBJECT = /\bfrom\s+([A-Z][\w&'.,\- ]{2,80}?)\s*$/i;
const VAT_RE_G = /\b4\d{3}[ ]?\d{3}[ ]?\d{3}\b/g;

const LABELS: Record<Exclude<InvoiceField, "supplierName" | "supplierVatNumber">, string[]> = {
  invoiceNumber: [
    "tax invoice number", "tax invoice no", "invoice number", "invoice no", "invoice nr", "invoice #", "inv number", "inv no", "inv #",
    "document number", "document no", "doc no", "invoice ref", "reference number", "reference no",
  ],
  issueDate: ["tax invoice date", "invoice date", "date of invoice", "document date", "date issued", "issue date", "tax point", "date"],
  dueDate: ["payment due date", "due date", "payment due", "pay by", "due"],
  total: [
    "total amount due", "amount due", "balance due", "total due", "amount payable", "total payable", "grand total",
    "invoice total", "total incl vat", "total incl. vat", "total including vat", "total (incl", "total incl", "total amount", "total",
  ],
  vat: ["vat amount", "total vat", "vat @ 15%", "vat 15%", "15% vat", "vat (15%)", "vat", "tax amount", "tax"],
  subtotal: [
    "sub total", "subtotal", "total excl vat", "total excl. vat", "total exclusive", "total excl", "amount excl vat", "excl vat",
    "total before vat", "nett amount", "net amount", "nett",
  ],
};

// Labels that contain a field label but mean something else.
const NOT_TOTAL = /sub\s*-?\s*total|total\s*excl|total\s*vat|vat\s*total|total\s*(?:qty|quantity|items|units|weight|hours|discount)/i;
const NOT_VAT = /vat\s*(?:no|number|reg|registration|#)|tax\s*(?:no|number|invoice|reg)|incl|excl|vat\s*rate/i;
const NOT_DATE_LABEL = /due|order\s*date|delivery\s*date|print/i;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function linesOf(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[\t ]+/g, " ").replace(/ {2,}/g, "  ").trim())
    .filter(Boolean);
}

interface Found {
  raw: string;
  label: string;
  learned: boolean;
}

/**
 * Find the first value matching valueRe that follows one of the labels, on the same
 * line or at the start of the next line. Labels are tried in order.
 */
function findLabelled(lines: string[], labels: string[], valueRe: RegExp, exclude: RegExp | null, learned: string[]): Found | null {
  const ordered = [...learned.map((l) => ({ l, learned: true })), ...labels.map((l) => ({ l, learned: false }))];
  for (const { l, learned: isLearned } of ordered) {
    const labelRe = new RegExp(`(^|[^a-z])${escapeRe(l)}(?![a-z])`, "i");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const m = labelRe.exec(line);
      if (!m) continue;
      if (!isLearned && exclude && exclude.test(line.slice(Math.max(0, m.index - 5), m.index + m[0].length + 12))) continue;
      const after = line.slice(m.index + m[0].length).replace(/^[\s:#.\-–]+/, "");
      const v = valueRe.exec(after);
      if (v && v.index <= 40) return { raw: v[0], label: l, learned: isLearned };
      const next = lines[i + 1];
      if (after.length === 0 && next) {
        const vn = valueRe.exec(next);
        if (vn && vn.index === 0) return { raw: vn[0], label: l, learned: isLearned };
      }
    }
  }
  return null;
}

function toDate(raw: string): Date | null {
  const cleaned = raw
    .replace(/(\d)(st|nd|rd|th)\b/i, "$1")
    .replace(/\s+of\s+/i, " ")
    .replace(/[.,](?=\s)/g, "");
  const range = parseDateRange(cleaned);
  return range && range.to.getTime() - range.from.getTime() === 86_400_000 ? range.from : null;
}

function amountField(f: Found | null): FieldValue<bigint> | null {
  if (!f) return null;
  const cents = parseAmountToCents(f.raw.replace(/\s/g, " "));
  if (cents === null) return null;
  return { value: cents < 0n ? -cents : cents, confidence: f.learned ? LEARNED : LABELLED, source: `after "${f.label}"` };
}

const INVOICE_NO_RE = /[A-Z0-9][A-Z0-9\-/.]{0,30}[A-Z0-9]|[0-9]/i;

function plausibleInvoiceNumber(raw: string): boolean {
  if (!/\d/.test(raw)) return false;
  if (toDate(raw)) return false;
  if (isValidSaVatNumber(raw)) return false;
  return normaliseInvoiceNumber(raw).length >= 2;
}

export function parseInvoiceText(text: string, hints: ParseHints = {}): ParsedInvoice {
  const lines = linesOf(text);
  const lower = text.toLowerCase();
  const learned = hints.labels ?? {};

  // ---- invoice number
  let invoiceNumber: FieldValue<string> | null = null;
  {
    const ordered = [...(learned.invoiceNumber ?? []).map((l) => ({ l, learned: true })), ...LABELS.invoiceNumber.map((l) => ({ l, learned: false }))];
    outer: for (const { l, learned: isLearned } of ordered) {
      const f = findLabelled(lines, [], INVOICE_NO_RE, null, [l]);
      if (f && plausibleInvoiceNumber(f.raw)) {
        invoiceNumber = { value: f.raw.replace(/[.\-/]+$/, ""), confidence: isLearned ? LEARNED : LABELLED, source: `after "${l}"` };
        break outer;
      }
    }
    if (!invoiceNumber) {
      const m = /tax\s*invoice[^\S\n]*\n?[^\S\n]*(?:no|nr|number|#)\.?[^\S\n]*[:#]?[^\S\n]*([A-Z0-9][A-Z0-9\-/]{1,40})/i.exec(text);
      if (m && plausibleInvoiceNumber(m[1]!)) invoiceNumber = { value: m[1]!, confidence: 0.75, source: 'number under "tax invoice"' };
    }
    if (!invoiceNumber) {
      const m = /\b((?:INV|IN|TI|SI)[-/ ]?\d{3,}[A-Z0-9-]*)\b/i.exec(text);
      if (m) invoiceNumber = { value: m[1]!.replace(/\s/g, ""), confidence: GUESSED + 0.1, source: "invoice-style number in text" };
    }
  }

  // ---- dates
  let issueDate: FieldValue<Date> | null = null;
  {
    const f = findLabelled(lines, LABELS.issueDate, DATE_RE, NOT_DATE_LABEL, learned.issueDate ?? []);
    const d = f ? toDate(f.raw) : null;
    if (f && d) issueDate = { value: d, confidence: f.learned ? LEARNED : f.label === "date" ? LABELLED - 0.1 : LABELLED, source: `after "${f.label}"` };
    if (!issueDate) {
      for (const m of text.matchAll(DATE_RE_G)) {
        const dd = toDate(m[0]);
        if (dd) {
          issueDate = { value: dd, confidence: GUESSED, source: "first date in document" };
          break;
        }
      }
    }
  }
  let dueDate: FieldValue<Date> | null = null;
  {
    const f = findLabelled(lines, LABELS.dueDate, DATE_RE, null, learned.dueDate ?? []);
    const d = f ? toDate(f.raw) : null;
    if (f && d) dueDate = { value: d, confidence: f.learned ? LEARNED : LABELLED, source: `after "${f.label}"` };
  }

  // ---- amounts
  let totalCents = amountField(findLabelled(lines, LABELS.total, AMOUNT_RE, NOT_TOTAL, learned.total ?? []));
  let vatCents = amountField(findLabelled(lines, LABELS.vat, AMOUNT_RE, NOT_VAT, learned.vat ?? []));
  let subtotalCents = amountField(findLabelled(lines, LABELS.subtotal, AMOUNT_RE, null, learned.subtotal ?? []));

  if (!totalCents) {
    let max: bigint | null = null;
    for (const m of text.matchAll(AMOUNT_RE_G)) {
      const c = parseAmountToCents(m[0]);
      if (c !== null && (max === null || c > max)) max = c;
    }
    if (max !== null) totalCents = { value: max, confidence: GUESSED, source: "largest amount in document" };
  }

  // "VAT (0%)" / "Tax 0%" / "No VAT": a zero-rated or non-VAT invoice.
  if (!vatCents && /\b(?:vat|tax)\s*\(?\s*0\s*%|\bno\s+vat\b|not\s+(?:a\s+)?vat\s+(?:vendor|registered)/i.test(text)) {
    vatCents = { value: 0n, confidence: LABELLED, source: "invoice shows 0% VAT" };
  }

  // Fill the third amount when two are known; check they agree.
  let arithmeticConsistent = false;
  if (totalCents && vatCents && subtotalCents) {
    const diff = subtotalCents.value + vatCents.value - totalCents.value;
    arithmeticConsistent = diff >= -2n && diff <= 2n;
  } else if (totalCents && vatCents && !subtotalCents && vatCents.value < totalCents.value) {
    subtotalCents = { value: totalCents.value - vatCents.value, confidence: Math.min(totalCents.confidence, vatCents.confidence), source: "total minus VAT" };
    arithmeticConsistent = vatCents.value === 0n || isFifteenPercent(subtotalCents.value, vatCents.value);
  } else if (totalCents && subtotalCents && !vatCents && subtotalCents.value <= totalCents.value) {
    vatCents = { value: totalCents.value - subtotalCents.value, confidence: Math.min(totalCents.confidence, subtotalCents.confidence), source: "total minus subtotal" };
    arithmeticConsistent = vatCents.value === 0n || isFifteenPercent(subtotalCents.value, vatCents.value);
  } else if (!totalCents && vatCents && subtotalCents) {
    totalCents = { value: subtotalCents.value + vatCents.value, confidence: Math.min(vatCents.confidence, subtotalCents.confidence), source: "subtotal plus VAT" };
    arithmeticConsistent = true;
  }

  // ---- supplier VAT number: a valid SA VAT number that isn't the recipient's
  let supplierVatNumber: FieldValue<string> | null = null;
  {
    const exclude = new Set((hints.excludeVatNumbers ?? []).map((v) => v.replace(/\s/g, "")));
    const found = [...new Set([...text.matchAll(VAT_RE_G)].map((m) => m[0].replace(/\s/g, "")))].filter((v) => isValidSaVatNumber(v) && !exclude.has(v));
    if (found.length === 1) supplierVatNumber = { value: found[0]!, confidence: 0.85, source: "only supplier VAT number in document" };
    else if (found.length > 1) supplierVatNumber = { value: found[0]!, confidence: 0.5, source: "first of several VAT numbers" };
  }

  // ---- supplier name
  let supplierName: FieldValue<string> | null = null;
  if (hints.supplierName) supplierName = { value: hints.supplierName, confidence: LEARNED, source: "known supplier" };
  else if (hints.subject && SUPPLIER_IN_SUBJECT.test(hints.subject)) {
    supplierName = { value: SUPPLIER_IN_SUBJECT.exec(hints.subject)![1]!.trim(), confidence: 0.6, source: "email subject" };
  } else if (hints.senderName) supplierName = { value: hints.senderName, confidence: 0.5, source: "email sender" };
  else {
    const first = lines.find((l) => /[a-z]{3}/i.test(l) && !/tax\s*invoice|^invoice$|^page\s/i.test(l));
    if (first) supplierName = { value: first.slice(0, 120), confidence: 0.3, source: "first line of document" };
  }

  const looksLikeCreditNote = /credit\s*note/i.test(lower);
  const looksLikeInvoice = /tax\s*invoice|\binvoice\b|\binv\b/i.test(lower) && !looksLikeCreditNote;

  const c = (f: FieldValue<unknown> | null) => f?.confidence ?? 0;
  let confidence =
    0.3 * c(totalCents) +
    0.2 * c(invoiceNumber) +
    0.15 * c(issueDate) +
    0.15 * Math.max(c(supplierVatNumber), hints.supplierName ? LEARNED : 0) +
    0.2 * (arithmeticConsistent ? 1 : 0);
  if (!looksLikeInvoice) confidence *= 0.7;
  confidence = Math.round(confidence * 100) / 100;

  return { supplierName, supplierVatNumber, invoiceNumber, issueDate, dueDate, subtotalCents, vatCents, totalCents, arithmeticConsistent, confidence, looksLikeInvoice, looksLikeCreditNote };
}

function isFifteenPercent(subtotal: bigint, vat: bigint): boolean {
  const expected = (subtotal * 1500n + 5000n) / 10000n;
  const d = expected - vat;
  return d >= -2n && d <= 2n;
}

/**
 * After a user corrects a field, find the label printed before that value so the
 * supplier's next invoice can be read with it. Returns null if nothing usable.
 */
export function learnLabel(text: string, value: string): string | null {
  const needle = value.trim();
  if (!needle) return null;
  const lines = linesOf(text);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const idx = line.toLowerCase().indexOf(needle.toLowerCase());
    if (idx < 0) continue;
    const before = line.slice(0, idx).replace(/[\s:#.\-–]+$/, "").trim();
    const candidate = before ? before.split(/ {2,}/).pop()!.trim() : (lines[i - 1] ?? "").replace(/[\s:#.\-–]+$/, "").trim();
    if (candidate.length >= 2 && candidate.length <= 40 && /[a-z]/i.test(candidate) && !/\d{3,}/.test(candidate)) {
      return candidate.toLowerCase();
    }
  }
  return null;
}

/** Confidence gate (CLAUDE.md §7). */
export type GateDecision = "AUTO" | "SUGGEST" | "REVIEW";
export function confidenceGate(confidence: number): GateDecision {
  if (confidence >= 0.9) return "AUTO";
  if (confidence >= 0.6) return "SUGGEST";
  return "REVIEW";
}

/**
 * Find how a corrected value is actually printed in the document (e.g. the user typed
 * "1000.00" but the PDF says "R 1 000,00"), so learnLabel can locate it.
 */
export function findPrintedValue(text: string, kind: "amount" | "date" | "text", value: string | bigint | Date): string | null {
  if (kind === "text") return typeof value === "string" && text.toLowerCase().includes(value.toLowerCase()) ? value : null;
  if (kind === "amount") {
    for (const m of text.matchAll(AMOUNT_RE_G)) {
      const c = parseAmountToCents(m[0]);
      if (c !== null && (c === value || -c === value)) return m[0].trim();
    }
    return null;
  }
  const target = (value as Date).toISOString().slice(0, 10);
  for (const m of text.matchAll(DATE_RE_G)) {
    const d = toDate(m[0]);
    if (d && d.toISOString().slice(0, 10) === target) return m[0];
  }
  return null;
}
