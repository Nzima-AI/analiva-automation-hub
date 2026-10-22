import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, Notice, PageHeader } from "@/components/ui";
import { EnquiryStatusBadge, EnquiryThread, ReplyBox, categoryLabel } from "@/components/enquiry-thread";
import { requireStaff } from "@/lib/session";
import { replyToEnquiry, setEnquiryStatus } from "../actions";

export const metadata = { title: "Enquiry" };

export default async function EnquiryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { db } = await requireStaff();
  const { id } = await params;
  const { error } = await searchParams;
  const enquiry = await db.enquiry.findFirst({
    where: { id },
    include: { client: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!enquiry) notFound();

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow={
          <Link href={`/clients/${enquiry.client.id}`} className="hover:underline">
            {enquiry.client.name}
          </Link>
        }
        title={enquiry.subject}
        subtitle={
          <span className="flex items-center gap-2">
            <EnquiryStatusBadge status={enquiry.status} viewer="PRACTICE" /> {categoryLabel(enquiry.category)}
          </span>
        }
        actions={
          enquiry.status === "RESOLVED" ? (
            <form action={setEnquiryStatus.bind(null, enquiry.id, "OPEN")}>
              <Button variant="secondary">Reopen</Button>
            </form>
          ) : (
            <form action={setEnquiryStatus.bind(null, enquiry.id, "RESOLVED")}>
              <Button variant="secondary">Mark resolved</Button>
            </form>
          )
        }
      />
      {error ? <Notice>{error}</Notice> : null}
      <Card>
        <EnquiryThread messages={enquiry.messages} viewer="PRACTICE" />
        <div className="mt-6 border-t border-line pt-5">
          <ReplyBox action={replyToEnquiry.bind(null, enquiry.id)} staff />
        </div>
      </Card>
    </div>
  );
}
