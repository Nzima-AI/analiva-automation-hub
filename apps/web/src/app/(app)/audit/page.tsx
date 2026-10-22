import Link from "next/link";
import { Card, Empty, PageHeader, Table, Td, ButtonLink } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Activity log" };

const PAGE_SIZE = 100;

const ENTITY_LINKS: Record<string, (id: string) => string> = {
  Client: (id) => `/clients/${id}`,
  Invoice: (id) => `/invoices/${id}`,
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { db } = await requireStaff();
  const { page = "1" } = await searchParams;
  const pageNo = Math.max(1, Number.parseInt(page, 10) || 1);
  const [entries, total] = await Promise.all([
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: PAGE_SIZE, skip: (pageNo - 1) * PAGE_SIZE }),
    db.auditLog.count(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="Activity log" subtitle="Every capture, change, download and sign-in. Entries cannot be edited or deleted." />
      <Card>
        {entries.length === 0 ? (
          <Empty>No activity yet.</Empty>
        ) : (
          <Table head={["When", "Who", "Action", "Record", "Reason / details"]}>
            {entries.map((e) => {
              const href = ENTITY_LINKS[e.entityType]?.(e.entityId);
              const meta = e.metadata && typeof e.metadata === "object" ? Object.entries(e.metadata as Record<string, unknown>).filter(([, v]) => v !== null && v !== "") : [];
              return (
                <tr key={e.id}>
                  <Td className="tabular whitespace-nowrap">{formatDateTime(e.createdAt)}</Td>
                  <Td>{e.actorLabel ?? e.actorType}</Td>
                  <Td className="font-medium">{e.action}</Td>
                  <Td>{href ? <Link href={href} className="text-brand hover:underline">{e.entityType}</Link> : e.entityType}</Td>
                  <Td className="text-muted">
                    {e.reason ? <div>“{e.reason}”</div> : null}
                    {meta.length > 0 ? <div className="text-xs">{meta.map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</div> : null}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Page {pageNo} of {pages}
          </span>
          <div className="flex gap-2">
            {pageNo > 1 ? <ButtonLink variant="secondary" href={`/audit?page=${pageNo - 1}`}>Newer</ButtonLink> : null}
            {pageNo < pages ? <ButtonLink variant="secondary" href={`/audit?page=${pageNo + 1}`}>Older</ButtonLink> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
