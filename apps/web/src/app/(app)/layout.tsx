import { isPracticeRole } from "@aah/core";
import { CommandBar } from "@/components/shell/command-bar";
import { Sidebar, type NavSection } from "@/components/shell/sidebar";
import { humanise } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, practice, ctx, db } = await requireSession();
  const staff = isPracticeRole(ctx.role);
  const [waiting, bankToCode] = staff
    ? await Promise.all([
        db.capture.count({ where: { status: { in: ["NEEDS_CLIENT", "SUGGESTED", "NEEDS_REVIEW", "FAILED"] } } }),
        db.bankTransaction.count({ where: { status: "UNMATCHED" } }),
      ])
    : [0, 0];

  const sections: NavSection[] = staff
    ? [
        {
          title: "Work",
          items: [
            { href: "/", label: "Dashboard", icon: "dashboard", exact: true },
            { href: "/review", label: "Review queue", icon: "review", badge: waiting },
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
    : [{ title: "My business", items: [{ href: `/clients/${ctx.clientId}`, label: "Overview", icon: "clients" }] }];

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
