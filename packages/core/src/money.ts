/**
 * Money is always integer minor units (cents) as bigint, plus a currency code.
 * Never use floats for stored amounts.
 */

export const DEFAULT_CURRENCY = "ZAR";

/**
 * Parse a human-typed amount into cents.
 * Accepts "R 1 234.50", "1,234.50", "1 234,50", "R1234", "-R 50".
 * Returns null when the input is not an amount.
 */
export function parseAmountToCents(input: string): bigint | null {
  let s = input.trim().replace(/[  ]/g, " ");
  if (!s) return null;

  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  }
  s = s.replace(/^(ZAR|R)\s*/i, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  s = s.replace(/ /g, "");
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let decimalSep: "." | "," | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? "." : ",";
  } else if (lastDot >= 0) {
    // "1.234.567" is thousands; "12.5" / "12.50" is decimal
    decimalSep = s.split(".").length === 2 && s.length - lastDot - 1 <= 2 ? "." : null;
  } else if (lastComma >= 0) {
    decimalSep = s.split(",").length === 2 && s.length - lastComma - 1 <= 2 ? "," : null;
  }

  let whole: string;
  let fraction = "";
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    whole = s.slice(0, idx);
    fraction = s.slice(idx + 1);
    if (whole.includes(decimalSep)) return null;
  } else {
    whole = s;
  }
  whole = whole.replace(/[.,]/g, "");
  if (fraction.length > 2 || /[.,]/.test(fraction)) return null;
  if (!whole) whole = "0";

  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return negative ? -cents : cents;
}

/** Format cents for display, e.g. 123450n -> "R 1 234,50" (en-ZA). */
export function formatCents(cents: bigint | number, currency: string = DEFAULT_CURRENCY): string {
  const value = typeof cents === "bigint" ? cents : BigInt(Math.trunc(cents));
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const symbol = currency === "ZAR" ? "R" : currency;
  return `${negative ? "-" : ""}${symbol} ${grouped},${fraction}`;
}

/** Cents -> plain decimal string for inputs and exports, e.g. 123450n -> "1234.50". */
export function centsToDecimalString(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}
