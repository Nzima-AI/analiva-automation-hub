import Link from "next/link";
import { Badge, Card, Empty, Input, Table, Td } from "@/components/ui";
import { InvoiceStatusBadge } from "@/components/status";
import { formatBytes, formatCalendarDate, formatCents, formatDate, humanise } from "@/lib/format";
import { lookup } from "@/lib/search";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Lookup" };

type Params = { q?: string; from?: string; to?: string; amount?: string };

export default async function LookupPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { db } = await requireStaff();
  const params = await searchParams;
  const q = (params.q ?? "").slice(0, 200);
  const hasQuery = !!(q.trim() || params.from || params.to || params.amount);
  const results = hasQuery ? await lookup(db, { q, from: params.from, to: params.to, amount: params.amount }) : null;

  return (
    <div>
      <form className="mb-8" role="search">
        <label htmlFor="q" className="mb-2 block text-sm font-medium text-muted">
          Find anything: client, contact, phone, invoice number, amount, date, VAT or CIPC number
        </label>
        <div className="flex gap-2">
          <Input
            id="q"
            name="q"
            defaultValue={q}
            autoFocus
            autoComplete="off"
            placeholder="e.g. Mokoena · INV-0042 · R 4 500,00 · Mar 2023 · 082 123 4567"
            className="h-12 text-base"
          />
          <button className="h-12 rounded-md bg-brand px-5 text-sm font-medium text-white hover:bg-brand-strong">Search</button>
        </div>
        <details className="mt-3 text-sm" open={!!(params.from || params.to || params.amount)}>
          <summary className="cursor-pointer text-muted hover:text-ink">Filters</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Input name="from" defaultValue={params.from} placeholder="From date (e.g. 2022-01-01)" />
            <Input name="to" defaultValue={params.to} placeholder="To date (e.g. 2022-12-31)" />
            <Input name="amount" defaultValue={params.amount} placeholder="Exact total (e.g. 4500.00)" />
          </div>
        </details>
      </form>

      {!results ? (
        <p className="text-sm text-muted">Results appear here, grouped by clients, invoices and documents, across every year on record.</p>
      ) : (
        <div className="space-y-6">
          {results.dateRange ? (
            <p className="text-sm text-muted">
              Dates: {formatCalendarDate(results.dateRange.from)} to {formatCalendarDate(new Date(results.dateRange.to.getTime() - 1))}
            </p>
          ) : null}

          <Card title={`Clients (${results.clients.length})`}>
            {results.clients.length === 0 ? (
              <Empty>No matching clients.</Empty>
            ) : (
              <Table head={["Client", "Code", "Primary contact", "Phone", "Status"]}>
                {results.clients.map((c) => (
                  <tr key={c.id} className="hover:bg-canvas">
                    <Td>
                      <Link href={`/clients/${c.id}`} className="font-medium text-brand hover:underline">
                        {c.name}
                      </Link>
                      {c.tradingName ? <div className="text-xs text-muted">t/a {c.tradingName}</div> : null}
                    </Td>
                    <Td className="tabular">{c.code}</Td>
                    <Td>{c.contacts[0]?.name ?? "—"}</Td>
                    <Td className="tabular">{c.phone ?? "—"}</Td>
                    <Td>
                      <Badge>{humanise(c.status)}</Badge>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title={`Invoices (${results.invoices.length})`}>
            {results.invoices.length === 0 ? (
              <Empty>No matching invoices.</Empty>
            ) : (
              <Table head={["Date", "Number", "Client", "Supplier", "Total", "Status"]}>
                {results.invoices.map((i) => (
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

          <Card title={`Documents (${results.documents.length})`}>
            {results.documents.length === 0 ? (
              <Empty>No matching documents.</Empty>
            ) : (
              <Table head={["File", "Client", "Kind", "Size", "Added"]}>
                {results.documents.map((d) => (
                  <tr key={d.id} className="hover:bg-canvas">
                    <Td>
                      <a href={`/documents/${d.id}/download`} className="font-medium text-brand hover:underline">
                        {d.filename}
                      </a>
                    </Td>
                    <Td>{d.client ? <Link href={`/clients/${d.client.id}`}>{d.client.name}</Link> : "Practice"}</Td>
                    <Td>{humanise(d.kind)}</Td>
                    <Td className="tabular">{formatBytes(d.sizeBytes)}</Td>
                    <Td className="tabular whitespace-nowrap">{formatDate(d.createdAt)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
