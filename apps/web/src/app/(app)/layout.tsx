import Link from "next/link";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { PlatformTour } from "@/components/tour/platform-tour";
import { isPracticeRole } from "@aah/core";
import { ThemeToggle } from "@/components/shell/appearance";
import { CommandBar } from "@/components/shell/command-bar";
import { Sidebar, type NavSection } from "@/components/shell/sidebar";
import { humanise } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, practice, ctx, db } = await requireSession();
  const staff = isPracticeRole(ctx.role);
  const [waiting, bankToCode, enquiriesWaiting, repliesWaiting] = staff
    ? await Promise.all([
        db.capture.count({ where: { status: { in: ["NEEDS_CLIENT", "SUGGESTED", "NEEDS_REVIEW", "FAILED"] } } }),
        db.bankTransaction.count({ where: { status: "UNMATCHED" } }),
        db.enquiry.count({ where: { status: "OPEN" } }),
        db.whatsAppMessage.count({ where: { direction: "IN", handledAt: null, optOut: false } }),
      ])
    : [0, 0, await db.enquiry.count({ where: { status: "AWAITING_CLIENT" } }), 0];

  const sections: NavSection[] = staff
    ? [
        {
          title: "Work",
          items: [
            { href: "/", label: "Dashboard", icon: "dashboard", exact: true },
            { href: "/marketing", label: "WhatsApp marketing", icon: "whatsapp", badge: repliesWaiting },
            { href: "/review", label: "Review queue", icon: "review", badge: waiting },
            { href: "/enquiries", label: "Enquiries", icon: "enquiries", badge: enquiriesWaiting },
            { href: "/inbox", label: "Inbox", icon: "inbox" },
            { href: "/compliance", label: "Deadlines", icon: "deadlines" },
          ],
        },
        {
          title: "Clients",
          items: [
            { href: "/clients", label: "Clients", icon: "clients" },
            { href: "/lookup", label: "Records", icon: "lookup" },
          ],
        },
        {
          title: "Accounting",
          items: [
            { href: "/books", label: "Books & reports", icon: "books", badge: bankToCode },
            { href: "/invoices", label: "Invoices", icon: "invoices" },
            { href: "/documents", label: "Documents", icon: "documents" },
          ],
        },
        {
          title: "Practice",
          items: [
            { href: "/audit", label: "Activity log", icon: "activity" },
            ...(ctx.role === "OWNER" ? [{ href: "/team", label: "Team", icon: "team" as const }] : []),
            { href: "/settings", label: "Settings", icon: "settings" },
            { href: "/help", label: "Help", icon: "help" },
          ],
        },
      ]
    : [
        {
          title: "My business",
          items: [
            { href: "/portal", label: "Overview", icon: "dashboard", exact: true },
            { href: "/portal/reports", label: "Reports", icon: "reports" },
            { href: "/portal/invoices", label: "Invoices", icon: "invoices" },
            { href: "/portal/documents", label: "Documents", icon: "documents" },
          ],
        },
        {
          title: "Your accountant",
          items: [
            { href: "/portal/enquiries", label: "Enquiries", icon: "enquiries", badge: enquiriesWaiting },
            { href: "/portal/deadlines", label: "Deadlines", icon: "deadlines" },
            { href: "/portal/help", label: "Help", icon: "help" },
          ],
        },
      ];

  return (
    <div className="app-backdrop min-h-screen md:flex">
      <PlatformTour key={user.id} userId={user.id} staff={staff} />
      <Sidebar sections={sections} user={{ name: user.name, role: humanise(user.role) }} practiceName={practice.name} showTier={staff} />
      <div className="min-w-0 flex-1">
        <div className="shell-toolbar no-print sticky top-0 z-20 hidden items-center justify-between gap-4 px-7 md:flex">
          {staff ? <CommandBar /> : <span className="text-sm font-medium text-muted">{practice.name}</span>}
          <div className="flex items-center gap-2">
            {staff ? (
              <Link href="/marketing/campaigns" className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-line bg-panel px-3 text-[13px] font-medium text-ink shadow-xs transition-colors hover:border-line-strong hover:bg-subtle">
                <WhatsappLogo className="h-4 w-4 text-[#1faa59]" weight="fill" aria-hidden /> New campaign
              </Link>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
        <main className="px-4 py-6 md:px-8 md:py-9">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
