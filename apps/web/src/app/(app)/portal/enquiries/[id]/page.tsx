import Link from "next/link";
import { notFound } from "next/navigation";
import { EnquiryStatusBadge, EnquiryThread, ReplyBox, categoryLabel } from "@/components/enquiry-thread";
import { Button, Card, Notice, PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/session";
import { replyToEnquiry, setEnquiryStatus } from "../../../enquiries/actions";

export const metadata = { title: "Enquiry" };

export default async function PortalEnquiryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { db } = await requireClient();
  const { id } = await params;
  const { error, sent } = await searchParams;
  // Internal practice notes are never loaded for client logins.
  const enquiry = await db.enquiry.findFirst({ where: { id }, include: { messages: { where: { internal: false }, orderBy: { createdAt: "asc" } } } });
  if (!enquiry) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow={
          <Link href="/portal/enquiries" className="hover:underline">
            Enquiries
          </Link>
        }
        title={enquiry.subject}
        subtitle={
          <span className="flex items-center gap-2">
            <EnquiryStatusBadge status={enquiry.status} viewer="CLIENT" /> {categoryLabel(enquiry.category)}
          </span>
        }
        actions={
          <form action={setEnquiryStatus.bind(null, enquiry.id, enquiry.status === "RESOLVED" ? "OPEN" : "RESOLVED")}>
            <Button variant="secondary">{enquiry.status === "RESOLVED" ? "Reopen" : "Mark resolved"}</Button>
          </form>
        }
      />
      {sent ? <Notice tone="positive">Sent. Your accountant has been notified.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      <Card>
        <EnquiryThread messages={enquiry.messages} viewer="CLIENT" />
        <div className="mt-6 border-t border-line pt-5">
          <ReplyBox action={replyToEnquiry.bind(null, enquiry.id)} staff={false} />
        </div>
      </Card>
    </div>
  );
}
