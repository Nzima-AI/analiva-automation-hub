"use server";

import { formatCents } from "@aah/core";
import { lookup } from "@/lib/search";
import { requireStaff } from "@/lib/session";

export interface CommandResult {
  group: "Clients" | "Invoices" | "Documents";
  label: string;
  detail: string;
  href: string;
}

/** Quick results for the Ctrl+K command bar. Same search as the Lookup screen. */
export async function quickSearch(q: string): Promise<CommandResult[]> {
  const { db } = await requireStaff();
  const text = q.trim().slice(0, 120);
  if (text.length < 2) return [];
  const r = await lookup(db, { q: text });
  return [
    ...r.clients.slice(0, 5).map((c) => ({ group: "Clients" as const, label: c.name, detail: `${c.code}${c.phone ? ` · ${c.phone}` : ""}`, href: `/clients/${c.id}` })),
    ...r.invoices.slice(0, 6).map((i) => ({
      group: "Invoices" as const,
      label: `${i.invoiceNumber} · ${i.supplier?.name ?? i.client.name}`,
      detail: `${i.client.name} · ${formatCents(i.totalCents, i.currency)} · ${i.issueDate.toISOString().slice(0, 10)}`,
      href: `/invoices/${i.id}`,
    })),
    ...r.documents.slice(0, 4).map((d) => ({ group: "Documents" as const, label: d.filename, detail: d.client?.name ?? "Practice", href: `/documents/${d.id}/download?view=1` })),
  ];
}
