import { describe, expect, it } from "vitest";
import { centsToDecimalString, formatCents, parseAmountToCents } from "./money";

describe("parseAmountToCents", () => {
  it.each([
    ["R 1 234.50", 123450n],
    ["R1234", 123400n],
    ["1,234.50", 123450n],
    ["1 234,50", 123450n],
    ["1.234.567,89", 123456789n],
    ["12.5", 1250n],
    ["0,99", 99n],
    ["-R 50", -5000n],
    ["ZAR 10", 1000n],
    ["1,234", 123400n],
  ])("%s -> %s", (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "R", "12.345.6x", "1.2.3,4,5"])("rejects %j", (input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });
});

describe("formatCents", () => {
  it("formats en-ZA style", () => {
    expect(formatCents(123450n)).toBe("R 1 234,50");
    expect(formatCents(5n)).toBe("R 0,05");
    expect(formatCents(-100000000n)).toBe("-R 1 000 000,00");
    expect(formatCents(100n, "USD")).toBe("USD 1,00");
  });
});

describe("centsToDecimalString", () => {
  it("round-trips", () => {
    expect(centsToDecimalString(123450n)).toBe("1234.50");
    expect(centsToDecimalString(-7n)).toBe("-0.07");
  });
});
