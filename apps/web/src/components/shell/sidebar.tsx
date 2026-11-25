"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import {
  ArrowUpRight, BookOpen, Briefcase, CalendarDots, ChatsCircle, FileText, FolderOpen, GearSix, Layout,
  Lifebuoy, List, ListChecks, MagnifyingGlass, Pulse, Receipt, SignOut, Sparkle, SquaresFour, Tray, UsersThree, WhatsappLogo, X,
  type Icon,
} from "@phosphor-icons/react";
import { CURRENT_TIER } from "@/lib/plan";
import { ThemeToggle, useSidebarAppearance } from "./appearance";

const ICONS = {
  dashboard: SquaresFour, review: ListChecks, inbox: Tray, deadlines: CalendarDots,
  clients: Briefcase, lookup: MagnifyingGlass, invoices: Receipt, documents: FolderOpen,
  books: BookOpen, reports: FileText, activity: Pulse, team: UsersThree, settings: GearSix,
  enquiries: ChatsCircle, help: Lifebuoy, whatsapp: WhatsappLogo,
} satisfies Record<string, Icon>;

export type NavIcon = keyof typeof ICONS;

export interface NavSection {
  title: string;
  items: Array<{ href: string; label: string; icon: NavIcon; exact?: boolean; badge?: number }>;
}

export function Sidebar({ sections, user, practiceName, showTier }: {
  sections: NavSection[];
  user: { name: string; role: string };
  practiceName: string;
  showTier: boolean;
}) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarAppearance();
  const drawer = useRef<HTMLDialogElement>(null);
  const drawerMotion = useRef<gsap.core.Tween | null>(null);
  const collapseLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const home = sections[0]?.items[0]?.href ?? "/";
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  useEffect(() => {
    drawer.current?.close();
  }, [pathname]);

  useEffect(() => {
    const desktop = matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) drawer.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      drawerMotion.current?.kill();
    };
  }, []);

  function openDrawer() {
    const dialog = drawer.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    drawerMotion.current?.kill();
    drawerMotion.current = gsap.fromTo(dialog, { xPercent: -100, opacity: 0.7 }, {
      xPercent: 0, opacity: 1, ease: "power4.out", duration: 0.42, clearProps: "transform,opacity",
    });
  }

  function navigation(onNavigate?: () => void) {
    return (
      <nav className="side-nav scroll-thin" aria-label="Main navigation">
        {sections.map((section) => (
          <div className="side-section" key={section.title}>
            <p className="side-section-title">{section.title}</p>
            <ul>
              {section.items.map((item) => {
                const ItemIcon = ICONS[item.icon];
                const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className="side-link"
                      aria-current={active ? "page" : undefined}
                      title={item.label}
                    >
                      <span className="side-link-icon" aria-hidden>
                        <ItemIcon size={17} weight={active ? "bold" : "regular"} />
                      </span>
                      <span className="side-link-label">{item.label}</span>
                      {item.badge ? <span className="side-badge tabular" aria-label={`${item.badge} items`}>{item.badge > 99 ? "99+" : item.badge}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  const brand = (
    <Link href={home} className="shell-brand" aria-label="Analiva home">
      <Image className="shell-mark" src="/brand/analiva-mark.png" width={490} height={400} alt="" unoptimized />
      <span className="shell-word"><strong>Analiva</strong><small>Automation Hub</small></span>
    </Link>
  );

  function tierCard(onNavigate?: () => void) {
    if (!showTier) return null;
    return (
      <Link
        href="/plans"
        className="side-tier"
        onClick={onNavigate}
        aria-label={`Current tier: ${CURRENT_TIER}. Upgrade tier`}
        title={`${CURRENT_TIER} tier · Upgrade tier`}
        aria-current={pathname === "/plans" ? "page" : undefined}
      >
        <span className="side-tier-icon"><Sparkle size={18} weight="duotone" aria-hidden /></span>
        <span className="side-tier-label"><strong>{CURRENT_TIER} tier</strong><small>Upgrade tier</small></span>
        <ArrowUpRight className="side-tier-arrow" size={15} aria-hidden />
      </Link>
    );
  }

  const footer = (
    <div className="side-footer">
      <span className="side-avatar" title={user.name}>{initials}</span>
      <div className="side-profile">
        <p>{user.name}</p>
        <small>{user.role} · {practiceName}</small>
      </div>
      <form action="/auth/signout" method="post">
        <button className="shell-icon" aria-label="Sign out" title="Sign out"><SignOut size={17} aria-hidden /></button>
      </form>
    </div>
  );

  return (
    <>
      <header className="mobile-toolbar shell-toolbar sticky top-0 z-30 flex md:hidden">
        <button type="button" className="shell-icon" onClick={openDrawer} aria-label="Open menu" aria-haspopup="dialog" aria-controls="mobile-navigation">
          <List size={22} aria-hidden />
        </button>
        {brand}
        <ThemeToggle />
      </header>
      <aside className="desktop-sidebar no-print" aria-label="Sidebar">
        <div className="side-head">
          {brand}
          <button type="button" className="shell-icon side-collapse" onClick={toggle} aria-label={collapseLabel} title={collapseLabel} aria-expanded={!collapsed}>
            <Layout size={18} weight="duotone" aria-hidden />
          </button>
        </div>
        {navigation()}
        {tierCard()}
        {footer}
      </aside>
      <dialog
        id="mobile-navigation"
        className="mobile-drawer no-print"
        ref={drawer}
        aria-label="Navigation"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX > bounds.right) event.currentTarget.close();
          }
        }}
      >
        <div className="side-head">
          {brand}
          <button type="button" className="shell-icon" onClick={() => drawer.current?.close()} aria-label="Close menu"><X size={20} aria-hidden /></button>
        </div>
        {navigation(() => drawer.current?.close())}
        {tierCard(() => drawer.current?.close())}
        {footer}
      </dialog>
    </>
  );
}
