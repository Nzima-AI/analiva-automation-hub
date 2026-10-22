import { parseAmountToCents } from "./money";
import { normaliseCipcRegistration, normaliseInvoiceNumber, normaliseSaPhone } from "./sa-identifiers";

/**
 * Phone-call lookup: one free-text box. We work out every way the text could be
 * read (name, invoice number, amount, date, phone, registration number) and the
 * search layer queries all of them at once.
 */
export interface DateRange {
  /** Inclusive, UTC midnight. */
  from: Date;
  /** Exclusive, UTC midnight. */
  to: Date;
}

export interface LookupQuery {
  /** Trimmed raw text, used for name/email/text matches. */
  text: string;
  amountCents: bigint | null;
  dateRange: DateRange | null;
  phone: string | null;
  registrationNumber: string | null;
  /** Normalised candidate invoice number (letters and digits only). */
  invoiceNumber: string | null;
  vatNumber: string | null;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

function validDay(y: number, m: number, d: number): boolean {
  const dt = utc(y, m, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d;
}

export function parseDateRange(input: string): DateRange | null {
  const s = input.trim().toLowerCase();

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
    return validDay(y, mo, d) ? { from: utc(y, mo, d), to: utc(y, mo, d + 1) } : null;
  }

  // SA convention: day first
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
    return validDay(y, mo, d) ? { from: utc(y, mo, d), to: utc(y, mo, d + 1) } : null;
  }

  m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) {
    const [y, mo] = [Number(m[1]), Number(m[2]) - 1];
    return mo >= 0 && mo < 12 ? { from: utc(y, mo, 1), to: utc(y, mo + 1, 1) } : null;
  }

  m = s.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (m && m[1]! in MONTHS) {
    const [mo, y] = [MONTHS[m[1]!]!, Number(m[2])];
    return { from: utc(y, mo, 1), to: utc(y, mo + 1, 1) };
  }

  m = s.match(/^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/);
  if (m && m[2]! in MONTHS) {
    const [d, mo, y] = [Number(m[1]), MONTHS[m[2]!]!, Number(m[3])];
    return validDay(y, mo, d) ? { from: utc(y, mo, d), to: utc(y, mo, d + 1) } : null;
  }

  m = s.match(/^(19|20)(\d{2})$/);
  if (m) {
    const y = Number(s);
    return { from: utc(y, 0, 1), to: utc(y + 1, 0, 1) };
  }

  return null;
}

export function parseLookupQuery(raw: string): LookupQuery {
  const text = raw.trim().replace(/\s+/g, " ");
  const compact = text.replace(/\s/g, "");

  const looksLikeMoney = /^-?\s*(R|ZAR)\s*\d/i.test(text) || /^\d[\d\s,]*[.,]\d{2}$/.test(text);
  const amountCents = text && (looksLikeMoney || /^\d{1,7}$/.test(compact)) ? parseAmountToCents(text) : null;

  const invoiceCandidate = normaliseInvoiceNumber(text);
  const invoiceNumber =
    invoiceCandidate.length >= 2 && /\d/.test(invoiceCandidate) && !looksLikeMoney && text.length <= 40
      ? invoiceCandidate
      : null;

  return {
    text,
    amountCents,
    dateRange: parseDateRange(text),
    phone: normaliseSaPhone(text),
    registrationNumber: normaliseCipcRegistration(text),
    invoiceNumber,
    vatNumber: /^4\d{9}$/.test(compact) ? compact : null,
  };
}
