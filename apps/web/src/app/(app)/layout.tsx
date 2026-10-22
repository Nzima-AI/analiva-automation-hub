import Link from "next/link";
import { isPracticeRole } from "@aah/core";
import { NavLink } from "@/components/nav-link";
import { humanise } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, practice, ctx, db } = await requireSession();
  const staff = isPracticeRole(ctx.role);
  const waiting = staff ? await db.capture.count({ where: { status: { in: ["NEEDS_CLIENT", "SUGGESTED", "NEEDS_REVIEW", "FAILED"] } } }) : 0;

  const nav = staff
    ? [
        { href: "/", label: "Lookup", exact: true },
        { href: "/review", label: waiting ? `Review queue (${waiting})` : "Review queue" },
        { href: "/inbox", label: "Inbox" },
        { href: "/clients", label: "Clients" },
        { href: "/invoices", label: "Invoices" },
        { href: "/documents", label: "Documents" },
        { href: "/audit", label: "Activity log" },
        ...(ctx.role === "OWNER" ? [{ href: "/team", label: "Team" }] : []),
        { href: "/settings", label: "Settings" },
      ]
    : [{ href: `/clients/${ctx.clientId}`, label: "My business" }];

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-panel md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <Link href="/" className="flex items-center gap-2.5 px-5 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">A</span>
          <span className="text-sm font-semibold leading-tight">
            Analiva
            <br />
            <span className="font-normal text-muted">Automation Hub</span>
          </span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible md:pb-0">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} exact={item.exact}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-line px-5 py-4 md:block">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted">
            {humanise(user.role)} · {practice.name}
          </p>
          <form action="/auth/signout" method="post" className="mt-2">
            <button className="text-xs text-muted hover:text-ink">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
