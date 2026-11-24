import Link from "next/link";
import { cx } from "@/components/ui";

export const interests = { REPORTING: "Financial reporting", BOOKKEEPING: "Bookkeeping", PAYROLL: "Payroll" } as const;
export const sources = { WEBSITE: "Website enquiry", INBOX: "Inbox enquiry", REFERRAL: "Referral", IMPORT: "Import", MANUAL: "Manual entry" } as const;
export const stages = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", WON: "Won", CLOSED: "Closed" } as const;
export const channels = { EMAIL: "Email", WHATSAPP: "WhatsApp" } as const;
export const statuses = { DRAFT: "Draft", APPROVED: "Approved", SENDING: "Sending", SENT: "Sent", CANCELLED: "Stopped" } as const;

export function Options({ values }: { values: Record<string, string> }) {
  return Object.entries(values).map(([value, label]) => <option key={value} value={value}>{label}</option>);
}

/** "27821234567" → "+27 82 123 4567" */
export function formatPhone(phone: string | null) {
  if (!phone) return "";
  return phone.startsWith("27") && phone.length === 11 ? `+27 ${phone.slice(2, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : `+${phone}`;
}

const tabs = [
  { href: "/marketing", label: "Contacts" },
  { href: "/marketing/campaigns", label: "Campaigns" },
  { href: "/marketing/whatsapp", label: "WhatsApp" },
];

export function MarketingTabs({ active, badge }: { active: string; badge?: number }) {
  return (
    <nav aria-label="Marketing" className="-mt-2 mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={active === tab.href ? "page" : undefined}
          className={cx(
            "-mb-px inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
            active === tab.href ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {tab.label}
          {tab.href === "/marketing/whatsapp" && badge ? <span className="num rounded-full bg-brand px-1.5 text-xs text-white">{badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
