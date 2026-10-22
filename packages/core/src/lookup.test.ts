import { describe, expect, it } from "vitest";
import { parseDateRange, parseLookupQuery } from "./lookup";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("parseDateRange", () => {
  it("parses ISO days", () => {
    expect(parseDateRange("2023-03-14")).toEqual({ from: d("2023-03-14"), to: d("2023-03-15") });
  });
  it("parses SA day-first dates", () => {
    expect(parseDateRange("14/03/2023")).toEqual({ from: d("2023-03-14"), to: d("2023-03-15") });
  });
  it("rejects impossible dates", () => {
    expect(parseDateRange("31/02/2023")).toBeNull();
  });
  it("parses months", () => {
    expect(parseDateRange("Mar 2023")).toEqual({ from: d("2023-03-01"), to: d("2023-04-01") });
    expect(parseDateRange("2023-12")).toEqual({ from: d("2023-12-01"), to: d("2024-01-01") });
    expect(parseDateRange("14 March 2023")).toEqual({ from: d("2023-03-14"), to: d("2023-03-15") });
  });
  it("parses whole years", () => {
    expect(parseDateRange("2022")).toEqual({ from: d("2022-01-01"), to: d("2023-01-01") });
  });
});

describe("parseLookupQuery", () => {
  it("reads a rand amount", () => {
    const q = parseLookupQuery("R 4 500,00");
    expect(q.amountCents).toBe(450000n);
    expect(q.invoiceNumber).toBeNull();
  });

  it("reads an invoice number", () => {
    const q = parseLookupQuery("INV-2021-0042");
    expect(q.invoiceNumber).toBe("INV20210042");
    expect(q.amountCents).toBeNull();
  });

  it("reads a phone number", () => {
    expect(parseLookupQuery("082 123 4567").phone).toBe("0821234567");
  });

  it("reads a registration number", () => {
    expect(parseLookupQuery("2019/123456/07").registrationNumber).toBe("2019/123456/07");
  });

  it("reads a VAT number", () => {
    expect(parseLookupQuery("4123456789").vatNumber).toBe("4123456789");
  });

  it("a plain name is just text", () => {
    const q = parseLookupQuery("  Thandi   Mokoena ");
    expect(q).toMatchObject({ text: "Thandi Mokoena", amountCents: null, invoiceNumber: null, dateRange: null });
  });

  it("a short number is both an amount and an invoice number", () => {
    const q = parseLookupQuery("1500");
    expect(q.amountCents).toBe(150000n);
    expect(q.invoiceNumber).toBe("1500");
  });
});
