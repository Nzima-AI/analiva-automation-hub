import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, BookOpen, CalendarClock, FileText, FolderOpen, Landmark, Receipt, Settings2, TrendingDown, TrendingUp, Users } from "lucide-react";
import { balanceSheet, formatCents, incomeStatement, isPracticeRole, SERVICES } from "@aah/core";
import { DocumentTable } from "@/components/document-table";
import { DocumentUpload } from "@/components/document-upload";
import { InvoiceStatusBadge } from "@/components/status";
import { Badge, Button, ButtonLink, Card, Empty, Field, Input, Notice, PageHeader, Select, StatCard, Table, Td } from "@/components/ui";
import { accountTotals, financialYearStart } from "@/lib/books/ledger";
import { clientDeadlines } from "@/lib/compliance";
import { serverEnv } from "@/lib/env";
import { formatCalendarDate, formatDateTime, humanise } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { addContact, deleteContact, toggleService, updateCaptureSettings } from "../actions";

export const metadata = { title: "Client" };

const MODE_TEXT = {
  ALWAYS_REVIEW: { label: "Always review", hint: "Every invoice waits for a person.", tone: "neutral" },
  AUTO_WHEN_CONFIDENT: { label: "Auto-file when confident", hint: "Filed automatically above the threshold; the rest is reviewed.", tone: "brand" },
  NEVER_REVIEW: { label: "Never review", hint: "Filed as soon as the client, total, number and date are read. Duplicates still wait.", tone: "positive" },
} as const;

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { db, ctx } = await requireSession();
  const staff = isPracticeRole(ctx.role);
  const owner = ctx.role === "OWNER";
  const { id } = await params;
  const { error, saved } = await searchParams;

  const client = await db.client.findFirst({
    where: { id, deletedAt: null },
    include: { contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }, services: true },
  });
  if (!client) notFound();

  const today = new Date(new Date().toISOString().slice(0, 10));
  const fyStart = financialYearStart(today, client.financialYearEndMonth);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const [invoices, invoiceCount, documents, activity, yearRows, allRows, waiting, deadlines, unmatched] = await Promise.all([
    db.invoice.findMany({ where: { clientId: client.id, deletedAt: null }, orderBy: { issueDate: "desc" }, take: 10, include: { supplier: { select: { name: true } } } }),
    db.invoice.count({ where: { clientId: client.id, deletedAt: null } }),
    db.document.findMany({ where: { clientId: client.id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 15, include: { uploadedBy: { select: { name: true } } } }),
    staff ? db.auditLog.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" }, take: 10 }) : Promise.resolve([]),
    accountTotals(db, client.id, { from: fyStart, to: tomorrow }),
    accountTotals(db, client.id, { to: tomorrow }),
    staff ? db.capture.count({ where: { clientId: client.id, status: { in: ["NEEDS_CLIENT", "SUGGESTED", "NEEDS_REVIEW"] } } }) : Promise.resolve(0),
    staff ? clientDeadlines(db, { from: new Date(today.getTime() - 60 * 86_400_000), to: new Date(today.getTime() + 120 * 86_400_000), clientId: client.id }) : Promise.resolve([]),
    staff ? db.bankTransaction.count({ where: { clientId: client.id, status: "UNMATCHED" } }) : Promise.resolve(0),
  ]);
  const is = incomeStatement(yearRows);
  const bs = balanceSheet(allRows, yearRows);
  const hasBooks = allRows.some((r) => r.debitCents !== 0n || r.creditCents !== 0n);
  const enabled = new Set(client.services.filter((s) => s.enabled).map((s) => s.service));
  const mode = MODE_TEXT[client.captureMode];
  const openDeadlines = deadlines.filter((d) => !d.done).slice(0, 5);

  return (
    <div>
      <PageHeader
        eyebrow={client.code}
        title={client.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge dot tone={client.status === "ACTIVE" ? "positive" : "neutral"}>
              {humanise(client.status)}
            </Badge>
            {client.tradingName ? <span>t/a {client.tradingName}</span> : null}
            {client.vatRegistered ? <Badge tone="brand">VAT cat. {client.vatCategory ?? "?"}</Badge> : <Badge>Not VAT registered</Badge>}
            {staff ? (
              <Badge tone={mode.tone}>
                <Bot className="h-3 w-3" /> {mode.label}
              </Badge>
            ) : null}
          </span>
        }
        actions={
          staff ? (
            <>
              <ButtonLink href={`/books/${client.id}`} variant="secondary">
                <BookOpen className="h-4 w-4" /> Books & reports
              </ButtonLink>
              <ButtonLink href={`/clients/${client.id}/edit`} variant="secondary">
                <Settings2 className="h-4 w-4" /> Edit
              </ButtonLink>
              <ButtonLink href={`/invoices/new?client=${client.id}`}>
                <Receipt className="h-4 w-4" /> Capture invoice
              </ButtonLink>
            </>
          ) : undefined
        }
      />
      {error ? <Notice>{error}</Notice> : null}
      {saved === "capture" ? <Notice tone="positive">Review settings saved.</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Income this financial year" value={formatCents(is.totals.salesCents + is.totals.otherIncomeCents)} icon={TrendingUp} hint={`Since ${formatCalendarDate(fyStart)}`} href={staff ? `/books/${client.id}/reports?r=is` : undefined} />
        <StatCard label="Expenses this financial year" value={formatCents(is.totals.costOfSalesCents + is.totals.expensesCents)} icon={TrendingDown} href={staff ? `/books/${client.id}/reports?r=is` : undefined} />
        <StatCard
          label="Net profit"
          value={formatCents(is.totals.netProfitCents)}
          tone={is.totals.netProfitCents < 0n ? "negative" : "positive"}
          hint={is.netMarginPct === null ? "No sales yet" : `${is.netMarginPct}% net margin`}
          icon={FileText}
        />
        <StatCard
          label="Bank balance (books)"
          value={formatCents(bs.totals.bankCents)}
          icon={Landmark}
          hint={staff && unmatched ? `${unmatched} bank lines to code` : hasBooks ? "Per the ledger" : "No bank statements yet"}
          href={staff ? `/books/${client.id}/bank` : undefined}
          tone={unmatched ? "warn" : "neutral"}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card
            title={`Invoices (${invoiceCount})`}
            icon={Receipt}
            padded
            actions={staff && invoiceCount > invoices.length ? <Link href={`/invoices?client=${client.id}`} className="text-xs font-medium text-brand-text hover:underline">View all</Link> : undefined}
          >
            {invoices.length === 0 ? (
              <Empty icon={Receipt}>No invoices yet. They arrive from the inbox or can be captured manually.</Empty>
            ) : (
              <Table head={["Date", "Number", "Supplier / customer", "Total", "Status"]} align={["left", "left", "left", "right", "left"]}>
                {invoices.map((i) => (
                  <tr key={i.id} className="hover:bg-subtle/60">
                    <Td className="tabular whitespace-nowrap text-muted">{formatCalendarDate(i.issueDate)}</Td>
                    <Td>
                      {staff ? (
                        <Link href={`/invoices/${i.id}`} className="font-medium text-brand-text hover:underline">
                          {i.invoiceNumber}
                        </Link>
                      ) : (
                        i.invoiceNumber
                      )}
                    </Td>
                    <Td>{i.supplier?.name ?? "—"}</Td>
                    <Td className="tabular whitespace-nowrap text-right font-medium">{formatCents(i.totalCents, i.currency)}</Td>
                    <Td>
                      <InvoiceStatusBadge status={i.status} />
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Documents" icon={FolderOpen}>
            <div className="mb-5">
              <DocumentUpload bucket={serverEnv().documentsBucket} clientId={client.id} />
            </div>
            <DocumentTable documents={documents} canDelete={staff} />
          </Card>
        </div>

        <div className="space-y-6">
          {staff ? (
            <Card title="Inbox capture" description="How this client's emailed invoices are filed" icon={Bot}>
              {waiting ? (
                <Link href="/review" className="mb-4 flex items-center justify-between rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                  {waiting} waiting in the review queue <span aria-hidden>→</span>
                </Link>
              ) : null}
              {owner ? (
                <form action={updateCaptureSettings.bind(null, client.id)} className="space-y-4">
                  <div className="space-y-2">
                    {(Object.keys(MODE_TEXT) as Array<keyof typeof MODE_TEXT>).map((m) => (
                      <label key={m} className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                        <input type="radio" name="captureMode" value={m} defaultChecked={client.captureMode === m} className="mt-0.5 accent-[var(--brand)]" />
                        <span>
                          <span className="block text-sm font-medium text-ink">{MODE_TEXT[m].label}</span>
                          <span className="block text-xs text-muted">{MODE_TEXT[m].hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <Field label="Confidence needed to auto-file" hint="Used with “Auto-file when confident”. 90% is the practice default.">
                    <Select name="autoFileThreshold" defaultValue={String(Math.round(client.autoFileThreshold * 100))}>
                      {[60, 70, 75, 80, 85, 90, 95].map((v) => (
                        <option key={v} value={v}>
                          {v}%
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" className="w-full">
                    Save review settings
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted">
                  {mode.label}: {mode.hint} Only the owner can change this.
                </p>
              )}
            </Card>
          ) : null}

          {staff ? (
            <Card title="Deadlines" icon={CalendarClock} actions={<Link href={`/compliance?client=${client.id}`} className="text-xs font-medium text-brand-text hover:underline">All</Link>}>
              {openDeadlines.length === 0 ? (
                <p className="text-sm text-muted">Nothing due. Set the tax profile under Edit to fill this in.</p>
              ) : (
                <ul className="space-y-2.5">
                  {openDeadlines.map((d) => (
                    <li key={d.periodKey} className="flex items-start justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{d.label}</span>
                        <span className="block text-xs text-muted">{d.periodLabel}</span>
                      </span>
                      <Badge tone={d.overdue ? "danger" : "neutral"}>{d.overdue ? "Overdue" : formatCalendarDate(d.dueDate)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          <Card title="Profile" icon={Users}>
            <dl className="space-y-2 text-sm">
              {(
                [
                  ["CIPC registration", client.registrationNumber],
                  ["VAT number", client.vatNumber],
                  ["Income tax number", client.taxNumber],
                  ["Year end", new Intl.DateTimeFormat("en-ZA", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, client.financialYearEndMonth - 1, 1)))],
                  ["Email", client.email],
                  ["Phone", client.phone],
                ] as Array<[string, string | null]>
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-muted">{label}</dt>
                  <dd className="truncate text-right tabular text-ink">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-xs font-medium text-muted">Services</p>
              {staff ? (
                <div className="flex flex-wrap gap-1.5">
                  {SERVICES.map((s) => {
                    const on = enabled.has(s);
                    return (
                      <form key={s} action={toggleService.bind(null, client.id, s, !on)}>
                        <button
                          className={"rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors " + (on ? "border-brand/30 bg-brand-soft text-brand-text" : "border-line text-faint hover:text-ink")}
                          aria-pressed={on}
                        >
                          {humanise(s)}
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
            </div>
          </Card>

          <Card title="Contacts" icon={Users}>
            {client.contacts.length === 0 ? <p className="text-sm text-muted">No contacts yet.</p> : null}
            <ul className="space-y-3">
              {client.contacts.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{c.name}</span> {c.isPrimary ? <Badge tone="brand">Primary</Badge> : null}
                    {c.position ? <div className="text-xs text-muted">{c.position}</div> : null}
                    {c.email ? <a href={`mailto:${c.email}`} className="block truncate text-brand-text hover:underline">{c.email}</a> : null}
                    {c.phone ? <a href={`tel:${c.phone}`} className="block tabular text-ink-2">{c.phone}</a> : null}
                  </div>
                  {staff ? (
                    <form action={deleteContact.bind(null, client.id, c.id)}>
                      <button className="text-xs text-faint hover:text-danger" aria-label={`Remove ${c.name}`}>
                        Remove
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {staff ? (
              <details className="mt-4 border-t border-line pt-4">
                <summary className="cursor-pointer text-sm font-medium text-brand-text">Add contact</summary>
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
                    <input type="checkbox" name="isPrimary" className="accent-[var(--brand)]" /> Primary contact
                  </label>
                  <Button type="submit" className="w-full" variant="secondary">
                    Add contact
                  </Button>
                </form>
              </details>
            ) : null}
          </Card>

          {staff && activity.length ? (
            <Card title="Recent activity">
              <ol className="space-y-2 text-sm">
                {activity.map((a) => (
                  <li key={a.id}>
                    <span className="text-ink">{a.action.replace(/[._]/g, " ")}</span>
                    <div className="text-xs text-faint">
                      {a.actorLabel ?? a.actorType} · {formatDateTime(a.createdAt)}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
