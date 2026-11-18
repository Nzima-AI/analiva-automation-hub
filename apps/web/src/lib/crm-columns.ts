import type { Column, Facet } from "@/components/crm/data-table";

export const CLIENT_COLUMNS: Column[] = [
  { key: "name", label: "Client", sub: "trading" },
  { key: "status", label: "Status", kind: "badge", tones: { ACTIVE: "positive", ONBOARDING: "brand", PROSPECT: "neutral", PAUSED: "warn", ARCHIVED: "neutral" } },
  { key: "contact", label: "Main contact", sub: "contactSub", hideBelow: "md" },
  { key: "phone", label: "Phone", hideBelow: "lg" },
  { key: "services", label: "Services", hideBelow: "xl" },
  { key: "invoices", label: "Invoices", kind: "number", align: "right", hideBelow: "md" },
  { key: "payable", label: "Bills owing", kind: "money", align: "right", hideBelow: "lg" },
  { key: "lastActivity", label: "Last capture", kind: "date", hideBelow: "lg" },
];

export const CLIENT_FACETS: Facet[] = [
  {
    key: "status",
    label: "Status",
    options: ["ACTIVE", "ONBOARDING", "PROSPECT", "PAUSED", "ARCHIVED"].map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() })),
  },
  {
    key: "mode",
    label: "Review",
    options: [
      { value: "ALWAYS_REVIEW", label: "Always review" },
      { value: "AUTO_WHEN_CONFIDENT", label: "Auto when confident" },
      { value: "NEVER_REVIEW", label: "Never review" },
    ],
  },
];
