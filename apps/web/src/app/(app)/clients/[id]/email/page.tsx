import Link from "next/link";
import { notFound } from "next/navigation";
import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";
import { SendAsToggle } from "@/components/send-as-toggle";
import { Button, ButtonLink, Card, Field, Input, Notice, PageHeader, Textarea } from "@/components/ui";
import { sendAsOptions } from "@/lib/send-options";
import { requireStaff } from "@/lib/session";
import { sendClientMessage } from "../../../communications/actions";

export const metadata = { title: "Send email" };

export default async function ClientEmailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; to?: string }> }) {
  const { db, practice } = await requireStaff();
  const { id } = await params;
  const { error, to } = await searchParams;
  const client = await db.client.findFirst({ where: { id, deletedAt: null }, include: { contacts: { where: { email: { not: null } } } } });
  if (!client) notFound();
  const { options, error: setupError } = await sendAsOptions(db, client.id, practice.name);
  const recipients = [...(client.email ? [{ label: `${client.name} (${client.email})`, email: client.email }] : []), ...client.contacts.map((c) => ({ label: `${c.name} (${c.email})`, email: c.email! }))];

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow={
          <Link href={`/clients/${client.id}`} className="hover:underline">
            {client.name}
          </Link>
        }
        title="Send an email"
        subtitle="To the client, or to anyone on the client's behalf. Every send is logged on the client's record."
      />
      {error ? <Notice>{error}</Notice> : null}
      {setupError ? (
        <Notice tone="warn">
          {setupError} <Link href="/settings/email" className="underline">Email accounts</Link>
        </Notice>
      ) : (
        <Card icon={EnvelopeSimple} title="Compose">
          <form action={sendClientMessage.bind(null, client.id)} className="space-y-5">
            <SendAsToggle options={options} defaultValue="PRACTICE" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="To" className="sm:col-span-2">
                <Input name="to" type="email" required defaultValue={to ?? recipients[0]?.email ?? ""} list="recipients" />
                <datalist id="recipients">
                  {recipients.map((r) => (
                    <option key={r.email} value={r.email}>
                      {r.label}
                    </option>
                  ))}
                </datalist>
              </Field>
              <Field label="CC" hint="Optional" className="sm:col-span-2">
                <Input name="cc" />
              </Field>
              <Field label="Subject" className="sm:col-span-2">
                <Input name="subject" required />
              </Field>
              <Field label="Message" className="sm:col-span-2">
                <Textarea name="body" required rows={8} />
              </Field>
            </div>
            <div className="flex gap-2 border-t border-line pt-5">
              <Button type="submit">Send</Button>
              <ButtonLink href={`/clients/${client.id}`} variant="secondary">
                Cancel
              </ButtonLink>
            </div>
          </form>
        </Card>
      )}
      <p className="mt-3 text-xs text-faint">
        Sending in the client&apos;s name needs a signed mandate recorded on the client page.
      </p>
    </div>
  );
}
