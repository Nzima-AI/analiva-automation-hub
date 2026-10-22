import { describe, expect, it } from "vitest";
import { classifyEmail, matchClient, type MatchableClient } from "./classify-and-match";
import { confidenceGate, learnLabel, parseInvoiceText } from "./invoice-parser";

// Fictional supplier and recipient (fixtures only, CLAUDE.md §10).
const VODA_LIKE = `
Cellnet Communications (Pty) Ltd
VAT Reg No: 4910101010
TAX INVOICE
Invoice No: INV-2024-00731
Invoice Date: 14/03/2024
Due Date: 31/03/2024
Bill To: Mokoena Plumbing (Pty) Ltd
Customer VAT No: 4730261845
Description            Qty    Amount
Monthly contract       1      R 869,57
Subtotal                       R 869,57
VAT @ 15%                      R 130,43
Total Due                      R 1 000,00
`;

describe("parseInvoiceText", () => {
  it("reads a typical SA tax invoice", () => {
    const p = parseInvoiceText(VODA_LIKE, { excludeVatNumbers: ["4730261845"] });
    expect(p.invoiceNumber?.value).toBe("INV-2024-00731");
    expect(p.issueDate?.value.toISOString().slice(0, 10)).toBe("2024-03-14");
    expect(p.dueDate?.value.toISOString().slice(0, 10)).toBe("2024-03-31");
    expect(p.totalCents?.value).toBe(100000n);
    expect(p.vatCents?.value).toBe(13043n);
    expect(p.subtotalCents?.value).toBe(86957n);
    expect(p.supplierVatNumber?.value).toBe("4910101010");
    expect(p.arithmeticConsistent).toBe(true);
    expect(p.looksLikeInvoice).toBe(true);
    // First invoice from an unknown supplier: good, but not auto-file.
    expect(confidenceGate(p.confidence)).toBe("SUGGEST");
  });

  it("auto-files once the supplier is known", () => {
    const p = parseInvoiceText(VODA_LIKE, {
      excludeVatNumbers: ["4730261845"],
      supplierName: "Cellnet Communications",
      labels: { invoiceNumber: ["invoice no"], total: ["total due"], issueDate: ["invoice date"] },
    });
    expect(p.confidence).toBeGreaterThanOrEqual(0.9);
    expect(confidenceGate(p.confidence)).toBe("AUTO");
  });

  it("does not take the VAT registration number as the VAT amount", () => {
    const p = parseInvoiceText("Invoice No 77\nVAT No: 4123456789\nTotal: 115.00\nVAT: 15.00", {});
    expect(p.vatCents?.value).toBe(1500n);
    expect(p.subtotalCents?.value).toBe(10000n);
    expect(p.arithmeticConsistent).toBe(true);
  });

  it("does not take subtotal as total", () => {
    const p = parseInvoiceText("Tax Invoice\nInvoice #: A100\nSub Total 200.00\nVAT 30.00\nTotal 230.00", {});
    expect(p.totalCents?.value).toBe(23000n);
    expect(p.subtotalCents?.value).toBe(20000n);
  });

  it("reads values on the line after the label", () => {
    const p = parseInvoiceText("TAX INVOICE\nInvoice Number\nZX-9981\nAmount Due\n1,234.50\n", {});
    expect(p.invoiceNumber?.value).toBe("ZX-9981");
    expect(p.totalCents?.value).toBe(123450n);
  });

  it("uses learned labels for odd layouts", () => {
    const text = "Acme Supplies\nDoc Ref   77812\nPayable now   R 575,00\n";
    const plain = parseInvoiceText(text, {});
    expect(plain.invoiceNumber).toBeNull();
    const learned = parseInvoiceText(text, { labels: { invoiceNumber: ["doc ref"], total: ["payable now"] } });
    expect(learned.invoiceNumber?.value).toBe("77812");
    expect(learned.totalCents?.value).toBe(57500n);
    expect(learned.totalCents?.confidence).toBeGreaterThan(0.9);
  });

  it("guesses weakly when nothing is labelled", () => {
    const p = parseInvoiceText("Thanks for your business\n12/05/2023\nR 450,00 and R 50,00", {});
    expect(p.totalCents?.value).toBe(45000n);
    expect(p.totalCents?.confidence).toBeLessThan(0.5);
    expect(confidenceGate(p.confidence)).toBe("REVIEW");
  });

  it("flags credit notes", () => {
    expect(parseInvoiceText("CREDIT NOTE\nTotal 100.00").looksLikeCreditNote).toBe(true);
  });
});

