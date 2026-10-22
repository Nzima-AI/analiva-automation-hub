import Link from "next/link";
import { deleteDocument } from "@/app/(app)/documents/actions";
import { Badge, Empty, Table, Td } from "@/components/ui";
import { formatBytes, formatDateTime, humanise } from "@/lib/format";

interface Row {
  id: string;
  filename: string;
  kind: string;
  source: string;
  sizeBytes: number;
  createdAt: Date;
  client?: { id: string; name: string } | null;
  uploadedBy?: { name: string } | null;
}

export function DocumentTable({ documents, showClient, canDelete }: { documents: Row[]; showClient?: boolean; canDelete?: boolean }) {
  if (documents.length === 0) return <Empty>No documents yet.</Empty>;
  return (
    <Table head={["File", ...(showClient ? ["Client"] : []), "Type", "Size", "Added", ""]}>
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
            <Badge>{humanise(d.kind)}</Badge>
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
