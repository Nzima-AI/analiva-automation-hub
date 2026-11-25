import Link from "next/link";
import { Prisma } from "@aah/db";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, Textarea } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { captureLead, importContacts, markSignedUp, updateLead } from "../actions";
import { syncClientsToContacts } from "../growth-actions";
import { formatPhone, interests, MarketingTabs, Options, sources, stages } from "../shared";

export const metadata = { title: "Marketing contacts" };

const PAGE = 50;
const reaches = { any: "Any permission", email: "Can email", whatsapp: "Can WhatsApp", none: "No permission yet", optedout: "Opted out", signedup: "Signed up" } as const;
type Reach = keyof typeof reaches;

function reachWhere(reach: Reach): Prisma.MarketingLeadWhereInput {
  switch (reach) {
    case "email": return { email: { not: null }, consentAt: { not: null }, optedOutAt: null };
    case "whatsapp": return { phone: { not: null }, whatsappConsentAt: { not: null }, whatsappOptedOutAt: null };
    case "none": return { consentAt: null, whatsappConsentAt: null };
    case "optedout": return { OR: [{ optedOutAt: { not: null } }, { whatsappOptedOutAt: { not: null } }] };
    case "signedup": return { signedUpAt: { not: null } };
    default: return {};
  }
}

const str = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? "";

