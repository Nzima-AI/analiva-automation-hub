"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  Briefcase,
  CalendarClock,
  FileText,
  FolderOpen,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Receipt,
  Search,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/components/ui";

const ICONS = {
  dashboard: LayoutDashboard,
  review: ListChecks,
  inbox: Inbox,
  deadlines: CalendarClock,
  clients: Briefcase,
  lookup: Search,
  invoices: Receipt,
  documents: FolderOpen,
  books: BookOpen,
  reports: FileText,
  activity: Activity,
  team: Users,
  settings: Settings,
} satisfies Record<string, LucideIcon>;
export type NavIcon = keyof typeof ICONS;

export interface NavSection {
  title: string;
  items: Array<{ href: string; label: string; icon: NavIcon; exact?: boolean; badge?: number }>;
}

export function Sidebar({
  sections,
  user,
  practiceName,
}: {
  sections: NavSection[];
  user: { name: string; role: string };
  practiceName: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scroll-thin" aria-label="Main">
      {sections.map((s) => (
        <div key={s.title}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{s.title}</p>
          <ul className="space-y-0.5">
            {s.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cx(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      active ? "bg-brand-soft font-medium text-brand-text" : "text-ink-2 hover:bg-subtle hover:text-ink",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className={cx("h-4 w-4 shrink-0", active ? "text-brand-text" : "text-faint group-hover:text-muted")} aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-brand px-1.5 py-px text-[11px] font-semibold text-white tabular">{item.badge > 99 ? "99+" : item.badge}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 px-5 py-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-deep font-display text-sm font-bold text-white shadow-sm">A</span>
      <span className="leading-tight">
        <span className="block font-display text-sm font-semibold text-ink">Analiva</span>
        <span className="block text-xs text-muted">Automation Hub</span>
      </span>
    </Link>
  );

  const footer = (
    <div className="border-t border-line px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-ink-2">
          {user.name
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{user.name}</p>
          <p className="truncate text-xs text-muted">
            {user.role} · {practiceName}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="rounded-md p-1.5 text-faint hover:bg-subtle hover:text-ink" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-panel/90 px-4 py-2 backdrop-blur md:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-2 hover:bg-subtle" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-display text-sm font-semibold">Analiva Automation Hub</span>
        <span className="w-9" />
      </div>

      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-panel md:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-panel shadow-lg">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted hover:bg-subtle" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      ) : null}
    </>
  );
}
