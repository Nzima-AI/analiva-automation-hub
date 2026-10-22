import { SA_VAT_RATE_BPS, isValidSaVatNumber } from "./sa-identifiers";

export interface InvoiceLineInput {
  quantity: number;
  unitPriceCents: bigint;
  vatRateBps: number;
  lineTotalCents: bigint;
}

export interface InvoiceTotalsInput {
  subtotalCents: bigint;
  vatCents: bigint;
  totalCents: bigint;
  supplierVatNumber?: string | null;
  lines?: InvoiceLineInput[];
}

export type ValidationIssueCode =
  | "TOTAL_MISMATCH"
  | "VAT_MISMATCH"
  | "LINES_MISMATCH"
  | "INVALID_VAT_NUMBER"
  | "VAT_WITHOUT_VAT_NUMBER"
  | "NEGATIVE_TOTAL";

export interface ValidationIssue {
  code: ValidationIssueCode;
  message: string;
}

/** Rounding tolerance for VAT and line sums, in cents. */
const TOLERANCE_CENTS = 2n;

function absDiff(a: bigint, b: bigint): bigint {
  return a > b ? a - b : b - a;
}

/** VAT on an exclusive amount at the given rate, rounded half-up to the cent. */
export function vatOnExclusive(exclusiveCents: bigint, rateBps: number = SA_VAT_RATE_BPS): bigint {
  return (exclusiveCents * BigInt(rateBps) + 5000n) / 10000n;
}

/** VAT contained in an inclusive amount, rounded half-up to the cent. */
export function vatFromInclusive(inclusiveCents: bigint, rateBps: number = SA_VAT_RATE_BPS): bigint {
  const rate = BigInt(rateBps);
  return (inclusiveCents * rate * 2n + (10000n + rate)) / ((10000n + rate) * 2n);
}

/**
 * Check an invoice's numbers add up. An empty result means it is valid.
 * Used as the gate before anything is posted to Analiva (CLAUDE.md §7).
 */
export function validateInvoiceTotals(input: InvoiceTotalsInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { subtotalCents, vatCents, totalCents } = input;

  if (totalCents < 0n) {
    issues.push({ code: "NEGATIVE_TOTAL", message: "Total is negative; capture credit notes as credit notes." });
  }

  if (subtotalCents + vatCents !== totalCents) {
    issues.push({ code: "TOTAL_MISMATCH", message: "Subtotal plus VAT does not equal the total." });
  }

  if (vatCents !== 0n) {
    const expected = vatOnExclusive(subtotalCents);
    if (absDiff(expected, vatCents) > TOLERANCE_CENTS) {
      issues.push({ code: "VAT_MISMATCH", message: "VAT is not 15% of the subtotal." });
    }
    if (!input.supplierVatNumber) {
      issues.push({ code: "VAT_WITHOUT_VAT_NUMBER", message: "VAT charged but the supplier has no VAT number." });
    }
  }

  if (input.supplierVatNumber && !isValidSaVatNumber(input.supplierVatNumber)) {
    issues.push({ code: "INVALID_VAT_NUMBER", message: "Supplier VAT number must be 10 digits starting with 4." });
  }

  if (input.lines && input.lines.length > 0) {
    const sum = input.lines.reduce((acc, l) => acc + l.lineTotalCents, 0n);
    if (absDiff(sum, subtotalCents) > TOLERANCE_CENTS * BigInt(input.lines.length)) {
      issues.push({ code: "LINES_MISMATCH", message: "Line totals do not add up to the subtotal." });
    }
  }

  return issues;
}
