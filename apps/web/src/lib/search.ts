import "server-only";
import { parseDateRange, parseLookupQuery, parseAmountToCents, type DateRange } from "@aah/core";
import type { Prisma, TenantDb } from "@aah/db";

export interface LookupFilters {
  q: string;
  from?: string;
  to?: string;
  amount?: string;
}

const LIMIT = 25;

/**
 * One search box across all years. Every reading of the query (name, invoice number,
 * amount, date, phone, registration, VAT) is tried at once; tenant scoping is applied
 * by the TenantDb, so this never needs to mention practiceId.
 */
export async function lookup(db: TenantDb, filters: LookupFilters) {
  const q = parseLookupQuery(filters.q);
  const text = q.text;

  const explicitRange = rangeFrom(filters.from, filters.to);
  const explicitAmount = filters.amount ? parseAmountToCents(filters.amount) : null;

  // If the whole query is a date, treat it as a date filter rather than text.
  const dateRange = explicitRange ?? q.dateRange;
  const queryIsOnlyDate = !!q.dateRange && !q.amountCents && !q.invoiceNumber;
  const queryIsOnlyDateOrYear = !!q.dateRange && (queryIsOnlyDate || /^(19|20)\d{2}$/.test(text));

  const hasText = text.length >= 2 && !queryIsOnlyDate;

  // ---- Clients (and their contacts)
  const clientOr: Prisma.ClientWhereInput[] = [];
  if (hasText) {
    clientOr.push(
      { name: { contains: text, mode: "insensitive" } },
      { tradingName: { contains: text, mode: "insensitive" } },
      { code: { equals: text, mode: "insensitive" } },
      { email: { contains: text, mode: "insensitive" } },
      { emailDomains: { has: text.toLowerCase().replace(/^.*@/, "") } },
      { contacts: { some: { OR: [{ name: { contains: text, mode: "insensitive" } }, { email: { contains: text, mode: "insensitive" } }] } } },
    );
  }
  if (q.phone) clientOr.push({ phone: q.phone }, { contacts: { some: { phone: q.phone } } });
  if (q.registrationNumber) clientOr.push({ registrationNumber: q.registrationNumber });
  if (q.vatNumber) clientOr.push({ vatNumber: q.vatNumber });

  // ---- Invoices
  const invoiceOr: Prisma.InvoiceWhereInput[] = [];
  if (q.invoiceNumber) invoiceOr.push({ invoiceNumberNorm: { contains: q.invoiceNumber } });
  if (q.amountCents !== null && q.amountCents > 0n) {
    invoiceOr.push({ totalCents: q.amountCents }, { subtotalCents: q.amountCents }, { vatCents: q.amountCents });
  }
  if (hasText) {
    invoiceOr.push(
      { supplier: { name: { contains: text, mode: "insensitive" } } },
      { client: { name: { contains: text, mode: "insensitive" } } },
      { description: { contains: text, mode: "insensitive" } },
    );
  }
  if (q.vatNumber) invoiceOr.push({ supplier: { vatNumber: q.vatNumber } });

  const invoiceAnd: Prisma.InvoiceWhereInput[] = [{ deletedAt: null }];
  if (dateRange) invoiceAnd.push({ issueDate: { gte: dateRange.from, lt: dateRange.to } });
  if (explicitAmount !== null) invoiceAnd.push({ totalCents: explicitAmount });
  // A pure date/year query lists that period's invoices; otherwise the text must match too.
  if (invoiceOr.length > 0 && !queryIsOnlyDateOrYear) invoiceAnd.push({ OR: invoiceOr });
  const runInvoices = invoiceOr.length > 0 || !!dateRange || explicitAmount !== null;

  // ---- Documents
  const runDocuments = hasText;

  const [clients, invoices, documents] = await Promise.all([
    clientOr.length > 0
      ? db.client.findMany({
          where: { deletedAt: null, OR: clientOr },
          orderBy: { name: "asc" },
          take: LIMIT,
          include: { contacts: { where: { isPrimary: true }, take: 1 } },
        })
      : Promise.resolve([]),
    runInvoices
      ? db.invoice.findMany({
          where: { AND: invoiceAnd },
          orderBy: { issueDate: "desc" },
          take: LIMIT,
          include: { client: { select: { id: true, name: true } }, supplier: { select: { name: true } } },
        })
      : Promise.resolve([]),
    runDocuments
      ? db.document.findMany({
          where: { deletedAt: null, filename: { contains: text, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
          take: LIMIT,
          include: { client: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
  ]);

  return { query: q, dateRange, clients, invoices, documents };
}

function rangeFrom(from?: string, to?: string): DateRange | null {
  const f = from ? parseDateRange(from) : null;
  const t = to ? parseDateRange(to) : null;
  if (!f && !t) return null;
  return { from: f?.from ?? new Date(Date.UTC(1990, 0, 1)), to: t?.to ?? new Date(Date.UTC(2999, 0, 1)) };
}
