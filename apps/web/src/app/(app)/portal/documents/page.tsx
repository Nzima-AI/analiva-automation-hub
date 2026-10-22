import { FolderOpen } from "@phosphor-icons/react/dist/ssr";
import { DocumentTable } from "@/components/document-table";
import { DocumentUpload } from "@/components/document-upload";
import { Card, PageHeader } from "@/components/ui";
import { serverEnv } from "@/lib/env";
import { requireClient } from "@/lib/session";

export const metadata = { title: "Documents" };

export default async function PortalDocumentsPage() {
  const { db, clientId } = await requireClient();
  const documents = await db.document.findMany({
    where: { clientId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { uploadedBy: { select: { name: true } } },
  });
  return (
    <div>
      <PageHeader title="Documents" subtitle="Send your accountant invoices, statements and paperwork. Everything you and your accountant share is kept here." />
      <Card title="Upload" icon={FolderOpen} className="mb-6">
        <DocumentUpload bucket={serverEnv().documentsBucket} clientId={clientId} />
        <p className="mt-3 text-xs text-faint">Invoices you upload here go to your accountant for capture.</p>
      </Card>
      <Card title="Your documents">
        <DocumentTable documents={documents} />
      </Card>
    </div>
  );
}
