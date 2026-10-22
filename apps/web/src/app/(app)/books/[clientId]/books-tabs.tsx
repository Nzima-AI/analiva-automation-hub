"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui";

export function BooksTabs({ clientId, toCode }: { clientId: string; toCode: number }) {
  const path = usePathname();
  const base = `/books/${clientId}`;
  const items = [
    { href: base, label: "Overview", active: path === base },
    { href: `${base}/bank`, label: "Bank", active: path.startsWith(`${base}/bank`), count: toCode },
    { href: `${base}/reports`, label: "Reports", active: path.startsWith(`${base}/reports`) },
    { href: `${base}/journals`, label: "Journals", active: path.startsWith(`${base}/journals`) },
    { href: `${base}/accounts`, label: "Chart of accounts", active: path.startsWith(`${base}/accounts`) },
  ];
  return <Tabs items={items} />;
}