export default async function MarketingPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { db, ctx } = await requireStaff();
  const params = await searchParams;
  const q = str(params.q);
  const tag = str(params.tag, 40).toLowerCase();
  const reach: Reach = Object.hasOwn(reaches, params.reach ?? "") ? (params.reach as Reach) : "any";
  const stage = Object.hasOwn(stages, params.stage ?? "") ? (params.stage as keyof typeof stages) : null;
  const page = Math.max(1, Math.min(200, Number(params.page) || 1));
  const leadId = str(params.lead, 40);

  const where: Prisma.MarketingLeadWhereInput = {
    AND: [
      q ? { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q.replace(/\D/g, "") || q } },
      ] } : {},
      tag ? { tags: { has: tag } } : {},
      stage ? { stage } : {},
      reachWhere(reach),
    ],
  };

  const [leads, matching, total, canEmail, canWhatsapp, signedUp, optedOut, topTags, lead, enquiry] = await Promise.all([
    db.marketingLead.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: PAGE, skip: (page - 1) * PAGE }),
    db.marketingLead.count({ where }),
    db.marketingLead.count(),
    db.marketingLead.count({ where: reachWhere("email") }),
    db.marketingLead.count({ where: reachWhere("whatsapp") }),
    db.marketingLead.count({ where: reachWhere("signedup") }),
    db.marketingLead.count({ where: reachWhere("optedout") }),
    // Raw SQL isn't tenant-scoped by the client: the practice filter is explicit.
    db.$queryRaw<Array<{ tag: string; n: bigint }>>(Prisma.sql`
      SELECT t AS tag, count(*) AS n FROM "MarketingLead", unnest(tags) AS t
      WHERE "practiceId" = ${ctx.practiceId} GROUP BY t ORDER BY n DESC, t LIMIT 24`),
    leadId ? db.marketingLead.findFirst({ where: { id: leadId } }) : null,
    typeof params.inbox === "string" ? db.emailMessage.findFirst({
      where: { id: params.inbox, kind: "QUERY" },
      select: { fromName: true, fromAddress: true, client: { select: { name: true } } },
    }) : null,
  ]);
  const [owners, activity, history] = await Promise.all([
    lead ? db.user.findMany({ where: { role: { in: ["OWNER", "STAFF"] }, disabledAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    lead ? db.auditLog.findMany({ where: { entityType: "MarketingLead", entityId: lead.id }, orderBy: { createdAt: "desc" }, take: 8 }) : [],
    lead ? db.marketingSend.findMany({ where: { leadId: lead.id }, include: { campaign: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 8 }) : [],
  ]);

  const filterHref = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { q, tag, reach: reach === "any" ? "" : reach, stage: stage ?? "", ...patch };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const s = next.toString();
    return s ? `/marketing/contacts?${s}` : "/marketing/contacts";
  };
  const pages = Math.ceil(matching / PAGE);
  const num = (key: string) => (typeof params[key] === "string" && /^\d+$/.test(params[key]!) ? Number(params[key]) : null);
  const imported = num("imported");

  return (
    <>
      <PageHeader title="Marketing" subtitle="Your contacts, their permissions and what they've done with your campaigns." />
      <MarketingTabs active="/marketing/contacts" />
      {params.error ? <Notice tone="warn">{params.error}</Notice> : null}
      {imported !== null ? (
        <Notice tone="positive">
          {imported} new contacts imported · {num("updated") ?? 0} existing contacts updated
          {num("problems") ? ` · ${num("problems")} rows skipped (no usable phone number or email)` : ""}.
        </Notice>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Contacts" value={total} href="/marketing/contacts" />
        <StatCard label="Can email" value={canEmail} tone="brand" href={filterHref({ reach: "email", page: null })} />
        <StatCard label="Can WhatsApp" value={canWhatsapp} tone="brand" href={filterHref({ reach: "whatsapp", page: null })} />
        <StatCard label="Signed up" value={signedUp} tone="positive" href={filterHref({ reach: "signedup", page: null })} />
        <StatCard label="Opted out" value={optedOut} tone="warn" href={filterHref({ reach: "optedout", page: null })} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card title="Contacts" description={`${matching} match${matching === 1 ? "es" : ""}${q || tag || stage || reach !== "any" ? " these filters" : ""}.`}>
            <form action="/marketing/contacts" className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
              <Input name="q" aria-label="Search contacts" placeholder="Search contacts" defaultValue={q} maxLength={200} />
              <Select name="reach" aria-label="Permission" defaultValue={reach}><Options values={reaches} /></Select>
              <Select name="stage" aria-label="Stage" defaultValue={stage ?? ""}><option value="">Any stage</option><Options values={stages} /></Select>
              {tag ? <input type="hidden" name="tag" value={tag} /> : null}
              <Button type="submit" variant="secondary">Filter</Button>
            </form>
            {topTags.length ? (
              <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Segments">
                {topTags.map((t) => (
                  <Link
                    key={t.tag}
                    href={filterHref({ tag: tag === t.tag ? null : t.tag, page: null })}
                    aria-current={tag === t.tag ? "true" : undefined}
                    className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors ${tag === t.tag ? "border-brand bg-brand text-white" : "border-line text-ink-2 hover:border-line-strong"}`}
                  >
                    {t.tag} <span className="num opacity-70">{Number(t.n)}</span>
                  </Link>
                ))}
              </div>
            ) : null}
            {leads.length ? (
              <ul className="divide-y divide-line">
                {leads.map((item) => (
                  <li key={item.id}>
                    <Link href={filterHref({ page: page > 1 ? String(page) : null, lead: item.id })} className="flex min-h-12 items-center justify-between gap-3 py-2 -mx-2 rounded-lg px-2 hover:bg-subtle">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{item.name}{item.company ? <span className="font-normal text-muted"> · {item.company}</span> : null}</span>
                        <span className="block truncate text-xs text-muted">{[formatPhone(item.phone), item.email].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {item.signedUpAt ? <Badge tone="positive">Signed up</Badge> : null}
                        {item.optedOutAt || item.whatsappOptedOutAt ? <Badge tone="warn">Opted out</Badge> : null}
                        {!item.signedUpAt ? <Badge>{stages[item.stage]}</Badge> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No contacts match. Import your contacts or clear the filters.</p>}
            {pages > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                {page > 1 ? <Link className="inline-flex min-h-11 items-center text-brand hover:underline" href={filterHref({ page: String(page - 1) })}>Previous</Link> : <span />}
                <span className="text-muted">Page {page} of {pages}</span>
                {page < pages ? <Link className="inline-flex min-h-11 items-center text-brand hover:underline" href={filterHref({ page: String(page + 1) })}>Next</Link> : <span />}
              </div>
            ) : null}
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          {lead ? (
            <Card title={lead.name} description={`${sources[lead.source]} · added ${date(lead.createdAt)}`}>
              <form key={lead.id} action={updateLead.bind(null, lead.id)} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name"><Input name="name" defaultValue={lead.name} required maxLength={200} /></Field>
                  <Field label="Company"><Input name="company" defaultValue={lead.company} maxLength={200} /></Field>
                  <Field label="Mobile"><Input name="phone" type="tel" defaultValue={formatPhone(lead.phone)} maxLength={40} /></Field>
                  <Field label="Email"><Input name="email" type="email" defaultValue={lead.email ?? ""} maxLength={200} /></Field>
                  <Field label="Stage"><Select name="stage" defaultValue={lead.stage}><Options values={stages} /></Select></Field>
                  <Field label="Owner"><Select name="ownerId" defaultValue={owners.some((owner) => owner.id === lead.ownerId) ? lead.ownerId : ""} required>
                    <option value="" disabled>Choose staff member</option>
                    {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                  </Select></Field>
                </div>
                <Field label="Segments" hint="Comma-separated, e.g. past client, payroll, joburg."><Input name="tags" defaultValue={lead.tags.join(", ")} maxLength={800} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Email marketing" hint={lead.optedOutAt ? `Opted out ${date(lead.optedOutAt)}.` : lead.consentAt ? `Allowed since ${date(lead.consentAt)}.` : "No permission recorded."}>
                    <Select name="preference"><option value="unchanged">Keep as is</option><option value="opt-in">Record permission</option><option value="opt-out">Record opt-out</option></Select>
                  </Field>
                  <Field label="WhatsApp marketing" hint={lead.whatsappOptedOutAt ? `Opted out ${date(lead.whatsappOptedOutAt)}.` : lead.whatsappConsentAt ? `Allowed since ${date(lead.whatsappConsentAt)}.` : "No permission recorded."}>
                    <Select name="whatsappPreference"><option value="unchanged">Keep as is</option><option value="opt-in">Record permission</option><option value="opt-out">Record opt-out</option></Select>
                  </Field>
                </div>
                <Field label="Permission evidence" hint={lead.consentEvidence ? `On file: ${lead.consentEvidence}` : "When and how permission was given."}><Input name="evidence" maxLength={1000} /></Field>
                <Field label="Follow-up"><Textarea name="followUp" defaultValue={lead.followUp ?? ""} maxLength={1000} rows={2} /></Field>
                <Field label="Follow-up date"><Input name="followUpDate" type="date" defaultValue={date(lead.followUpDate)} /></Field>
                <input type="hidden" name="interest" value={lead.interest} />
                <Button type="submit">Save contact</Button>
              </form>
              {!lead.signedUpAt ? (
                <form action={markSignedUp.bind(null, lead.id)} className="mt-3">
                  <Button type="submit" variant="secondary">Mark as signed up</Button>
                </form>
              ) : <p className="mt-3 text-sm text-positive">Signed up on {date(lead.signedUpAt)}.</p>}
              {history.length ? (
                <div className="mt-5 border-t border-line pt-3">
                  <h3 className="text-sm font-medium">Campaigns</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {history.map((send) => (
                      <li key={send.id} className="flex justify-between gap-3">
                        <Link className="min-w-0 truncate text-brand hover:underline" href={`/marketing/campaigns?campaign=${send.campaign.id}`}>{send.campaign.name}</Link>
                        <span className="shrink-0 text-muted">{send.signedUpAt ? "Signed up" : send.clickedAt ? "Clicked" : send.repliedAt ? "Replied" : send.status.toLowerCase()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {activity.length ? (
                <div className="mt-5 border-t border-line pt-3">
                  <h3 className="text-sm font-medium">Activity</h3>
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {activity.map((entry) => <li key={entry.id}>{entry.action.replace("lead.", "").replace("_", " ")} · {date(entry.createdAt)}{entry.actorLabel ? ` · ${entry.actorLabel}` : ""}</li>)}
                  </ul>
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card title="Sync my clients" description="Adds every Hub client and client contact with a mobile number or email, linked to the client so compliance reminders reach them. Existing clients are recorded under POPIA section 69(3).">
            <form action={syncClientsToContacts}><Button type="submit" variant="secondary">Sync my clients</Button></form>
          </Card>

          <Card title="Import contacts" description="A spreadsheet (.csv), a Google or Outlook contacts export, or your phone's contacts export (.vcf). Up to 5,000 at a time.">
            <form action={importContacts} className="space-y-3">
              <Field label="File" hint="Columns are matched by name: name or first and last name, mobile or phone, email, company, tags, region or province.">
                <Input name="file" type="file" accept=".csv,.vcf,text/csv,text/vcard,text/x-vcard" required />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Segments for everyone in the file" hint="e.g. past client, 2026 campaign"><Input name="tags" maxLength={400} /></Field>
                <Field label="Service interest"><Select name="interest"><Options values={interests} /></Select></Field>
              </div>
              <Field label="Marketing permission" hint="Existing clients may be sent offers for similar services, with an opt-out in every message (POPIA section 69(3)). Anyone else needs to opt in first.">
                <Select name="basis" defaultValue="none">
                  <option value="none">Not yet: I'll record permission per contact</option>
                  <option value="existing-clients">These are all existing or past clients of the practice</option>
                </Select>
              </Field>
              <Button type="submit" variant="secondary">Import contacts</Button>
            </form>
          </Card>

          <Card title="Add a contact" description="Re-entering a known email or number updates that contact.">
            <form key={enquiry?.fromAddress ?? "new"} action={captureLead} className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input name="name" required maxLength={200} defaultValue={enquiry?.fromName ?? undefined} /></Field>
              <Field label="Company"><Input name="company" maxLength={200} defaultValue={enquiry?.client?.name} /></Field>
              <Field label="Mobile"><Input name="phone" type="tel" maxLength={40} placeholder="082 123 4567" /></Field>
              <Field label="Email"><Input name="email" type="email" maxLength={200} defaultValue={enquiry?.fromAddress} /></Field>
              <Field label="Service interest"><Select name="interest"><Options values={interests} /></Select></Field>
              <Field label="Source"><Select name="source" defaultValue={enquiry ? "INBOX" : "MANUAL"}><Options values={sources} /></Select></Field>
              <Field label="Segments" className="sm:col-span-2"><Input name="tags" maxLength={400} placeholder="past client, payroll" /></Field>
              <div><Button type="submit">Add contact</Button></div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
