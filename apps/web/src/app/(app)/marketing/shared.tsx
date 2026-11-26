import Link from "next/link";

export const interests = { REPORTING: "Financial reporting", BOOKKEEPING: "Bookkeeping", PAYROLL: "Payroll" } as const;
export const sources = { WEBSITE: "Website enquiry", INBOX: "Inbox enquiry", REFERRAL: "Referral", IMPORT: "Import", MANUAL: "Manual entry" } as const;
export const stages = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", WON: "Won", CLOSED: "Closed" } as const;
export const channels = { EMAIL: "Email", WHATSAPP: "WhatsApp" } as const;
export const statuses = { DRAFT: "Draft", APPROVED: "Approved", SENDING: "Sending", SENT: "Sent", CANCELLED: "Stopped", PAUSED: "Paused" } as const;

export function Options({ values }: { values: Record<string, string> }) {
  return Object.entries(values).map(([value, label]) => <option key={value} value={value}>{label}</option>);
}

/** "27821234567" → "+27 82 123 4567" */
export function formatPhone(phone: string | null) {
  if (!phone) return "";
  return phone.startsWith("27") && phone.length === 11 ? `+27 ${phone.slice(2, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : `+${phone}`;
}

const tabs = [
  { href: "/marketing", label: "Overview" },
  { href: "/marketing/campaigns", label: "Campaigns" },
  { href: "/marketing/inbox", label: "Inbox" },
  { href: "/marketing/contacts", label: "Contacts" },
  { href: "/marketing/pipeline", label: "Pipeline" },
  { href: "/marketing/automations", label: "Automations" },
  { href: "/marketing/analytics", label: "Analytics" },
  { href: "/marketing/settings", label: "Settings" },
];

export function MarketingTabs({ active, badge }: { active: string; badge?: number }) {
  // Demo mode banner and tour button live in the page header; the tabs are just navigation.
  return (
    <nav aria-label="Marketing" className="seg-tabs -mt-1 mb-6">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={active === tab.href ? "page" : undefined} className="seg-tab">
          {tab.label}
          {tab.href === "/marketing/inbox" && badge ? <span className="seg-count num">{badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
