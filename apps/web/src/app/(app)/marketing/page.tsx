import Link from "next/link";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { approveCampaign, captureLead, createCampaign, editCampaign, importLeads, updateLead } from "./actions";

export const metadata = { title: "Leads & campaigns" };

const interests = { REPORTING: "Financial reporting", BOOKKEEPING: "Bookkeeping", PAYROLL: "Payroll" } as const;
const sources = { WEBSITE: "Website enquiry", INBOX: "Inbox enquiry", REFERRAL: "Referral", IMPORT: "Import", MANUAL: "Manual entry" } as const;
const stages = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", WON: "Won", CLOSED: "Closed" } as const;

const templates = {
  nurture: { name: "Lead nurture", subject: "Can we help with your next steps?", body: "Hi {{firstName}},\n\nThanks for getting in touch. Would you like to book a call to talk about what {{company}} needs?" },
  onboarding: { name: "Client onboarding", subject: "Getting started together", body: "Hi {{firstName}},\n\nWelcome aboard. Let's agree on the documents, contacts and dates we need for your first month." },
  renewal: { name: "Renewal follow-up", subject: "Let's review your service for the year ahead", body: "Hi {{firstName}},\n\nCould we arrange a short call to review your priorities and discuss the next service period?" },
};

function Options({ values }: { values: Record<string, string> }) {
  return Object.entries(values).map(([value, label]) => <option key={value} value={value}>{label}</option>);
}

function CampaignFields({ draft }: { draft?: { name: string; subject: string; body: string; interest?: keyof typeof interests } }) {
  return (
    <>
      <Field label="Campaign name"><Input name="name" defaultValue={draft?.name} required maxLength={160} /></Field>
      <Field label="Audience interest"><Select name="interest" defaultValue={draft?.interest}><Options values={interests} /></Select></Field>
      <Field label="Subject"><Input name="subject" defaultValue={draft?.subject} required maxLength={200} /></Field>
      <Field label="Message" hint="Draft text can include {{firstName}} and {{company}}."><Textarea name="body" defaultValue={draft?.body} required maxLength={12000} rows={5} /></Field>
    </>
  );
}

