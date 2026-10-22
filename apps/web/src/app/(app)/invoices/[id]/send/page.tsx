import Link from "next/link";
import { notFound } from "next/navigation";
import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";
import { formatCents } from "@aah/core";
import { SendAsToggle } from "@/components/send-as-toggle";
import { Button, ButtonLink, Card, Field, Input, Notice, PageHeader, Textarea } from "@/components/ui";
import { formatCalendarDate } from "@/lib/format";
import { sendAsOptions } from "@/lib/send-options";
import { requireStaff } from "@/lib/session";
import { sendInvoiceReminder } from "../../../communications/actions";

export const metadata = { title: "Send reminder" };

export default async function SendReminderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { db, practice } = await requireStaff();
  const { id } = await params;
  const { error } = await searchParams;
  const invoice = await db.invoice.findFirst({
    where: { id, deletedAt: null },
    include: { client: { select: { id: true, name: true, tradingName: true, defaultSendAs: true } }, supplier: true, sourceDocument: { select: { filename: true } } },
  });
  if (!invoice) notFound();
  const { options, error: setupError } = await sendAsOptions(db, invoice.clientId, practice.name);
  const outstanding = invoice.totalCents - invoice.amountPaidCents;
  const receivable = invoice.direction === "RECEIVABLE";

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow={
          <Link href={`/invoices/${invoice.id}`} className="hover:underline">
            Invoice {invoice.invoiceNumber}
          </Link>
        }
        title="Send a payment reminder"
        subtitle={`${formatCents(outstanding, invoice.currency)} outstanding${invoice.dueDate ? `, due ${formatCalendarDate(invoice.dueDate)}` : ""}. ${receivable ? `Goes to ${invoice.supplier?.name ?? "the customer"}.` : "This is a supplier bill: reminders normally go to customers."}`}
      />
      {error ? <Notice>{error}</Notice> : null}
      {setupError ? (
        <Notice tone="warn">
          {setupError} <Link href="/settings/email" className="underline">Email accounts</Link>
        </Notice>
      ) : (
        <Card icon={EnvelopeSimple} title="Compose">
          <form action={sendInvoiceReminder.bind(null, invoice.id)} className="space-y-5">
            <SendAsToggle options={options} defaultValue={invoice.client.defaultSendAs} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="To">
                <Input name="to" type="email" required defaultValue={invoice.supplier?.email ?? ""} />
              </Field>
              <Field label="Recipient name">
                <Input name="recipientName" defaultValue={invoice.supplier?.name ?? ""} />
              </Field>
              <Field label="CC" hint="Optional, comma separated" className="sm:col-span-2">
                <Input name="cc" />
              </Field>
              <Field label="Message" hint="Leave blank for the standard friendly reminder." className="sm:col-span-2">
                <Textarea name="message" rows={4} />
              </Field>
              <Field label="Payment details" hint="Bank, account number and the reference to use" className="sm:col-span-2">
                <Textarea name="paymentDetails" rows={3} />
              </Field>
            </div>
            <div className="space-y-2 text-sm">
              {invoice.sourceDocument ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="attachOriginal" defaultChecked className="accent-[var(--brand)]" /> Attach the original invoice ({invoice.sourceDocument.filename})
                </label>
              ) : null}
              {invoice.supplierId ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="saveEmail" defaultChecked={!invoice.supplier?.email} className="accent-[var(--brand)]" /> Save this address for {invoice.supplier?.name}
                </label>
              ) : null}
            </div>
            <div className="flex gap-2 border-t border-line pt-5">
              <Button type="submit">Send reminder</Button>
              <ButtonLink href={`/invoices/${invoice.id}`} variant="secondary">
                Cancel
              </ButtonLink>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
