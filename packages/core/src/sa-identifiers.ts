/**
 * South African identifier helpers: VAT numbers, CIPC registration numbers, phone numbers.
 */

/** Standard SA VAT rate in basis points (15%). */
export const SA_VAT_RATE_BPS = 1500;

/** SA VAT numbers are 10 digits and start with 4. */
export function isValidSaVatNumber(input: string): boolean {
  return /^4\d{9}$/.test(input.replace(/\s/g, ""));
}

/**
 * CIPC company registration numbers look like 2019/123456/07.
 * Returns the canonical form or null if the input is not one.
 */
export function normaliseCipcRegistration(input: string): string | null {
  const m = input.trim().match(/^(\d{4})\s*[/\\-]?\s*(\d{6})\s*[/\\-]?\s*(\d{2})$/);
  if (!m) return null;
  return `${m[1]}/${m[2]}/${m[3]}`;
}

/**
 * Normalise an SA phone number to national format (0XXXXXXXXX).
 * Returns null when the input does not look like a phone number.
 */
export function normaliseSaPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let national: string;
  if (digits.startsWith("+27")) national = "0" + digits.slice(3);
  else if (digits.startsWith("27") && digits.length === 11) national = "0" + digits.slice(2);
  else national = digits.replace(/\+/g, "");
  return /^0\d{9}$/.test(national) ? national : null;
}

/**
 * Normalise an invoice number for matching and duplicate checks:
 * uppercase, strip whitespace and separators.
 */
export function normaliseInvoiceNumber(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
