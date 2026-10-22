import Link from "next/link";
import { ChatsCircle } from "@phosphor-icons/react/dist/ssr";
import { Card, Empty, PageHeader, Tabs } from "@/components/ui";
import { EnquiryStatusBadge, categoryLabel } from "@/components/enquiry-thread";
import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Enquiries" };

const VIEWS = [
  { key: "OPEN", label: "Waiting on us" },
  { key: "AWAITING_CLIENT", label: "Waiting on clients" },
  { key: "RESOLVED", label: "Resolved" },
] as const;

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { db } = await requireStaff();
  const { view } = await searchParams;
  const status = VIEWS.find((v) => v.key === view)?.key ?? "OPEN";
  const [enquiries, counts] = await Promise.all([
    db.enquiry.findMany({
      where: { status },
      orderBy: { lastMessageAt: status === "OPEN" ? "asc" : "desc" },
      take: 100,
      include: { client: { select: { id: true, name: true } }, messages: { where: { internal: false }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    db.enquiry.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = (k: string) => counts.find((c) => c.status === k)?._count._all ?? 0;

  return (
    <div>
      <PageHeader title="Enquiries" subtitle="Questions and requests clients raise in their portal. Oldest waiting first." />
      <Tabs items={VIEWS.map((v) => ({ href: `/enquiries?view=${v.key}`, label: v.label, active: v.key === status, count: count(v.key) }))} />
      <Card padded={false}>
        {enquiries.length === 0 ? (
          <Empty icon={ChatsCircle}>{status === "OPEN" ? "No client is waiting on a reply." : "Nothing here."}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {enquiries.map((e) => (
              <li key={e.id}>
                <Link href={`/enquiries/${e.id}`} className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-subtle/70">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink group-hover:text-brand-text">{e.subject}</p>
                    <p className="truncate text-sm text-muted">
                      {e.client.name} · {categoryLabel(e.category)}
                    </p>
                    {e.messages[0] ? <p className="mt-1 line-clamp-1 text-sm text-faint">{e.messages[0].authorName}: {e.messages[0].body}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <EnquiryStatusBadge status={e.status} viewer="PRACTICE" />
                    <p className="mt-1 text-xs text-faint tabular">{formatDateTime(e.lastMessageAt)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
