import Link from "next/link";
import { ChatsCircle, Plus } from "@phosphor-icons/react/dist/ssr";
import { EnquiryStatusBadge, categoryLabel } from "@/components/enquiry-thread";
import { ButtonLink, Card, Empty, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requireClient } from "@/lib/session";

export const metadata = { title: "Enquiries" };

export default async function PortalEnquiriesPage() {
  const { db, clientId } = await requireClient();
  const enquiries = await db.enquiry.findMany({ where: { clientId }, orderBy: { lastMessageAt: "desc" }, take: 100 });
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Enquiries"
        subtitle="Ask about your books, tax, payroll or CIPC. Your accountant replies here and by email."
        actions={
          <ButtonLink href="/portal/enquiries/new">
            <Plus className="h-4 w-4" /> New enquiry
          </ButtonLink>
        }
      />
      <Card padded={false}>
        {enquiries.length === 0 ? (
          <Empty icon={ChatsCircle} action={<ButtonLink href="/portal/enquiries/new" size="sm">Ask a question</ButtonLink>}>
            No enquiries yet.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {enquiries.map((e) => (
              <li key={e.id}>
                <Link href={`/portal/enquiries/${e.id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-subtle/70">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium group-hover:text-brand-text">{e.subject}</span>
                    <span className="block text-xs text-muted">
                      {categoryLabel(e.category)} · {formatDateTime(e.lastMessageAt)}
                    </span>
                  </span>
                  <EnquiryStatusBadge status={e.status} viewer="CLIENT" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
