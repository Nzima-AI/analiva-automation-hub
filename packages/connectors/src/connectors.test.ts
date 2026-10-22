import { describe, expect, it } from "vitest";
import { MockAccountingConnector, toAnalivaImportCsv, type ConnectorInvoice } from "./index";

const inv: ConnectorInvoice = {
  id: "i1",
  clientCode: "CL-0001",
  clientName: "Mokoena Plumbing",
  direction: "PAYABLE",
  supplierName: "=HYPERLINK(\"x\")",
  supplierVatNumber: "4910101010",
  invoiceNumber: "INV-1",
  issueDate: "2024-03-14",
  dueDate: null,
  description: 'Says "hi"',
  currency: "ZAR",
  subtotalCents: 86957n,
  vatCents: 13043n,
  totalCents: 100000n,
};

describe("toAnalivaImportCsv", () => {
  it("writes amounts as decimals and escapes safely", () => {
    const csv = toAnalivaImportCsv([inv]);
    const row = csv.split("\r\n")[1]!;
    expect(row).toContain('"869.57","130.43","1000.00"');
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain('"Says ""hi"""');
  });
});

describe("MockAccountingConnector", () => {
  it("posts once and reports back", async () => {
    const c = new MockAccountingConnector();
    expect((await c.postInvoice(inv)).ok).toBe(true);
    expect((await c.postInvoice(inv)).ok).toBe(false);
    expect(await c.fetchPostedInvoices(new Date(0))).toHaveLength(1);
    expect((await c.reconcile("2024-03")).matched).toBe(1);
  });
});
