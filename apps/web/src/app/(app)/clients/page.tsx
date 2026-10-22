import Link from "next/link";
import type { Prisma } from "@aah/db";
import { Badge, ButtonLink, Card, Empty, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { formatDate, humanise } from "@/lib/format";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Clients" };

const PAGE_SIZE = 50;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { db } = await requireStaff();
  const { q = "", status = "", page = "1" } = await searchParams;
  const pageNo = Math.max(1, Number.parseInt(page, 10) || 1);

  const where: Prisma.ClientWhereInput = { deletedAt: null };
  if (status) where.status = status as Prisma.ClientWhereInput["status"];
  else where.status = { not: "ARCHIVED" };
  if (q.trim()) {
    where.OR = [
      { name: { contains: q.trim(), mode: "insensitive" } },
      { tradingName: { contains: q.trim(), mode: "insensitive" } },
      { code: { contains: q.trim(), mode: "insensitive" } },
    ];
  }

  const [clients, total] = await Promise.all([
    db.client.findMany({
      where,
      orderBy: { name: "asc" },
      take: PAGE_SIZE,
      skip: (pageNo - 1) * PAGE_SIZE,
      include: { services: { where: { enabled: true } }, _count: { select: { invoices: true } } },
    }),
    db.client.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => `/clients?${new URLSearchParams({ q, status, page: String(p) })}`;

  return (
    <div>
      <PageHeader title="Clients" subtitle={`${total} client${total === 1 ? "" : "s"}`} actions={<ButtonLink href="/clients/new">New client</ButtonLink>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Filter by name or code" className="max-w-xs" />
        <Select name="status" defaultValue={status} className="max-w-[12rem]">
          <option value="">All active</option>
          {["PROSPECT", "ONBOARDING", "ACTIVE", "PAUSED", "ARCHIVED"].map((s) => (
            <option key={s} value={s}>
              {humanise(s)}
            </option>
          ))}
        </Select>
        <button className="rounded-md border border-line bg-panel px-3 text-sm hover:bg-canvas">Apply</button>
      </form>
      <Card>
        {clients.length === 0 ? (
          <Empty>
            No clients yet. <Link href="/clients/new" className="text-brand hover:underline">Add the first one</Link>.
          </Empty>
        ) : (
          <Table head={["Client", "Code", "Services", "Invoices", "Status", "Since"]}>
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-canvas">
                <Td>
                  <Link href={`/clients/${c.id}`} className="font-medium text-brand hover:underline">
                    {c.name}
                  </Link>
                  {c.tradingName ? <div className="text-xs text-muted">t/a {c.tradingName}</div> : null}
                </Td>
                <Td className="tabular">{c.code}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {c.services.map((s) => (
                      <Badge key={s.id} tone="brand">
                        {humanise(s.service)}
                      </Badge>
                    ))}
                  </div>
                </Td>
                <Td className="tabular">{c._count.invoices}</Td>
                <Td>
                  <Badge>{humanise(c.status)}</Badge>
                </Td>
                <Td className="tabular whitespace-nowrap">{formatDate(c.createdAt)}</Td>
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
