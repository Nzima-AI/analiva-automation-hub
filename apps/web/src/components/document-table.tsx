import Link from "next/link";
import { classifyDocument, deleteDocument } from "@/app/(app)/documents/actions";
import { Badge, Button, Empty, Select, Table, Td } from "@/components/ui";
import { DOCUMENT_KINDS } from "@/lib/documents";
import { formatBytes, formatDateTime, humanise } from "@/lib/format";

interface Row {
  id: string;
  filename: string;
  kind: string;
  needsClassificationReview?: boolean;
  classificationMethod?: string | null;
  source: string;
  sizeBytes: number;
  createdAt: Date;
  client?: { id: string; name: string } | null;
  uploadedBy?: { name: string } | null;
}

export function DocumentTable({ documents, showClient, canDelete, canClassify }: { documents: Row[]; showClient?: boolean; canDelete?: boolean; canClassify?: boolean }) {
  if (documents.length === 0) return <Empty>No documents yet.</Empty>;
  return (
    <Table mobilePreview={showClient ? 2 : 1} head={["File", ...(showClient ? ["Client"] : []), "Type", "Size", "Added", ""]}>
      {documents.map((d) => (
        <tr key={d.id} className="hover:bg-canvas">
          <Td>
            <a href={`/documents/${d.id}/download?view=1`} target="_blank" rel="noopener" className="font-medium text-brand hover:underline">
              {d.filename}
            </a>
            <div className="text-xs text-muted">
              {humanise(d.source)}
              {d.uploadedBy ? ` · ${d.uploadedBy.name}` : ""}
            </div>
          </Td>
          {showClient ? (
            <Td>{d.client ? <Link href={`/clients/${d.client.id}`} className="hover:underline">{d.client.name}</Link> : <span className="text-muted">Practice</span>}</Td>
          ) : null}
          <Td>
            <Badge tone={canClassify && d.needsClassificationReview ? "warn" : "neutral"}>
              {canClassify && d.needsClassificationReview ? "Needs classification" : humanise(d.kind)}
            </Badge>
            {canClassify && d.classificationMethod === "ai" ? <p className="mt-1 text-xs text-muted">AI classified</p> : null}
            {canClassify && d.source === "EMAIL" ? (
              <details className="mt-2">
                <summary className="cursor-pointer whitespace-nowrap text-xs text-brand-text">{d.needsClassificationReview ? "Choose category" : "Change category"}</summary>
                <form action={classifyDocument.bind(null, d.id)} className="mt-2 flex items-center gap-2">
                  <Select name="kind" aria-label={`Category for ${d.filename}`} defaultValue={d.needsClassificationReview ? "" : d.kind} required>
                    <option value="" disabled>Choose category</option>
                    {DOCUMENT_KINDS.map((kind) => <option key={kind} value={kind}>{humanise(kind)}</option>)}
                  </Select>
                  <Button type="submit" size="sm" variant="secondary">Save</Button>
                </form>
              </details>
            ) : null}
          </Td>
          <Td className="tabular whitespace-nowrap">{formatBytes(d.sizeBytes)}</Td>
          <Td className="tabular whitespace-nowrap">{formatDateTime(d.createdAt)}</Td>
          <Td className="whitespace-nowrap text-right">
            <a href={`/documents/${d.id}/download`} className="text-sm text-muted hover:text-ink">
              Download
            </a>
            {canDelete ? (
              <form action={deleteDocument.bind(null, d.id)} className="ml-3 inline">
                <button className="text-sm text-danger hover:underline">Remove</button>
              </form>
            ) : null}
          </Td>
        </tr>
      ))}
    </Table>
  );
}