export default async function MarketingPage({ searchParams }: {
  searchParams: Promise<{ lead?: string; campaign?: string; q?: string; error?: string; template?: string; inbox?: string; imported?: string; skipped?: string }>;
}) {
  const { db, ctx } = await requireStaff();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const leadId = typeof params.lead === "string" ? params.lead : "";
  const campaignId = typeof params.campaign === "string" ? params.campaign : "";
  const template = typeof params.template === "string" && Object.hasOwn(templates, params.template)
    ? templates[params.template as keyof typeof templates]
    : undefined;

  const [leads, campaigns, lead, campaign, enquiry] = await Promise.all([
    db.marketingLead.findMany({
      where: q ? { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ] } : undefined,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
    db.marketingCampaign.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 }),
    leadId ? db.marketingLead.findFirst({ where: { id: leadId } }) : null,
    campaignId ? db.marketingCampaign.findFirst({ where: { id: campaignId } }) : null,
    typeof params.inbox === "string" ? db.emailMessage.findFirst({
      where: { id: params.inbox, kind: "QUERY" },
      select: { fromName: true, fromAddress: true, client: { select: { name: true } } },
    }) : null,
  ]);
  const [owners, activity, eligible] = await Promise.all([
    lead ? db.user.findMany({
      where: { role: { in: ["OWNER", "STAFF"] }, disabledAt: null },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }) : [],
    lead ? db.auditLog.findMany({
      where: { entityType: "MarketingLead", entityId: lead.id },
      orderBy: { createdAt: "desc" }, take: 10,
    }) : [],
    campaign ? db.marketingLead.count({
      where: { interest: campaign.interest, consentAt: { not: null }, optedOutAt: null },
    }) : 0,
  ]);

  return (
    <>
      <PageHeader title="Leads & campaigns" subtitle="Capture prospects, track follow-ups and prepare permission-based email campaigns." />
      {params.error ? <Notice tone="warn">{params.error}</Notice> : null}
      {typeof params.imported === "string" && /^\d+$/.test(params.imported) && typeof params.skipped === "string" && /^\d+$/.test(params.skipped)
        ? <Notice tone="positive">{params.imported} imported · {params.skipped} duplicate entries skipped.</Notice>
        : null}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <Card title="Capture a lead" description="Re-enter a known email to update the lead. Marketing preferences are managed on the lead record.">
            <form key={enquiry?.fromAddress ?? "new"} action={captureLead} className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input name="name" required maxLength={200} defaultValue={enquiry?.fromName ?? undefined} /></Field>
              <Field label="Email"><Input name="email" type="email" required maxLength={200} defaultValue={enquiry?.fromAddress} /></Field>
              <Field label="Company"><Input name="company" required maxLength={200} defaultValue={enquiry?.client?.name} /></Field>
              <Field label="Service interest"><Select name="interest"><Options values={interests} /></Select></Field>
              <Field label="Source"><Select name="source" defaultValue={enquiry ? "INBOX" : "MANUAL"}><Options values={sources} /></Select></Field>
              <div className="self-end"><Button type="submit">Capture lead</Button></div>
            </form>
          </Card>
          <Card title="Import leads">
            <form action={importLeads} className="space-y-3">
              <Field label="CSV file" hint="Use name, email, company and interest columns. Interest can be REPORTING, BOOKKEEPING or PAYROLL. Up to 500 leads. Imported leads start without marketing permission.">
                <Input name="file" type="file" accept=".csv,text/csv" required />
              </Field>
              <Button type="submit" variant="secondary">Import CSV</Button>
            </form>
          </Card>
          {lead ? (
            <Card title={lead.name} description={`${lead.company} · ${lead.email} · ${sources[lead.source]}`}>
              <form key={lead.id} action={updateLead.bind(null, lead.id)} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Stage"><Select name="stage" defaultValue={lead.stage}><Options values={stages} /></Select></Field>
                  <Field label="Owner"><Select name="ownerId" defaultValue={owners.some((owner) => owner.id === lead.ownerId) ? lead.ownerId : ""} required>
                    <option value="" disabled>Choose staff member</option>
                    {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                  </Select></Field>
                </div>
                <Field label="Follow-up"><Textarea name="followUp" defaultValue={lead.followUp ?? ""} maxLength={1000} /></Field>
                <Field label="Follow-up date"><Input name="followUpDate" type="date" defaultValue={lead.followUpDate?.toISOString().slice(0, 10)} /></Field>
                <Field label="Marketing preference" hint={lead.optedOutAt ? "Currently opted out." : lead.consentAt ? "Currently opted in." : "No opt-in recorded."}>
                  <Select name="preference"><option value="unchanged">Keep current preference</option><option value="opt-in">Record opt-in</option><option value="opt-out">Record opt-out</option></Select>
                </Field>
                <Field label="Opt-in evidence" hint="Include the date and how permission was obtained."><Input name="evidence" maxLength={1000} /></Field>
                <Button type="submit">Save lead</Button>
              </form>
              {activity.length ? <div className="mt-5 border-t border-line pt-3">
                <h3 className="text-sm font-medium">Recent activity</h3>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {activity.map((entry) => <li key={entry.id}>{entry.action === "lead.captured" ? "Lead captured" : "Lead updated"} · {entry.createdAt.toISOString().slice(0, 10)}</li>)}
                </ul>
              </div> : null}
            </Card>
          ) : null}
          <Card title="Lead pipeline" description="Search across all leads. Up to 50 recent matches are shown.">
            <form action="/marketing" className="mb-4 flex gap-2">
              <Input name="q" aria-label="Search leads" placeholder="Name, company or email" defaultValue={q} maxLength={200} />
              <Button type="submit" variant="secondary">Search</Button>
            </form>
            {leads.length ? <ul className="divide-y divide-line">
              {leads.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                <Link className="min-w-0 break-words text-sm text-brand hover:underline" href={`/marketing?lead=${item.id}`}>{item.name} · {item.company}</Link>
                <Badge>{stages[item.stage]}</Badge>
              </li>)}
            </ul> : <p className="text-sm text-muted">No leads found.</p>}
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="New campaign" description="Start with a template or write a new draft.">
            <div className="mb-4 flex flex-wrap gap-2">
              {Object.entries(templates).map(([key, item]) => <Link key={key} href={`/marketing?template=${key}`} className="rounded-lg border border-line px-2 py-1 text-sm text-brand hover:underline">{item.name}</Link>)}
            </div>
            <form key={params.template ?? "blank"} action={createCampaign} className="space-y-3">
              <CampaignFields draft={template} />
              <Button type="submit">Save draft</Button>
            </form>
          </Card>
          {campaign ? (
            <Card title={campaign.name} description={`${eligible} opted-in lead${eligible === 1 ? "" : "s"} currently match ${interests[campaign.interest]}.`}>
              {campaign.approvedAt ? (
                <>
                  <Badge tone="positive">Approved</Badge>
                  <p className="mt-3 text-sm font-medium">{campaign.subject}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{campaign.body}</p>
                </>
              ) : (
                <form key={campaign.id} action={editCampaign.bind(null, campaign.id)} className="space-y-3">
                  <CampaignFields draft={campaign} />
                  <Button type="submit" variant="secondary">Save changes</Button>
                </form>
              )}
              {ctx.role === "OWNER" && !campaign.approvedAt ? <form className="mt-3" action={approveCampaign.bind(null, campaign.id)}>
                <Button type="submit">Approve saved draft</Button>
              </form> : null}
              <p className="mt-3 text-sm text-muted">This workspace prepares drafts and records approvals. Email delivery is pending setup.</p>
            </Card>
          ) : null}
          <Card title="Recent campaigns">
            {campaigns.length ? <ul className="divide-y divide-line">
              {campaigns.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/marketing?campaign=${item.id}`} className="min-w-0 break-words text-sm text-brand hover:underline">{item.name}</Link>
                <Badge>{item.approvedAt ? "Approved" : "Draft"}</Badge>
              </li>)}
            </ul> : <p className="text-sm text-muted">No campaign drafts yet.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
