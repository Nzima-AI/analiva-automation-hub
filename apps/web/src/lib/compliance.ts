import "server-only";
import { deadlinesBetween, type Deadline } from "@aah/core";
import type { TenantDb } from "@aah/db";

export interface ClientDeadline extends Deadline {
  clientId: string;
  clientName: string;
  done: boolean;
  overdue: boolean;
}

/** Deadlines for every active client (or one), with done/overdue state. */
export async function clientDeadlines(db: TenantDb, range: { from: Date; to: Date; clientId?: string }): Promise<ClientDeadline[]> {
  const clients = await db.client.findMany({
    where: { deletedAt: null, status: { in: ["ACTIVE", "ONBOARDING"] }, ...(range.clientId ? { id: range.clientId } : {}) },
    select: {
      id: true,
      name: true,
      isCompany: true,
      vatRegistered: true,
      vatCategory: true,
      payeRegistered: true,
      financialYearEndMonth: true,
      incorporationDate: true,
      filings: { select: { periodKey: true } },
    },
  });
  const today = new Date(new Date().toISOString().slice(0, 10));
  const out: ClientDeadline[] = [];
  for (const c of clients) {
    const done = new Set(c.filings.map((f) => f.periodKey));
    const list = deadlinesBetween(
      {
        vatRegistered: c.vatRegistered,
        vatCategory: c.vatCategory === "A" || c.vatCategory === "B" || c.vatCategory === "C" ? c.vatCategory : null,
        payeRegistered: c.payeRegistered,
        financialYearEndMonth: c.financialYearEndMonth,
        isCompany: c.isCompany,
        incorporationDate: c.incorporationDate,
      },
      range.from,
      range.to,
    );
    for (const d of list) {
      const isDone = done.has(d.periodKey);
      out.push({ ...d, clientId: c.id, clientName: c.name, done: isDone, overdue: !isDone && d.dueDate < today });
    }
  }
  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}
