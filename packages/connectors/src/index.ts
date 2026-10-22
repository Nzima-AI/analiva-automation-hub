import { centsToDecimalString } from "@aah/core";

/**
 * Accounting connectors (CLAUDE.md §8). No public Analiva API is known, so:
 *  1. MockAccountingConnector: lets the rest of the system be built and tested.
 *  2. Import file: a CSV the practice can import into Analiva.
 * TODO(confirm): Analiva's real import column layout, date format and account codes.
 */

export interface ConnectorInvoice {
  id: string;
  clientCode: string;
  clientName: string;
  direction: "PAYABLE" | "RECEIVABLE";
  supplierName: string | null;
  supplierVatNumber: string | null;
  invoiceNumber: string;
  /** YYYY-MM-DD */
  issueDate: string;
  dueDate: string | null;
  description: string | null;
  currency: string;
  subtotalCents: bigint;
  vatCents: bigint;
  totalCents: bigint;
}

export interface ConnectorSupplier {
  name: string;
  vatNumber: string | null;
}

export type ConnectorResult = { ok: true; externalId: string } | { ok: false; error: string };

export interface ReconciliationReport {
  period: string;
  matched: number;
  missingInAccounting: string[];
  missingInPlatform: string[];
}

export interface AccountingConnector {
  readonly name: string;
  upsertSupplier(supplier: ConnectorSupplier): Promise<ConnectorResult>;
  postInvoice(invoice: ConnectorInvoice): Promise<ConnectorResult>;
  fetchPostedInvoices(since: Date): Promise<ConnectorInvoice[]>;
  reconcile(period: string): Promise<ReconciliationReport>;
}

/** In-memory stand-in for Analiva. */
export class MockAccountingConnector implements AccountingConnector {
  readonly name = "mock";
  private readonly suppliers = new Map<string, ConnectorSupplier>();
  private readonly invoices = new Map<string, ConnectorInvoice & { postedAt: Date }>();

  async upsertSupplier(supplier: ConnectorSupplier): Promise<ConnectorResult> {
    const key = supplier.vatNumber ?? supplier.name.toLowerCase();
    this.suppliers.set(key, supplier);
    return { ok: true, externalId: `sup_${key}` };
  }

  async postInvoice(invoice: ConnectorInvoice): Promise<ConnectorResult> {
    if (this.invoices.has(invoice.id)) return { ok: false, error: "already posted" };
    this.invoices.set(invoice.id, { ...invoice, postedAt: new Date() });
    return { ok: true, externalId: `inv_${invoice.id}` };
  }

  async fetchPostedInvoices(since: Date): Promise<ConnectorInvoice[]> {
    return [...this.invoices.values()].filter((i) => i.postedAt >= since);
  }

  async reconcile(period: string): Promise<ReconciliationReport> {
    const matched = [...this.invoices.values()].filter((i) => i.issueDate.startsWith(period)).length;
    return { period, matched, missingInAccounting: [], missingInPlatform: [] };
  }
}

const CSV_COLUMNS = [
  "Client code",
  "Client",
  "Type",
  "Date",
  "Due date",
  "Supplier/Customer",
  "Their VAT number",
  "Invoice number",
  "Description",
  "Currency",
  "Amount excl VAT",
  "VAT",
  "Amount incl VAT",
  "Platform ID",
] as const;

function csvCell(value: string | null): string {
  const v = value ?? "";
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Import file for Analiva. TODO(confirm) the exact column layout with Analiva. */
export function toAnalivaImportCsv(invoices: ConnectorInvoice[]): string {
  const rows = invoices.map((i) =>
    [
      i.clientCode,
      i.clientName,
      i.direction === "PAYABLE" ? "Supplier invoice" : "Customer invoice",
      i.issueDate,
      i.dueDate,
      i.supplierName,
      i.supplierVatNumber,
      i.invoiceNumber,
      i.description,
      i.currency,
      centsToDecimalString(i.subtotalCents),
      centsToDecimalString(i.vatCents),
      centsToDecimalString(i.totalCents),
      i.id,
    ]
      .map(csvCell)
      .join(","),
  );
  return "﻿" + [CSV_COLUMNS.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
}
