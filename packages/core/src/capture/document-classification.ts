export const DOCUMENT_KINDS = [
  "INVOICE", "RECEIPT", "PURCHASE_ORDER", "BANK_STATEMENT", "STATEMENT",
  "BUSINESS_PLAN", "PROPOSAL", "QUOTE", "CREDIT_NOTE", "REMITTANCE",
  "CIPC", "CONTRACT", "MANDATE", "BRAND_ASSET", "PAYROLL", "TAX", "OTHER",
] as const;

export type DocumentKindValue = (typeof DOCUMENT_KINDS)[number];

const labels: Array<[DocumentKindValue, RegExp]> = [
  ["BANK_STATEMENT", /\b(?:bank(?:\s+account)?|transaction)\s+statement\b/i],
  ["BUSINESS_PLAN", /\b(?:business|strategic)\s+plan\b/i],
  ["PURCHASE_ORDER", /\bpurchase\s+order\b|^po\s+\d/i],
  ["RECEIPT", /\b(?:payment\s+)?receipt\b/i],
  ["PROPOSAL", /\bproposal\b/i],
  ["QUOTE", /\b(?:quotation|quote|pro\s*forma\s+invoice)\b/i],
  ["CREDIT_NOTE", /\bcredit\s+(?:note|memo)\b/i],
  ["REMITTANCE", /\b(?:remittance\s+advice|proof\s+of\s+payment)\b/i],
  ["CIPC", /\b(?:cipc|annual\s+return|beneficial\s+ownership|company\s+registration|cor\s*\d{2})\b/i],
  ["CONTRACT", /\b(?:contract|service\s+agreement|nda)\b/i],
  ["MANDATE", /\bmandate\b/i],
  ["PAYROLL", /\b(?:payroll|payslip|pay\s+slip)\b/i],
  ["TAX", /\b(?:tax\s+return|tax\s+clearance|notice\s+of\s+assessment|vat201|emp201)\b/i],
  ["INVOICE", /\binvoice\b|^inv\s*\d/i],
  ["STATEMENT", /\bstatement\b/i],
];

function matches(text: string): DocumentKindValue[] {
  const normalized = text.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_.-]+/g, " ");
  return labels.filter(([kind, pattern]) => {
    if (kind === "STATEMENT" && /\b(?:bank(?:\s+account)?|transaction)\s+statement\b/i.test(normalized)) return false;
    if (kind === "INVOICE" && /\bpro\s*forma\s+invoice\b/i.test(normalized)) return false;
    return pattern.test(normalized);
  }).map(([kind]) => kind);
}

export function classifyAttachment(input: { filename: string; text: string; subject: string; singleAttachment: boolean; looksLikeInvoice: boolean }): DocumentKindValue | null {
  const filename = input.filename.replace(/\.[^.]+$/, "");
  const header = input.text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 5).join("\n").slice(0, 420);
  const evidence = new Set([...matches(filename), ...matches(header)]);
  if (evidence.size === 1) return evidence.values().next().value ?? null;
  if (evidence.size > 1) return null;
  if (/\.(csv|tsv)$/i.test(input.filename)) {
    const columns = input.text.split(/\r?\n/, 1)[0] ?? "";
    if (/\bdate\b/i.test(columns) && /\bbalance\b/i.test(columns) &&
      /\b(?:debit|credit|transaction amount|withdrawal|deposit)\b/i.test(columns)) return "BANK_STATEMENT";
  }
  if (input.looksLikeInvoice) return "INVOICE";
  // An email can contain several unrelated documents. Apply its subject only to a single file.
  if (!input.singleAttachment) return null;
  const subjectMatches = matches(input.subject);
  return subjectMatches.length === 1 ? subjectMatches[0] ?? null : null;
}
