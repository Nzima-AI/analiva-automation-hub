import { Button, ButtonLink, Card, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { captureInvoice } from "../actions";

export const metadata = { title: "Capture invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ error?: string; client?: string; document?: string }> }) {
  const { db } = await requireStaff();
  const { error, client: clientParam, document: documentParam } = await searchParams;
  const clients = await db.client.findMany({
    where: { deletedAt: null, status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });
  const documents = clientParam
    ? await db.document.findMany({
        where: { clientId: clientParam, deletedAt: null, invoices: { none: {} } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, filename: true },
      })
    : [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader title="Capture invoice" subtitle="Manual capture. Inbox capture with AI extraction arrives in Phase 2." />
      {error ? <Notice>{error}</Notice> : null}
      <Card>
        <form action={captureInvoice} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client">
              <Select name="clientId" required defaultValue={clientParam ?? ""}>
                <option value="" disabled>
                  Choose a client
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select name="direction" defaultValue="PAYABLE">
                <option value="PAYABLE">Supplier bill (payable)</option>
                <option value="RECEIVABLE">Sales invoice (receivable)</option>
              </Select>
            </Field>
            <Field label="Supplier / customer name">
              <Input name="supplierName" />
            </Field>
            <Field label="Their VAT number">
              <Input name="supplierVatNumber" inputMode="numeric" />
            </Field>
            <Field label="Invoice number">
              <Input name="invoiceNumber" required />
            </Field>
            <Field label="Invoice date">
              <Input name="issueDate" type="date" required defaultValue={today} />
            </Field>
            <Field label="Due date">
              <Input name="dueDate" type="date" />
            </Field>
            <Field label="Total (incl. VAT)" hint="e.g. 4 500,00 or 4500.00">
              <Input name="total" required inputMode="decimal" />
            </Field>
            <Field label="VAT">
              <Select name="vatMode" defaultValue="inclusive">
                <option value="inclusive">15% included in total</option>
                <option value="none">No VAT</option>
                <option value="explicit">Enter VAT amount</option>
              </Select>
            </Field>
            <Field label="VAT amount" hint="Only when 'Enter VAT amount' is chosen.">
              <Input name="vat" inputMode="decimal" />
            </Field>
            {clientParam ? (
              <Field label="Original document" className="sm:col-span-2">
                <Select name="sourceDocumentId" defaultValue={documentParam ?? ""}>
                  <option value="">None</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.filename}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Description" className="sm:col-span-2">
              <Textarea name="description" />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Capture invoice</Button>
            <ButtonLink href="/invoices" variant="secondary">
              Cancel
            </ButtonLink>
          </div>
        </form>
      </Card>
    </div>
  );
}
