export const DOCUMENT_KINDS = ["INVOICE", "STATEMENT", "CIPC", "CONTRACT", "MANDATE", "BRAND_ASSET", "PAYROLL", "TAX", "OTHER"] as const;
export type DocumentKindValue = (typeof DOCUMENT_KINDS)[number];