describe("learnLabel", () => {
  it("finds the label before a corrected value", () => {
    expect(learnLabel("Acme\nDoc Ref:   77812\n", "77812")).toBe("doc ref");
    expect(learnLabel("Payable now\nR 575,00", "R 575,00")).toBe("payable now");
    expect(learnLabel("nothing here", "999")).toBeNull();
  });
});

describe("classifyEmail", () => {
  const pdf = [{ filename: "INV-0042.pdf", mimeType: "application/pdf" }];
  it("spots invoices", () => {
    expect(classifyEmail({ subject: "Your March invoice", text: "", attachments: pdf }).kind).toBe("INVOICE");
    expect(classifyEmail({ subject: "Docs", text: "", attachments: pdf }).kind).toBe("INVOICE");
  });
  it("spots statements and CIPC", () => {
    expect(classifyEmail({ subject: "Statement for March", text: "", attachments: [{ filename: "stmt.pdf", mimeType: "application/pdf" }] }).kind).toBe("STATEMENT");
    expect(classifyEmail({ subject: "CIPC annual return due", text: "", attachments: [] }).kind).toBe("CIPC");
  });
  it("queries and other", () => {
    expect(classifyEmail({ subject: "Quick question", text: "Can you help?", attachments: [] }).kind).toBe("QUERY");
    expect(classifyEmail({ subject: "Photos", text: "", attachments: [{ filename: "a.jpg", mimeType: "image/jpeg" }] }).kind).toBe("OTHER");
  });
});

describe("matchClient", () => {
  const clients: MatchableClient[] = [
    { id: "a", name: "Mokoena Plumbing (Pty) Ltd", tradingName: null, email: "info@mokoena.example", emailDomains: ["mokoena.example"], vatNumber: "4730261845", registrationNumber: "2018/402113/07", contactEmails: ["thabo@gmail.com"] },
    { id: "b", name: "Ubuntu Bakery CC", tradingName: "Ubuntu Bakes", email: null, emailDomains: [], vatNumber: null, registrationNumber: null, contactEmails: [] },
  ];

  it("matches by contact email", () => {
    expect(matchClient({ senderEmail: "Thabo@gmail.com", documentText: "", subject: "" }, clients)).toMatchObject({ status: "MATCHED", clientId: "a" });
  });

  it("matches a supplier's invoice by the client's VAT number on it", () => {
    const r = matchClient({ senderEmail: "billing@cellnet.example", documentText: VODA_LIKE, subject: "" }, clients);
    expect(r).toMatchObject({ status: "MATCHED", clientId: "a" });
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("does not match free-mail domains by domain", () => {
    expect(matchClient({ senderEmail: "someone@gmail.com", documentText: "", subject: "" }, [{ ...clients[0]!, contactEmails: [], emailDomains: ["gmail.com"] }]).status).toBe("UNMATCHED");
  });

  it("asks when two clients match", () => {
    const r = matchClient({ senderEmail: "x@supplier.example", documentText: "Bill to Ubuntu Bakes\nRef Mokoena Plumbing job", subject: "" }, clients);
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.candidates.map((c) => c.clientId).sort()).toEqual(["a", "b"]);
  });

  it("learned sender rules win", () => {
    const r = matchClient({ senderEmail: "acc@supplier.example", documentText: "", subject: "" }, clients, [{ pattern: "acc@supplier.example", clientId: "b" }]);
    expect(r).toMatchObject({ status: "MATCHED", clientId: "b" });
  });
});

import { findPrintedValue } from "./invoice-parser";
describe("findPrintedValue", () => {
  it("finds amounts and dates as printed", () => {
    expect(findPrintedValue(VODA_LIKE, "amount", 100000n)).toBe("R 1 000,00");
    expect(findPrintedValue(VODA_LIKE, "date", new Date("2024-03-31T00:00:00Z"))).toBe("31/03/2024");
    expect(findPrintedValue(VODA_LIKE, "text", "inv-2024-00731")).toBe("inv-2024-00731");
    expect(findPrintedValue(VODA_LIKE, "amount", 123n)).toBeNull();
  });
});
