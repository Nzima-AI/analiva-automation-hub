import Link from "next/link";
import { notFound } from "next/navigation";
import { centsToDecimalString, type InvoiceField } from "@aah/core";
import { Badge, Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { readExtracted, type StoredField } from "@/lib/inbox/extracted";
import { requireStaff } from "@/lib/session";
import { dismissCapture, fileCapture, rereadCapture } from "../actions";

export const metadata = { title: "Review invoice" };

function Confidence({ f }: { f: StoredField | undefined }) {
  if (!f) return <span className="text-xs text-danger">not found</span>;
  const pct = Math.round(f.confidence * 100);
  return (
    <span className={"text-xs " + (pct >= 90 ? "text-brand" : pct >= 60 ? "text-muted" : "text-warn")} title={f.source}>
      {pct}% · {f.source}
    </span>
  );
}

export default async function ReviewItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { db } = await requireStaff();
  const { id } = await params;
  const { error } = await searchParams;
  const capture = await db.capture.findFirst({
    where: { id },
    include: {
      document: true,
      email: { select: { fromAddress: true, fromName: true, subject: true, receivedAt: true, matchCandidates: true, textPreview: true } },
      invoice: { select: { id: true } },
    },
  });
  if (!capture) notFound();
  const clients = await db.client.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } });

  const x = readExtracted(capture.extracted);
  const f = x.fields;
  const amount = (k: InvoiceField) => (f[k] ? centsToDecimalString(BigInt(f[k]!.value)) : "");
  const candidates = ((capture.email?.matchCandidates ?? []) as Array<{ clientId: string; score: number; reason: string }>).filter((c) =>
    clients.some((cl) => cl.id === c.clientId),
  );
  const done = capture.status === "FILED" || capture.status === "DISMISSED";
  const isImage = capture.document.mimeType.startsWith("image/");
  const viewUrl = `/documents/${capture.document.id}/download?view=1`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/review" className="text-sm text-muted hover:text-ink">
            ← Review queue
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{capture.document.filename}</h1>
          <p className="text-sm text-muted">
            {capture.email ? (
              <>
                From {capture.email.fromName ? `${capture.email.fromName} <${capture.email.fromAddress}>` : capture.email.fromAddress} ·{" "}
                {formatDateTime(capture.email.receivedAt)} · “{capture.email.subject}”
              </>
            ) : null}
          </p>
        </div>
        <Badge tone={capture.confidence >= 0.9 ? "brand" : capture.confidence >= 0.6 ? "neutral" : "warn"}>
          Read with {Math.round(capture.confidence * 100)}% confidence
        </Badge>
      </div>
      {error ? <Notice>{error}</Notice> : null}
      {capture.note ? <Notice tone="warn">{capture.note}</Notice> : null}
      {capture.issues.length ? <Notice tone="warn">Checks flagged: {capture.issues.join(", ").toLowerCase().replace(/_/g, " ")}</Notice> : null}
      {done ? (
        <Notice tone="brand">
          This item was {capture.status === "FILED" ? "filed" : "dismissed"}.{" "}
          {capture.invoice ? <Link href={`/invoices/${capture.invoice.id}`} className="underline">View the invoice</Link> : null}
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Original">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img src={viewUrl} alt={capture.document.filename} className="w-full rounded border border-line" />
          ) : (
            <iframe src={viewUrl} title={capture.document.filename} className="h-[75vh] w-full rounded border border-line" />
          )}
          <p className="mt-2 text-xs text-muted">
            Read by {x.method === "pdf-text" ? "PDF text" : x.method === "ocr" ? "OCR" : x.method}.{" "}
            <a href={`/documents/${capture.document.id}/download`} className="text-brand hover:underline">
              Download
            </a>
          </p>
          {!done && capture.documentText ? (
            <form action={rereadCapture.bind(null, capture.id)} className="mt-3">
              <Button variant="secondary">Re-read document</Button>
            </form>
          ) : null}
        </Card>

        <Card title={capture.status === "SUGGESTED" ? "Check and confirm" : "Fill in what's missing"}>
          <form action={fileCapture.bind(null, capture.id)}>
            <fieldset disabled={done} className="space-y-4">
              <Field label="Client">
                <Select name="clientId" required defaultValue={capture.clientId ?? (candidates.length === 1 ? candidates[0]!.clientId : "")}>
                  <option value="" disabled>
                    Choose the client
                  </option>
                  {candidates.length ? (
                    <optgroup label="Suggested">
                      {candidates.map((c) => {
                        const cl = clients.find((k) => k.id === c.clientId)!;
                        return (
                          <option key={c.clientId} value={c.clientId}>
                            {cl.name} ({Math.round(c.score * 100)}%: {c.reason})
                          </option>
                        );
                      })}
                    </optgroup>
                  ) : null}
                  <optgroup label="All clients">
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </Field>
              {clients.length === 0 ? (
                <p className="text-sm text-warn">
                  There are no clients yet. <Link href="/clients/new" className="underline">Add the client</Link> first, then come back.
                </p>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="rememberSender" defaultChecked={!capture.clientId} className="accent-brand" />
                Remember: mail from {capture.email?.fromAddress ?? "this sender"} belongs to this client
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Supplier" hint={undefined}>
                  <Input name="supplierName" required defaultValue={f.supplierName?.value ?? ""} />
                  <Confidence f={f.supplierName} />
                </Field>
                <Field label="Supplier VAT number">
                  <Input name="supplierVatNumber" defaultValue={f.supplierVatNumber?.value ?? ""} />
                  <Confidence f={f.supplierVatNumber} />
                </Field>
                <Field label="Invoice number">
                  <Input name="invoiceNumber" required defaultValue={f.invoiceNumber?.value ?? ""} />
                  <Confidence f={f.invoiceNumber} />
                </Field>
                <Field label="Type">
                  <Select name="direction" defaultValue="PAYABLE">
                    <option value="PAYABLE">Supplier bill</option>
                    <option value="RECEIVABLE">Sales invoice</option>
                  </Select>
                </Field>
                <Field label="Invoice date">
                  <Input name="issueDate" type="date" required defaultValue={f.issueDate?.value ?? ""} />
                  <Confidence f={f.issueDate} />
                </Field>
                <Field label="Due date">
                  <Input name="dueDate" type="date" defaultValue={f.dueDate?.value ?? ""} />
                  <Confidence f={f.dueDate} />
                </Field>
                <Field label="Amount excl. VAT">
                  <Input name="subtotal" inputMode="decimal" defaultValue={amount("subtotal")} />
                  <Confidence f={f.subtotal} />
                </Field>
                <Field label="VAT">
                  <Input name="vat" inputMode="decimal" defaultValue={amount("vat")} />
                  <Confidence f={f.vat} />
                </Field>
                <Field label="Total incl. VAT" className="sm:col-span-2">
                  <Input name="total" required inputMode="decimal" defaultValue={amount("total")} />
                  <Confidence f={f.total} />
                </Field>
                <Field label="Description" className="sm:col-span-2">
                  <Textarea name="description" defaultValue={capture.email?.subject ?? ""} />
                </Field>
              </div>
              <p className="text-xs text-muted">Anything you correct is remembered for this supplier&apos;s next invoice.</p>
              <Button type="submit" className="w-full">
                {capture.status === "SUGGESTED" ? "Confirm and file invoice" : "File invoice"}
              </Button>
            </fieldset>
          </form>
          {!done ? (
            <form action={dismissCapture.bind(null, capture.id)} className="mt-4 flex gap-2 border-t border-line pt-4">
              <Input name="reason" placeholder="Not an invoice? Say why (optional)" />
              <Button variant="secondary">Dismiss</Button>
            </form>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
