import { isPracticeRole } from "@aah/core";
import { CommandBar } from "@/components/shell/command-bar";
import { Sidebar, type NavSection } from "@/components/shell/sidebar";
import { humanise } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, practice, ctx, db } = await requireSession();
  const staff = isPracticeRole(ctx.role);
  const [waiting, bankToCode, enquiriesWaiting] = staff
    ? await Promise.all([
        db.capture.count({ where: { status: { in: ["NEEDS_CLIENT", "SUGGESTED", "NEEDS_REVIEW", "FAILED"] } } }),
        db.bankTransaction.count({ where: { status: "UNMATCHED" } }),
        db.enquiry.count({ where: { status: "OPEN" } }),
      ])
    : [0, 0, await db.enquiry.count({ where: { status: "AWAITING_CLIENT" } })];

  const sections: NavSection[] = staff
    ? [
        {
          title: "Work",
          items: [
            { href: "/", label: "Dashboard", icon: "dashboard", exact: true },
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
            { href: "/lookup", label: "Lookup", icon: "lookup" },
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
          ],
        },
      ];

  return (
    <div className="app-backdrop min-h-screen md:flex">
      <Sidebar sections={sections} user={{ name: user.name, role: humanise(user.role) }} practiceName={practice.name} />
      <div className="min-w-0 flex-1">
        {staff ? (
          <div className="no-print sticky top-0 z-20 hidden items-center gap-4 border-b border-line bg-canvas/80 px-8 py-3 backdrop-blur md:flex">
            <CommandBar />
          </div>
        ) : null}
        <main className="fade-in px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
