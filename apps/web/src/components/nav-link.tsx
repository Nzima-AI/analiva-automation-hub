"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={
        "whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors " +
        (active ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-canvas hover:text-ink")
      }
    >
      {children}
    </Link>
  );
}
