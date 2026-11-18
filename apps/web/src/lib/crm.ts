import "server-only";
import type { Prisma, TenantDb } from "@aah/db";
import type { Row } from "@/components/crm/data-table";
import { lookup } from "@/lib/search";

/** Builders that turn records into CRM table rows (plain JSON for the client table). */

const n = (c: bigint | null | undefined) => (c === null || c === undefined ? null : Number(c));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const join = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(" ");

export const CLIENT_LOAD = 2000;
export const CONTACT_LOAD = 3000;
export const INVOICE_LOAD = 2000;
export const DOCUMENT_LOAD = 1500;

export async function clientRows(db: TenantDb, where: Prisma.ClientWhereInput = {}): Promise<Row[]> {
  const [clients, owed, lastActivity] = await Promise.all([
    db.client.findMany({
      where: { deletedAt: null, ...where },
      orderBy: { name: "asc" },
      take: CLIENT_LOAD,
      include: { contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }, services: { where: { enabled: true } }, _count: { select: { invoices: true } } },
    }),
    db.invoice.groupBy({ by: ["clientId", "direction"], where: { deletedAt: null, status: { not: "REJECTED" } }, _sum: { totalCents: true, amountPaidCents: true } }),
    db.invoice.groupBy({ by: ["clientId"], where: { deletedAt: null }, _max: { capturedAt: true } }),
  ]);
  const outstanding = new Map<string, { payable: number; receivable: number }>();
  for (const g of owed) {
    const o = outstanding.get(g.clientId) ?? { payable: 0, receivable: 0 };
    const v = Number((g._sum.totalCents ?? 0n) - (g._sum.amountPaidCents ?? 0n));
    if (g.direction === "PAYABLE") o.payable += v;
    else o.receivable += v;
    outstanding.set(g.clientId, o);
  }
  const last = new Map(lastActivity.map((l) => [l.clientId, l._max.capturedAt]));
  return clients.map((c) => {
    const primary = c.contacts[0];
    const o = outstanding.get(c.id);
    return {
      id: c.id,
      href: `/clients/${c.id}`,
      search: join(c.name, c.tradingName, c.code, c.email, c.phone, c.registrationNumber, c.vatNumber, c.taxNumber, c.emailDomains.join(" "), ...c.contacts.flatMap((x) => [x.name, x.email, x.phone])),
      date: iso(last.get(c.id)),
      values: {
        name: c.name,
        trading: c.tradingName ? `t/a ${c.tradingName}` : c.code,
        code: c.code,
        status: c.status,
        services: c.services.map((s) => s.service.charAt(0) + s.service.slice(1).toLowerCase()).join(", ") || null,
        contact: primary?.name ?? null,
        contactSub: primary?.email ?? primary?.phone ?? null,
        phone: c.phone,
        email: c.email,
        vat: c.vatRegistered ? (c.vatNumber ?? "Registered") : null,
        invoices: c._count.invoices,
        payable: o?.payable ?? 0,
        receivable: o?.receivable ?? 0,
        lastActivity: iso(last.get(c.id)),
        mode: c.captureMode,
      },
    };
  });
}

export async function contactRows(db: TenantDb): Promise<Row[]> {
  const contacts = await db.contact.findMany({ orderBy: { name: "asc" }, take: CONTACT_LOAD, include: { client: { select: { id: true, name: true, deletedAt: true } } } });
  return contacts
    .filter((c) => !c.client.deletedAt)
    .map((c) => ({
      id: c.id,
      href: `/clients/${c.client.id}`,
      search: join(c.name, c.email, c.phone, c.position, c.client.name),
      values: { name: c.name, position: c.position, client: c.client.name, email: c.email, phone: c.phone, primary: c.isPrimary ? "PRIMARY" : null },
    }));
}

type InvoiceWithParties = Prisma.InvoiceGetPayload<{ include: { client: { select: { id: true; name: true } }; supplier: { select: { name: true; vatNumber: true } } } }>;

function invoiceRow(i: InvoiceWithParties): Row {
  const outstanding = Number(i.totalCents - i.amountPaidCents);
  return {
    id: i.id,
    href: `/invoices/${i.id}`,
    search: join(i.invoiceNumber, i.invoiceNumberNorm, i.client.name, i.supplier?.name, i.supplier?.vatNumber, i.description),
    amounts: [Number(i.totalCents), Number(i.subtotalCents), Number(i.vatCents)],
    date: iso(i.issueDate),
    values: {
      number: i.invoiceNumber,
      party: i.supplier?.name ?? null,
      client: i.client.name,
      clientId: i.client.id,
      direction: i.direction === "PAYABLE" ? "BILL" : "SALE",
      date: iso(i.issueDate),
      total: n(i.totalCents),
      outstanding: outstanding > 0 ? outstanding : 0,
      status: i.status,
      source: i.captureSource,
    },
  };
}

export async function invoiceRows(db: TenantDb): Promise<Row[]> {
  const invoices = await db.invoice.findMany({
    where: { deletedAt: null },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    take: INVOICE_LOAD,
    include: { client: { select: { id: true, name: true } }, supplier: { select: { name: true, vatNumber: true } } },
  });
  return invoices.map(invoiceRow);
}

/** Older invoices for a query (the table holds only the newest). */
export async function searchInvoiceRows(db: TenantDb, q: string): Promise<Row[]> {
  const r = await lookup(db, { q });
  if (r.invoices.length === 0) return [];
  const full = await db.invoice.findMany({
    where: { id: { in: r.invoices.map((i) => i.id) } },
    include: { client: { select: { id: true, name: true } }, supplier: { select: { name: true, vatNumber: true } } },
  });
  return full.map(invoiceRow);
}

export async function documentRows(db: TenantDb, where: Prisma.DocumentWhereInput = {}): Promise<Row[]> {
  const docs = await db.document.findMany({
    where: { deletedAt: null, ...where },
    orderBy: { createdAt: "desc" },
    take: DOCUMENT_LOAD,
    include: { client: { select: { name: true } }, uploadedBy: { select: { name: true } } },
  });
  return docs.map((d) => ({
    id: d.id,
    href: `/documents/${d.id}/download?view=1`,
    search: join(d.filename, d.client?.name, d.kind, d.uploadedBy?.name),
    date: iso(d.createdAt),
    values: {
      filename: d.filename,
      client: d.client?.name ?? "Practice",
      kind: d.kind,
      source: d.source,
      size: d.sizeBytes < 1024 * 1024 ? `${Math.max(1, Math.round(d.sizeBytes / 1024))} KB` : `${(d.sizeBytes / 1024 / 1024).toFixed(1)} MB`,
      added: iso(d.createdAt),
      by: d.uploadedBy?.name ?? (d.source === "EMAIL" ? "Inbox" : null),
    },
  }));
}

export async function searchDocumentRows(db: TenantDb, q: string): Promise<Row[]> {
  const words = q.trim().split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
  if (!words.length) return [];
  return documentRows(db, { AND: words.map((w) => ({ OR: [{ filename: { contains: w, mode: "insensitive" as const } }, { client: { name: { contains: w, mode: "insensitive" as const } } }] })) });
}
