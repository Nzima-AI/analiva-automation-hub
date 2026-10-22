import Link from "next/link";
import { notFound } from "next/navigation";
import { isPracticeRole, SERVICES } from "@aah/core";
import { DocumentTable } from "@/components/document-table";
import { DocumentUpload } from "@/components/document-upload";
import { InvoiceStatusBadge } from "@/components/status";
import { Badge, Button, ButtonLink, Card, Empty, Field, Input, Notice, PageHeader, Table, Td } from "@/components/ui";
import { serverEnv } from "@/lib/env";
import { formatCalendarDate, formatCents, formatDateTime, humanise } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { addContact, deleteContact, toggleService } from "../actions";

export const metadata = { title: "Client" };

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { db, ctx } = await requireSession();
  const staff = isPracticeRole(ctx.role);
  const { id } = await params;
  const { error } = await searchParams;

  const client = await db.client.findFirst({
    where: { id, deletedAt: null },
    include: { contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }, services: true },
  });
  if (!client) notFound();

  const [invoices, invoiceCount, documents, activity] = await Promise.all([
    db.invoice.findMany({
      where: { clientId: client.id, deletedAt: null },
      orderBy: { issueDate: "desc" },
      take: 15,
      include: { supplier: { select: { name: true } } },
    }),
    db.invoice.count({ where: { clientId: client.id, deletedAt: null } }),
    db.document.findMany({
      where: { clientId: client.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { uploadedBy: { select: { name: true } } },
    }),
    staff
      ? db.auditLog.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" }, take: 15 })
      : Promise.resolve([]),
  ]);
  const enabled = new Set(client.services.filter((s) => s.enabled).map((s) => s.service));

  const profile: Array<[string, string | null]> = [
    ["Trading as", client.tradingName],
    ["CIPC registration", client.registrationNumber],
    ["VAT number", client.vatNumber],
    ["Income tax number", client.taxNumber],
    ["Email", client.email],
    ["Phone", client.phone],
    ["Email domains", client.emailDomains.join(", ") || null],
  ];

  return (
    <div>
      <PageHeader
        title={client.name}
        subtitle={
          <span className="flex items-center gap-2">
            {client.code} <Badge>{humanise(client.status)}</Badge>
          </span>
        }
        actions={
          staff ? (
            <>
              <ButtonLink href={`/invoices/new?client=${client.id}`}>Capture invoice</ButtonLink>
              <ButtonLink href={`/clients/${client.id}/edit`} variant="secondary">
                Edit
              </ButtonLink>
            </>
          ) : undefined
        }
      />
      {error ? <Notice>{error}</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Profile">
            <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[11rem_1fr]">
              {profile.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="tabular">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            {client.notes ? <p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-sm">{client.notes}</p> : null}
          </Card>

          <Card
            title={`Invoices (${invoiceCount})`}
            actions={
              staff && invoiceCount > invoices.length ? (
                <Link href={`/invoices?client=${client.id}`} className="text-sm text-brand hover:underline">
                  View all
                </Link>
              ) : undefined
            }
          >
            {invoices.length === 0 ? (
              <Empty>No invoices yet.</Empty>
            ) : (
              <Table head={["Date", "Number", "Supplier / customer", "Total", "Status"]}>
                {invoices.map((i) => (
                  <tr key={i.id} className="hover:bg-canvas">
                    <Td className="tabular whitespace-nowrap">{formatCalendarDate(i.issueDate)}</Td>
                    <Td>
                      {staff ? (
                        <Link href={`/invoices/${i.id}`} className="font-medium text-brand hover:underline">
                          {i.invoiceNumber}
                        </Link>
                      ) : (
                        i.invoiceNumber
                      )}
                    </Td>
                    <Td>{i.supplier?.name ?? "—"}</Td>
                    <Td className="tabular whitespace-nowrap text-right">{formatCents(i.totalCents, i.currency)}</Td>
                    <Td>
                      <InvoiceStatusBadge status={i.status} />
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Documents">
            <div className="mb-5">
              <DocumentUpload bucket={serverEnv().documentsBucket} clientId={client.id} />
            </div>
            <DocumentTable documents={documents} canDelete={staff} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Services">
            {staff ? (
              <div className="space-y-2">
                {SERVICES.map((s) => {
                  const on = enabled.has(s);
                  return (
                    <form key={s} action={toggleService.bind(null, client.id, s, !on)} className="flex items-center justify-between text-sm">
                      <span>{humanise(s)}</span>
                      <button
                        className={
                          "rounded-full border px-3 py-0.5 text-xs font-medium " +
                          (on ? "border-brand/30 bg-brand-soft text-brand" : "border-line text-muted hover:text-ink")
                        }
                        aria-pressed={on}
                      >
                        {on ? "On" : "Off"}
                      </button>
                    </form>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {[...enabled].map((s) => (
                  <Badge key={s} tone="brand">
                    {humanise(s)}
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          <Card title="Contacts">
            {client.contacts.length === 0 ? <p className="text-sm text-muted">No contacts yet.</p> : null}
            <ul className="space-y-3">
              {client.contacts.map((c) => (
                <li key={c.id} className="text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-medium">{c.name}</span> {c.isPrimary ? <Badge tone="brand">Primary</Badge> : null}
                      {c.position ? <div className="text-muted">{c.position}</div> : null}
                      {c.email ? <div><a href={`mailto:${c.email}`} className="text-brand hover:underline">{c.email}</a></div> : null}
                      {c.phone ? <div className="tabular"><a href={`tel:${c.phone}`}>{c.phone}</a></div> : null}
                    </div>
                    {staff ? (
                      <form action={deleteContact.bind(null, client.id, c.id)}>
                        <button className="text-xs text-muted hover:text-danger" aria-label={`Remove ${c.name}`}>
                          Remove
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {staff ? (
              <details className="mt-4 border-t border-line pt-4">
                <summary className="cursor-pointer text-sm text-brand">Add contact</summary>
                <form action={addContact.bind(null, client.id)} className="mt-3 space-y-3">
                  <Field label="Name">
                    <Input name="name" required />
                  </Field>
                  <Field label="Position">
                    <Input name="position" />
                  </Field>
                  <Field label="Email">
                    <Input name="email" type="email" />
                  </Field>
                  <Field label="Phone">
                    <Input name="phone" type="tel" />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isPrimary" className="accent-brand" /> Primary contact
                  </label>
                  <Button type="submit" className="w-full">
                    Add contact
                  </Button>
                </form>
              </details>
            ) : null}
          </Card>

          {staff ? (
            <Card title="Recent activity">
              {activity.length === 0 ? (
                <p className="text-sm text-muted">Nothing yet.</p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <span className="font-medium">{a.action}</span>
                      <div className="text-xs text-muted">
                        {a.actorLabel ?? a.actorType} · {formatDateTime(a.createdAt)}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
