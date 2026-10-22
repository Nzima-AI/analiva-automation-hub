import type { InvoiceField, ParsedInvoice } from "@aah/core";

/** JSON shape stored on Capture.extracted. Amounts are cent strings; dates YYYY-MM-DD. */
export interface StoredField {
  value: string;
  confidence: number;
  source: string;
}

export type ExtractedJson = {
  fields: Partial<Record<InvoiceField, StoredField>>;
  arithmeticConsistent: boolean;
  looksLikeCreditNote: boolean;
  method: string;
  note: string | null;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

export function toExtractedJson(p: ParsedInvoice, method: string, note: string | null): ExtractedJson {
  const fields: ExtractedJson["fields"] = {};
  if (p.supplierName) fields.supplierName = { ...p.supplierName };
  if (p.supplierVatNumber) fields.supplierVatNumber = { ...p.supplierVatNumber };
  if (p.invoiceNumber) fields.invoiceNumber = { ...p.invoiceNumber };
  if (p.issueDate) fields.issueDate = { ...p.issueDate, value: day(p.issueDate.value) };
  if (p.dueDate) fields.dueDate = { ...p.dueDate, value: day(p.dueDate.value) };
  if (p.subtotalCents) fields.subtotal = { ...p.subtotalCents, value: p.subtotalCents.value.toString() };
  if (p.vatCents) fields.vat = { ...p.vatCents, value: p.vatCents.value.toString() };
  if (p.totalCents) fields.total = { ...p.totalCents, value: p.totalCents.value.toString() };
  return { fields, arithmeticConsistent: p.arithmeticConsistent, looksLikeCreditNote: p.looksLikeCreditNote, method, note };
}

export function readExtracted(json: unknown): ExtractedJson {
  const j = (json ?? {}) as Partial<ExtractedJson>;
  return {
    fields: j.fields ?? {},
    arithmeticConsistent: !!j.arithmeticConsistent,
    looksLikeCreditNote: !!j.looksLikeCreditNote,
    method: j.method ?? "unknown",
    note: j.note ?? null,
  };
}
