import { DocumentTable } from "@/components/document-table";
import { DocumentUpload } from "@/components/document-upload";
import { Card, PageHeader } from "@/components/ui";
import { serverEnv } from "@/lib/env";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const { db } = await requireStaff();
  const [documents, clients] = await Promise.all([
    db.document.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { client: { select: { id: true, name: true } }, uploadedBy: { select: { name: true } } },
    }),
    db.client.findMany({ where: { deletedAt: null, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader title="Documents" subtitle="Originals exactly as received. Use Lookup to search older files." />
      <Card title="Upload" className="mb-6">
        <DocumentUpload bucket={serverEnv().documentsBucket} clients={clients} />
      </Card>
      <Card title="Latest 100">
        <DocumentTable documents={documents} showClient canDelete />
      </Card>
    </div>
  );
}
