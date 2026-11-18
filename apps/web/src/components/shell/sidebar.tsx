"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, Briefcase, CalendarDots, ChatsCircle, FileText, Lifebuoy, FolderOpen, GearSix, List, ListChecks, MagnifyingGlass, Pulse, Receipt, SignOut, SquaresFour, Tray, UsersThree, X, type Icon } from "@phosphor-icons/react";
import { cx } from "@/components/ui";

const ICONS = {
  dashboard: SquaresFour,
  review: ListChecks,
  inbox: Tray,
  deadlines: CalendarDots,
  clients: Briefcase,
  lookup: MagnifyingGlass,
  invoices: Receipt,
  documents: FolderOpen,
  books: BookOpen,
  reports: FileText,
  activity: Pulse,
  team: UsersThree,
  settings: GearSix,
  enquiries: ChatsCircle,
  help: Lifebuoy,
} satisfies Record<string, Icon>;
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
          <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-white/35">{s.title}</p>
          <ul className="space-y-0.5">
            {s.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cx(
                      "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
                      active
                        ? "bg-white/[0.08] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-brand before:shadow-[0_0_12px_rgb(30_192_255/0.8)]"
                        : "text-white/65 hover:translate-x-0.5 hover:bg-white/[0.05] hover:text-white",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon weight={active ? "fill" : "regular"} className={cx("h-[18px] w-[18px] shrink-0 transition-colors", active ? "text-[#5fd3ff]" : "text-white/40 group-hover:text-white/75")} aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="num rounded-full bg-brand px-1.5 py-px text-[11px] font-semibold text-[#04111b]">{item.badge > 99 ? "99+" : item.badge}</span>
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
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#1ec0ff] to-[#0077b3] font-display text-sm font-bold text-white shadow-[0_8px_20px_-6px_rgb(30_192_255/0.6),inset_0_1px_0_rgb(255_255_255/0.35)]">A</span>
      <span className="leading-tight">
        <span className="block font-display text-sm font-semibold tracking-tight text-white">Analiva</span>
        <span className="block text-xs text-white/45">Automation Hub</span>
      </span>
    </Link>
  );

  const footer = (
    <div className="border-t border-white/[0.07] px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-white/15 to-white/5 text-xs font-semibold text-white ring-1 ring-white/10">
          {user.name
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-white/45">
            {user.role} · {practiceName}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
            <SignOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sidebar-ink sticky top-0 z-30 flex items-center justify-between px-4 py-2 md:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-white/80 hover:bg-white/10" aria-label="Open menu">
          <List className="h-5 w-5" />
        </button>
        <span className="font-display text-sm font-semibold text-white">Analiva Automation Hub</span>
        <span className="w-9" />
      </div>

      {/* Desktop */}
      <aside className="sidebar-ink sticky top-0 hidden h-screen w-64 shrink-0 flex-col md:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="sidebar-ink absolute inset-y-0 left-0 flex w-72 flex-col shadow-lg">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-white/60 hover:bg-white/10" aria-label="Close menu">
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
