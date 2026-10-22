import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceStatusBadge } from "@/components/status";
import { Button, Card, Input, Notice, PageHeader } from "@/components/ui";
import { formatCalendarDate, formatCents, formatDateTime, humanise } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { deleteInvoice, setInvoiceStatus } from "../actions";

export const metadata = { title: "Invoice" };

const ISSUE_TEXT: Record<string, string> = {
  TOTAL_MISMATCH: "Subtotal plus VAT does not equal the total.",
  VAT_MISMATCH: "VAT is not 15% of the subtotal.",
  LINES_MISMATCH: "Line totals do not add up to the subtotal.",
  INVALID_VAT_NUMBER: "Supplier VAT number is not a valid SA VAT number.",
  VAT_WITHOUT_VAT_NUMBER: "VAT was charged but there is no supplier VAT number.",
  NEGATIVE_TOTAL: "Total is negative.",
  SUSPECTED_DUPLICATE: "An invoice with this number from this supplier is already on record.",
};

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { db } = await requireStaff();
  const { id } = await params;
  const { error } = await searchParams;
  const invoice = await db.invoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      client: { select: { id: true, name: true, code: true } },
      supplier: true,
      sourceDocument: { select: { id: true, filename: true } },
      capturedBy: { select: { name: true } },
      lines: { orderBy: { position: "asc" } },
    },
  });
  if (!invoice) notFound();
  const history = await db.auditLog.findMany({
    where: { entityType: "Invoice", entityId: invoice.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const rows: Array<[string, React.ReactNode]> = [
    ["Client", <Link key="c" href={`/clients/${invoice.client.id}`} className="text-brand hover:underline">{invoice.client.name} ({invoice.client.code})</Link>],
    ["Type", invoice.direction === "PAYABLE" ? "Supplier bill" : "Sales invoice"],
    ["Supplier / customer", invoice.supplier?.name ?? "—"],
    ["Their VAT number", invoice.supplier?.vatNumber ?? "—"],
    ["Invoice date", formatCalendarDate(invoice.issueDate)],
    ["Due date", formatCalendarDate(invoice.dueDate)],
    ["Subtotal", formatCents(invoice.subtotalCents, invoice.currency)],
    ["VAT", formatCents(invoice.vatCents, invoice.currency)],
    ["Total", <strong key="t">{formatCents(invoice.totalCents, invoice.currency)}</strong>],
    ["Description", invoice.description ?? "—"],
  ];

  return (
    <div>
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        subtitle={
          <span className="flex items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} /> Captured {formatDateTime(invoice.capturedAt)} by {invoice.capturedBy?.name ?? humanise(invoice.captureSource)}
          </span>
        }
      />
      {error ? <Notice>{error}</Notice> : null}
      {invoice.validationIssues.length > 0 ? (
        <Notice tone="warn">
          <p className="font-medium">Needs review before it can go to Analiva</p>
          <ul className="mt-1 list-disc pl-5">
            {invoice.validationIssues.map((code) => (
              <li key={code}>{ISSUE_TEXT[code] ?? code}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Extracted data" className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="tabular">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="space-y-6">
          <Card title="Original document">
            {invoice.sourceDocument ? (
              <a href={`/documents/${invoice.sourceDocument.id}/download?view=1`} target="_blank" rel="noopener" className="text-sm text-brand hover:underline">
                {invoice.sourceDocument.filename}
              </a>
            ) : (
              <p className="text-sm text-muted">No original linked.</p>
            )}
          </Card>

          {invoice.status !== "POSTED" ? (
            <Card title="Review">
              <div className="flex flex-wrap gap-2">
                {invoice.status !== "APPROVED" ? (
                  <form action={setInvoiceStatus.bind(null, invoice.id, "APPROVED")}>
                    <Button>Approve</Button>
                  </form>
                ) : null}
                {invoice.status !== "REJECTED" ? (
                  <form action={setInvoiceStatus.bind(null, invoice.id, "REJECTED")}>
                    <Button variant="secondary">Reject</Button>
                  </form>
                ) : null}
              </div>
              <form action={deleteInvoice.bind(null, invoice.id)} className="mt-5 space-y-2 border-t border-line pt-4">
                <Input name="reason" placeholder="Reason for removing" required />
                <Button variant="danger" className="w-full">
                  Remove invoice
                </Button>
              </form>
            </Card>
          ) : null}

          <Card title="History">
            <ol className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">{h.action}</span> <span className="text-muted">· {h.actorLabel ?? h.actorType} · {formatDateTime(h.createdAt)}</span>
                  {h.reason ? <div className="text-muted">“{h.reason}”</div> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
