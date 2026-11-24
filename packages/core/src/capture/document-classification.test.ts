import { describe, expect, it } from "vitest";
import { isDocumentAttachment } from "./classify-and-match";
import { classifyAttachment } from "./document-classification";

const classify = (input: Partial<Parameters<typeof classifyAttachment>[0]>) =>
  classifyAttachment({ filename: "attachment.pdf", text: "", subject: "", singleAttachment: true, looksLikeInvoice: false, ...input });

describe("inbox document classification", () => {
  it.each([
    ["BusinessPlan.docx", "BUSINESS_PLAN"],
    ["Northline_Purchase_Order_123.pdf", "PURCHASE_ORDER"],
    ["payment-receipt.jpg", "RECEIPT"],
    ["brand proposal.pptx", "PROPOSAL"],
    ["bank-account-statement.pdf", "BANK_STATEMENT"],
    ["supplier account statement.pdf", "STATEMENT"],
    ["Pro forma invoice.pdf", "QUOTE"],
    ["Credit note.pdf", "CREDIT_NOTE"],
  ])("categorises %s", (filename, kind) => {
    expect(isDocumentAttachment({ filename, mimeType: "application/octet-stream" })).toBe(true);
    expect(classify({ filename })).toBe(kind);
  });

  it("does not apply an invoice subject to the other files in a mixed email", () => {
    expect(classify({ filename: "Receipt.pdf", subject: "Invoice and documents", singleAttachment: false, looksLikeInvoice: true })).toBe("RECEIPT");
    expect(classify({ subject: "Invoice and documents", singleAttachment: false })).toBeNull();
  });

  it("leaves conflicting signals unresolved and detects generic bank CSVs", () => {
    expect(classify({ filename: "Invoice.pdf", text: "Purchase order\nABC Company" })).toBeNull();
    expect(classify({ filename: "download.csv", text: "Date,Description,Debit,Credit,Balance\n2026-11-20,Example,10,0,20" })).toBe("BANK_STATEMENT");
    expect(isDocumentAttachment({ filename: "run.exe", mimeType: "application/octet-stream" })).toBe(false);
  });
});
