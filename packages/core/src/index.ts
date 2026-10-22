export * from "./audit";
export * from "./invoice-validation";
export * from "./lookup";
export * from "./money";
export * from "./sa-identifiers";
export * from "./tenancy";

export const SERVICES = ["ACCOUNTING", "PAYROLL", "CIPC", "BRANDING", "WEBSITE", "LAUNCH"] as const;
export type ServiceType = (typeof SERVICES)[number];

/** Invoices are kept at least this long (CLAUDE.md §6). */
export const INVOICE_RETENTION_YEARS = 5;

export const DISPLAY_TIMEZONE = "Africa/Johannesburg";
export * from "./mail-presets";
export * from "./capture/invoice-parser";
export * from "./capture/classify-and-match";
