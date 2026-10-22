import { describe, expect, it } from "vitest";
import { validateInvoiceTotals, vatFromInclusive, vatOnExclusive } from "./invoice-validation";
import {
  isValidSaVatNumber,
  normaliseCipcRegistration,
  normaliseInvoiceNumber,
  normaliseSaPhone,
} from "./sa-identifiers";

describe("VAT maths", () => {
  it("computes 15% on exclusive amounts", () => {
    expect(vatOnExclusive(100000n)).toBe(15000n);
    expect(vatOnExclusive(333n)).toBe(50n); // 49.95 -> 50
  });
  it("extracts VAT from inclusive amounts", () => {
    expect(vatFromInclusive(115000n)).toBe(15000n);
    expect(vatFromInclusive(100n)).toBe(13n); // 13.04 -> 13
  });
});

describe("validateInvoiceTotals", () => {
  const good = { subtotalCents: 100000n, vatCents: 15000n, totalCents: 115000n, supplierVatNumber: "4123456789" };

  it("accepts a correct invoice", () => {
    expect(validateInvoiceTotals(good)).toEqual([]);
  });

  it("flags totals that do not add up", () => {
    const codes = validateInvoiceTotals({ ...good, totalCents: 116000n }).map((i) => i.code);
    expect(codes).toContain("TOTAL_MISMATCH");
  });

  it("flags wrong VAT", () => {
    const codes = validateInvoiceTotals({ ...good, vatCents: 14000n, totalCents: 114000n }).map((i) => i.code);
    expect(codes).toEqual(["VAT_MISMATCH"]);
  });

  it("flags VAT charged without a VAT number", () => {
    const codes = validateInvoiceTotals({ ...good, supplierVatNumber: null }).map((i) => i.code);
    expect(codes).toEqual(["VAT_WITHOUT_VAT_NUMBER"]);
  });

  it("allows a non-VAT vendor with zero VAT", () => {
    expect(validateInvoiceTotals({ subtotalCents: 5000n, vatCents: 0n, totalCents: 5000n })).toEqual([]);
  });

  it("checks line sums", () => {
    const lines = [{ quantity: 1, unitPriceCents: 50000n, vatRateBps: 1500, lineTotalCents: 50000n }];
    const codes = validateInvoiceTotals({ ...good, lines }).map((i) => i.code);
    expect(codes).toEqual(["LINES_MISMATCH"]);
  });
});

describe("SA identifiers", () => {
  it("validates VAT numbers", () => {
    expect(isValidSaVatNumber("4123456789")).toBe(true);
    expect(isValidSaVatNumber("412 345 6789")).toBe(true);
    expect(isValidSaVatNumber("3123456789")).toBe(false);
    expect(isValidSaVatNumber("412345678")).toBe(false);
  });

  it("normalises CIPC registration numbers", () => {
    expect(normaliseCipcRegistration("2019/123456/07")).toBe("2019/123456/07");
    expect(normaliseCipcRegistration("2019 123456 07")).toBe("2019/123456/07");
    expect(normaliseCipcRegistration("201912345607")).toBe("2019/123456/07");
    expect(normaliseCipcRegistration("hello")).toBeNull();
  });

  it("normalises phone numbers", () => {
    expect(normaliseSaPhone("+27 82 123 4567")).toBe("0821234567");
    expect(normaliseSaPhone("082-123-4567")).toBe("0821234567");
    expect(normaliseSaPhone("27821234567")).toBe("0821234567");
    expect(normaliseSaPhone("12345")).toBeNull();
  });

  it("normalises invoice numbers", () => {
    expect(normaliseInvoiceNumber(" inv-00 12/a ")).toBe("INV0012A");
  });
});
