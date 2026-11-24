import Link from "next/link";
import { DocumentTable } from "@/components/document-table";
import { DocumentUpload } from "@/components/document-upload";
import { Button, Card, Notice, PageHeader, Select } from "@/components/ui";
import { DOCUMENT_KINDS, type DocumentKindValue } from "@/lib/documents";
import { humanise } from "@/lib/format";
import { serverEnv } from "@/lib/env";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: {
  searchParams: Promise<{ kind?: string; review?: string; error?: string }>;
}) {
  const { db } = await requireStaff();
  const params = await searchParams;
  const kind = DOCUMENT_KINDS.find((value): value is DocumentKindValue => value === params.kind);
  const review = params.review === "1";
  const [documents, clients, reviewCount] = await Promise.all([
    db.document.findMany({
      where: { deletedAt: null, ...(kind ? { kind } : {}), ...(review ? { needsClassificationReview: true } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { client: { select: { id: true, name: true } }, uploadedBy: { select: { name: true } } },
    }),
    db.client.findMany({ where: { deletedAt: null, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.document.count({ where: { deletedAt: null, needsClassificationReview: true } }),
  ]);

  return (
    <div>
      <PageHeader title="Documents" subtitle="Originals exactly as received. Use Lookup to search older files." />
      {params.error ? <Notice tone="warn">{params.error}</Notice> : null}
      <Card title="Upload" className="mb-6">
        <DocumentUpload bucket={serverEnv().documentsBucket} clients={clients} />
      </Card>
      <Card title={review ? "Needs classification" : "Latest 100"}>
        <form action="/documents" className="mb-5 flex flex-wrap items-center gap-2">
          {review ? <input type="hidden" name="review" value="1" /> : null}
          <Select name="kind" aria-label="Document category" defaultValue={kind ?? ""} className="max-w-56">
            <option value="">All categories</option>
            {DOCUMENT_KINDS.map((value) => <option key={value} value={value}>{humanise(value)}</option>)}
          </Select>
          <Button type="submit" size="sm" variant="secondary">Filter</Button>
          <Link href={review ? "/documents" : "/documents?review=1"} className="text-sm text-brand-text hover:underline">
            {review ? "Show all documents" : `Needs classification (${reviewCount})`}
          </Link>
        </form>
        <DocumentTable documents={documents} showClient canDelete canClassify />
      </Card>
    </div>
  );
}
