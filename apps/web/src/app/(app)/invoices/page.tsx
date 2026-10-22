import Link from "next/link";
import { parseAmountToCents, parseDateRange } from "@aah/core";
import type { Prisma } from "@aah/db";
import { InvoiceStatusBadge } from "@/components/status";
import { ButtonLink, Card, Empty, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { formatCalendarDate, formatCents, humanise } from "@/lib/format";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Invoices" };

const PAGE_SIZE = 50;
const STATUSES = ["CAPTURED", "NEEDS_REVIEW", "APPROVED", "POSTED", "REJECTED"] as const;

type Params = { client?: string; status?: string; from?: string; to?: string; min?: string; max?: string; page?: string };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { db } = await requireStaff();
  const p = await searchParams;
  const pageNo = Math.max(1, Number.parseInt(p.page ?? "1", 10) || 1);

  const and: Prisma.InvoiceWhereInput[] = [{ deletedAt: null }];
  if (p.client) and.push({ clientId: p.client });
  if (p.status && (STATUSES as readonly string[]).includes(p.status)) and.push({ status: p.status as (typeof STATUSES)[number] });
  const from = p.from ? parseDateRange(p.from) : null;
  const to = p.to ? parseDateRange(p.to) : null;
  if (from) and.push({ issueDate: { gte: from.from } });
  if (to) and.push({ issueDate: { lt: to.to } });
  const min = p.min ? parseAmountToCents(p.min) : null;
  const max = p.max ? parseAmountToCents(p.max) : null;
  if (min !== null) and.push({ totalCents: { gte: min } });
  if (max !== null) and.push({ totalCents: { lte: max } });
  const where: Prisma.InvoiceWhereInput = { AND: and };

  const [invoices, total, sum, clients] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: PAGE_SIZE,
      skip: (pageNo - 1) * PAGE_SIZE,
      include: { client: { select: { id: true, name: true } }, supplier: { select: { name: true } } },
    }),
    db.invoice.count({ where }),
    db.invoice.aggregate({ where, _sum: { totalCents: true } }),
    db.client.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (page: number) => `/invoices?${new URLSearchParams({ ...(p as Record<string, string>), page: String(page) })}`;

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={`${total} invoice${total === 1 ? "" : "s"} · ${formatCents(sum._sum.totalCents ?? 0n)} total`}
        actions={
          <>
            <ButtonLink
              variant="secondary"
              href={`/invoices/export?${new URLSearchParams(Object.fromEntries(Object.entries({ client: p.client, from: p.from, to: p.to }).filter(([, v]) => v)) as Record<string, string>)}`}
              prefetch={false}
            >
              Export for Analiva (CSV)
            </ButtonLink>
            <ButtonLink href="/invoices/new">Capture invoice</ButtonLink>
          </>
        }
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <Select name="client" defaultValue={p.client ?? ""} className="lg:col-span-2" aria-label="Client">
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={p.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanise(s)}
            </option>
          ))}
        </Select>
        <Input name="from" type="date" defaultValue={p.from} aria-label="From date" />
        <Input name="to" type="date" defaultValue={p.to} aria-label="To date" />
        <Input name="min" defaultValue={p.min} placeholder="Min total" aria-label="Minimum total" />
        <div className="flex gap-2">
          <Input name="max" defaultValue={p.max} placeholder="Max total" aria-label="Maximum total" />
          <button className="rounded-md border border-line bg-panel px-3 text-sm hover:bg-canvas">Apply</button>
        </div>
      </form>
      <Card>
        {invoices.length === 0 ? (
          <Empty>No invoices match.</Empty>
        ) : (
          <Table head={["Date", "Number", "Client", "Supplier / customer", "Total", "Status"]}>
            {invoices.map((i) => (
              <tr key={i.id} className="hover:bg-canvas">
                <Td className="tabular whitespace-nowrap">{formatCalendarDate(i.issueDate)}</Td>
                <Td>
                  <Link href={`/invoices/${i.id}`} className="font-medium text-brand hover:underline">
                    {i.invoiceNumber}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/clients/${i.client.id}`} className="hover:underline">
                    {i.client.name}
                  </Link>
                </Td>
                <Td>{i.supplier?.name ?? "—"}</Td>
                <Td className="tabular whitespace-nowrap text-right">{formatCents(i.totalCents, i.currency)}</Td>
                <Td>
                  <InvoiceStatusBadge status={i.status} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Page {pageNo} of {pages}
          </span>
          <div className="flex gap-2">
            {pageNo > 1 ? <ButtonLink variant="secondary" href={qs(pageNo - 1)}>Previous</ButtonLink> : null}
            {pageNo < pages ? <ButtonLink variant="secondary" href={qs(pageNo + 1)}>Next</ButtonLink> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
