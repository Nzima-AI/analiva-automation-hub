/**
 * Chart of accounts. Account types mirror Analiva's import account types so a ledger
 * exported from here imports into Analiva without mapping.
 */

export const ACCOUNT_TYPES = [
  "BANK",
  "CURRENT_ASSET",
  "FIXED_ASSET",
  "CURRENT_LIABILITY",
  "LONG_TERM_LIABILITY",
  "EQUITY",
  "SALES",
  "OTHER_INCOME",
  "COST_OF_SALES",
  "EXPENSE",
  "INCOME_TAX",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_INFO: Record<AccountType, { label: string; statement: "BS" | "IS"; normal: "DEBIT" | "CREDIT"; analivaType: string }> = {
  BANK: { label: "Bank & cash", statement: "BS", normal: "DEBIT", analivaType: "bank" },
  CURRENT_ASSET: { label: "Current assets", statement: "BS", normal: "DEBIT", analivaType: "current_assets" },
  FIXED_ASSET: { label: "Non-current assets", statement: "BS", normal: "DEBIT", analivaType: "fixed_assets" },
  CURRENT_LIABILITY: { label: "Current liabilities", statement: "BS", normal: "CREDIT", analivaType: "current_liabilities" },
  LONG_TERM_LIABILITY: { label: "Non-current liabilities", statement: "BS", normal: "CREDIT", analivaType: "long_term_liabilities" },
  EQUITY: { label: "Equity", statement: "BS", normal: "CREDIT", analivaType: "equity" },
  SALES: { label: "Sales", statement: "IS", normal: "CREDIT", analivaType: "sales" },
  OTHER_INCOME: { label: "Other income", statement: "IS", normal: "CREDIT", analivaType: "other_income" },
  COST_OF_SALES: { label: "Cost of sales", statement: "IS", normal: "DEBIT", analivaType: "cost_of_sales" },
  EXPENSE: { label: "Operating expenses", statement: "IS", normal: "DEBIT", analivaType: "expenses" },
  INCOME_TAX: { label: "Income tax", statement: "IS", normal: "DEBIT", analivaType: "income_tax" },
};

/** Accounts the posting engine needs to find by role, not by code. */
export const SYSTEM_KEYS = [
  "BANK_DEFAULT",
  "DEBTORS",
  "CREDITORS",
  "VAT_INPUT",
  "VAT_OUTPUT",
  "RETAINED_EARNINGS",
  "SUSPENSE",
  "SALES_DEFAULT",
  "EXPENSE_DEFAULT",
] as const;
export type SystemKey = (typeof SYSTEM_KEYS)[number];

export interface ChartTemplateAccount {
  code: string;
  name: string;
  type: AccountType;
  systemKey?: SystemKey;
  /** Words that suggest this account for a supplier or bank line. */
  keywords?: string[];
}

/** A standard South African small-business chart (Sage/Pastel-style numbering). */
export const SA_STANDARD_CHART: ChartTemplateAccount[] = [
  // Income
  { code: "1000", name: "Sales", type: "SALES", systemKey: "SALES_DEFAULT" },
  { code: "1010", name: "Fees earned", type: "SALES", keywords: ["fees", "consulting", "services rendered"] },
  { code: "1500", name: "Interest received", type: "OTHER_INCOME", keywords: ["interest received", "credit interest", "int earned"] },
  { code: "1510", name: "Rental income", type: "OTHER_INCOME", keywords: ["rent received"] },
  { code: "1520", name: "Sundry income", type: "OTHER_INCOME" },
  // Cost of sales
  { code: "2000", name: "Purchases", type: "COST_OF_SALES", keywords: ["stock", "inventory", "wholesale", "makro", "builders"] },
  { code: "2010", name: "Direct labour", type: "COST_OF_SALES" },
  { code: "2020", name: "Subcontractors", type: "COST_OF_SALES", keywords: ["subcontract"] },
  // Expenses
  { code: "3000", name: "Accounting fees", type: "EXPENSE", keywords: ["accounting", "bookkeeping", "audit"] },
  { code: "3010", name: "Advertising & marketing", type: "EXPENSE", keywords: ["advert", "marketing", "facebook", "google ads", "meta"] },
  { code: "3020", name: "Bank charges", type: "EXPENSE", keywords: ["bank charge", "service fee", "monthly fee", "transaction fee", "cash handling", "admin fee"] },
  { code: "3030", name: "Cleaning", type: "EXPENSE", keywords: ["cleaning"] },
  { code: "3040", name: "Computer expenses & software", type: "EXPENSE", keywords: ["software", "microsoft", "google workspace", "adobe", "subscription", "hosting", "domain"] },
  { code: "3050", name: "Consulting fees", type: "EXPENSE", keywords: ["consult"] },
  { code: "3060", name: "Depreciation", type: "EXPENSE" },
  { code: "3070", name: "Electricity & water", type: "EXPENSE", keywords: ["eskom", "electricity", "prepaid elec", "municipal", "water"] },
  { code: "3080", name: "Entertainment", type: "EXPENSE", keywords: ["restaurant", "entertainment"] },
  { code: "3090", name: "Fuel & oil", type: "EXPENSE", keywords: ["engen", "shell", "sasol", "bp ", "total energies", "caltex", "fuel", "petrol", "diesel"] },
  { code: "3100", name: "Insurance", type: "EXPENSE", keywords: ["insurance", "santam", "outsurance", "discovery insure", "hollard", "old mutual"] },
  { code: "3110", name: "Interest paid", type: "EXPENSE", keywords: ["interest paid", "debit interest", "overdraft interest"] },
  { code: "3120", name: "Legal fees", type: "EXPENSE", keywords: ["attorney", "legal"] },
  { code: "3130", name: "Motor vehicle expenses", type: "EXPENSE", keywords: ["tyre", "tyres", "toll", "e-toll", "sanral", "car wash"] },
  { code: "3140", name: "Printing & stationery", type: "EXPENSE", keywords: ["stationery", "printing", "waltons", "cna"] },
  { code: "3150", name: "Rent paid", type: "EXPENSE", keywords: ["rent", "lease"] },
  { code: "3160", name: "Repairs & maintenance", type: "EXPENSE", keywords: ["repair", "maintenance"] },
  { code: "3170", name: "Salaries & wages", type: "EXPENSE", keywords: ["salary", "salaries", "wages"] },
  { code: "3180", name: "Security", type: "EXPENSE", keywords: ["security", "adt", "fidelity", "armed response"] },
  { code: "3190", name: "Staff welfare", type: "EXPENSE" },
  { code: "3200", name: "Telephone & internet", type: "EXPENSE", keywords: ["vodacom", "mtn", "telkom", "cell c", "rain", "afrihost", "internet", "fibre", "airtime", "data bundle"] },
  { code: "3210", name: "Training", type: "EXPENSE", keywords: ["training", "course"] },
  { code: "3220", name: "Travel & accommodation", type: "EXPENSE", keywords: ["uber", "bolt", "flysafair", "airlink", "hotel", "airbnb", "lodge"] },
  { code: "3230", name: "Courier & postage", type: "EXPENSE", keywords: ["courier", "postnet", "the courier guy", "dhl", "aramex"] },
  { code: "3240", name: "Licences & permits", type: "EXPENSE", keywords: ["licence", "license", "permit", "cipc"] },
  { code: "3990", name: "General expenses", type: "EXPENSE", systemKey: "EXPENSE_DEFAULT" },
  { code: "4000", name: "Income tax", type: "INCOME_TAX" },
  // Assets
  { code: "5000", name: "Equipment", type: "FIXED_ASSET" },
  { code: "5010", name: "Accumulated depreciation: equipment", type: "FIXED_ASSET" },
  { code: "5100", name: "Motor vehicles", type: "FIXED_ASSET" },
  { code: "5110", name: "Accumulated depreciation: vehicles", type: "FIXED_ASSET" },
  { code: "5200", name: "Computer equipment", type: "FIXED_ASSET" },
  { code: "6000", name: "Trade debtors", type: "CURRENT_ASSET", systemKey: "DEBTORS" },
  { code: "6100", name: "Inventory", type: "CURRENT_ASSET" },
  { code: "6200", name: "Prepayments & deposits", type: "CURRENT_ASSET" },
  { code: "6300", name: "VAT input", type: "CURRENT_ASSET", systemKey: "VAT_INPUT" },
  { code: "7000", name: "Bank: current account", type: "BANK", systemKey: "BANK_DEFAULT" },
  { code: "7100", name: "Petty cash", type: "BANK" },
  // Liabilities
  { code: "8000", name: "Trade creditors", type: "CURRENT_LIABILITY", systemKey: "CREDITORS" },
  { code: "8100", name: "VAT output", type: "CURRENT_LIABILITY", systemKey: "VAT_OUTPUT" },
  { code: "8200", name: "PAYE & UIF payable", type: "CURRENT_LIABILITY" },
  { code: "8300", name: "Provisional tax payable", type: "CURRENT_LIABILITY" },
  { code: "8400", name: "Accruals", type: "CURRENT_LIABILITY" },
  { code: "8500", name: "Loan from director / shareholder", type: "LONG_TERM_LIABILITY", keywords: ["director loan", "shareholder loan"] },
  { code: "8600", name: "Long-term loans", type: "LONG_TERM_LIABILITY" },
  { code: "8999", name: "Suspense (to be allocated)", type: "CURRENT_LIABILITY", systemKey: "SUSPENSE" },
  // Equity
  { code: "9000", name: "Share capital / owner's capital", type: "EQUITY" },
  { code: "9100", name: "Retained earnings", type: "EQUITY", systemKey: "RETAINED_EARNINGS" },
  { code: "9200", name: "Drawings / dividends", type: "EQUITY", keywords: ["drawings", "dividend"] },
];

/** Suggest an account code for a supplier or bank description from template keywords. */
export function suggestAccountCode(text: string, chart: Array<{ code: string; keywords?: string[] }> = SA_STANDARD_CHART): string | null {
  const t = ` ${text.toLowerCase()} `;
  let best: { code: string; len: number } | null = null;
  for (const a of chart) {
    for (const k of a.keywords ?? []) {
      if (k.length >= 2 && t.includes(k) && (!best || k.length > best.len)) best = { code: a.code, len: k.length };
    }
  }
  return best?.code ?? null;
}
