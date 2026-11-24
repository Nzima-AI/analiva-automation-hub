import Link from "next/link";
import { renderMerge, TEMPLATE_FIELDS, templateValues } from "@aah/core";
import type { MarketingCampaign } from "@aah/db";
import { Badge, Button, ButtonLink, Card, Field, Input, Notice, PageHeader, Select, StatCard, Textarea } from "@/components/ui";
import { audienceFor, campaignStats } from "@/lib/marketing/engine";
import { requireStaff } from "@/lib/session";
import { listTemplates, type WaTemplate } from "@/lib/whatsapp";
import { approveCampaign, cancelCampaign, createCampaign, createFollowUp, editCampaign, sendCampaign, testCampaign } from "../actions";
import { channels, interests, MarketingTabs, Options, statuses } from "../shared";

export const metadata = { title: "Campaigns" };

const starters = {
  analiva: {
    name: "Analiva launch",
    subject: "{{firstName}}, your numbers in one place",
    body: "Hi {{firstName}},\n\nYou've trusted us with {{company}}'s books, so you're among the first to get Analiva: your financial reports, VAT and payroll in one place, updated from your accounts every day.\n\nIt takes two minutes to set up: {{link}}\n\nReply to this email if you'd like us to walk you through it.",
  },
  nurture: { name: "Lead nurture", subject: "Can we help with your next steps?", body: "Hi {{firstName}},\n\nThanks for getting in touch. Would you like to book a call to talk about what {{company}} needs?" },
  renewal: { name: "Renewal follow-up", subject: "Let's review your service for the year ahead", body: "Hi {{firstName}},\n\nCould we arrange a short call to review your priorities and discuss the next service period?" },
};
const sample = { name: "Thandi Nkosi", company: "Nkosi Trading" };
const followUps = { NOT_CLICKED: "Didn't click", CLICKED_NOT_SIGNED_UP: "Clicked, not signed up", SIGNED_UP: "Signed up (thank you)" } as const;
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "-");
const saTime = (d: Date) => d.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });

function CampaignFields({ draft, channel, templates }: { draft?: Partial<MarketingCampaign>; channel: "EMAIL" | "WHATSAPP"; templates: WaTemplate[] }) {
  const approved = templates.filter((t) => t.status === "APPROVED");
  const current = draft?.whatsappTemplate ? `${draft.whatsappTemplate}|${draft.templateLanguage ?? "en"}` : "";
  return (
    <>
      <input type="hidden" name="channel" value={channel} />
      <Field label="Campaign name"><Input name="name" defaultValue={draft?.name} required maxLength={160} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service interest"><Select name="interest" defaultValue={draft?.interest ?? "ALL"}><option value="ALL">Everyone</option><Options values={interests} /></Select></Field>
        <Field label="Segments" hint="Contacts must have all of these. Empty: everyone."><Input name="tags" defaultValue={draft?.tags?.join(", ")} maxLength={400} placeholder="past client" /></Field>
      </div>
      <Field label="Link to track" hint="Where {{link}} sends people, e.g. the Analiva sign-up page. Each contact gets a personal link, so you can see who clicked and who signed up.">
        <Input name="ctaUrl" type="url" defaultValue={draft?.ctaUrl ?? ""} maxLength={500} placeholder="https://analiva.app/..." />
      </Field>
      {channel === "EMAIL" ? (
        <>
          <Field label="Subject"><Input name="subject" defaultValue={draft?.subject} required maxLength={200} /></Field>
          <Field label="Message" hint="Use {{firstName}}, {{name}}, {{company}} and {{link}}. An unsubscribe link is added to every email."><Textarea name="body" defaultValue={draft?.body} required maxLength={12000} rows={8} /></Field>
        </>
      ) : (
        <>
          <Field label="WhatsApp template" hint={approved.length ? "Only templates Meta has approved are listed." : "No approved templates yet. Create one in Meta's WhatsApp Manager, then refresh."}>
            <Select name="template" defaultValue={current} required>
              <option value="" disabled>Choose a template</option>
              {approved.map((t) => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} ({t.language}, {t.category.toLowerCase()}, {t.bodyParams} field{t.bodyParams === 1 ? "" : "s"})</option>)}
            </Select>
          </Field>
          <Field label="Template fields" hint={`What fills {{1}}, {{2}}... in order, comma-separated. Choose from: ${Object.keys(TEMPLATE_FIELDS).join(", ")}.`}>
            <Input name="templateParams" defaultValue={draft?.templateParams?.join(", ") ?? "firstName, link"} maxLength={200} />
          </Field>
          <Field label="Notes" hint="For your team; not sent."><Textarea name="body" defaultValue={draft?.body} maxLength={2000} rows={2} /></Field>
        </>
      )}
    </>
  );
}

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db, ctx } = await requireStaff();
  const params = await searchParams;
  const campaignId = typeof params.campaign === "string" ? params.campaign : "";
  const channel = params.channel === "WHATSAPP" ? "WHATSAPP" : "EMAIL";
  const starter = typeof params.template === "string" && Object.hasOwn(starters, params.template) ? starters[params.template as keyof typeof starters] : undefined;

  const [campaigns, campaign, setting, unread] = await Promise.all([
    db.marketingCampaign.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30 }),
    campaignId ? db.marketingCampaign.findFirst({ where: { id: campaignId }, include: { parent: { select: { id: true, name: true } } } }) : null,
    db.whatsAppSetting.findFirst(),
    db.whatsAppMessage.count({ where: { handledAt: null } }),
  ]);
  const needTemplates = setting && (channel === "WHATSAPP" || campaign?.channel === "WHATSAPP");
  const { templates, error: templateError } = needTemplates ? await listTemplates(setting) : { templates: [], error: null };
  const [stats, audience, failures] = campaign
    ? await Promise.all([
        campaignStats(db, campaign.id),
        ["DRAFT", "APPROVED"].includes(campaign.status) ? db.marketingLead.count({ where: await audienceFor(db, campaign) }) : null,
        db.marketingSend.findMany({ where: { campaignId: campaign.id, status: "FAILED" }, select: { toAddress: true, error: true }, take: 5 }),
      ])
    : [null, null, []];
  const template = campaign?.whatsappTemplate ? templates.find((t) => t.name === campaign.whatsappTemplate && t.language === campaign.templateLanguage) : undefined;

  return (
    <>
      <PageHeader title="Marketing" subtitle="Write a campaign, test it on yourself, get it approved and send it by email or WhatsApp." />
      <MarketingTabs active="/marketing/campaigns" badge={unread} />
      {params.error ? <Notice tone="warn">{params.error}</Notice> : null}
      {params.tested ? <Notice tone="positive">Test sent. Check your inbox or WhatsApp.</Notice> : null}
      {params.queued ? <Notice tone="positive">{params.queued} messages queued. They go out in batches every minute; this page shows progress.</Notice> : null}
      {templateError ? <Notice tone="warn">WhatsApp templates couldn't be loaded: {templateError}</Notice> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {campaign && stats ? (
            <Card
              title={campaign.name}
              description={`${channels[campaign.channel]} · ${campaign.interest ? interests[campaign.interest] : "Everyone"}${campaign.tags.length ? ` · ${campaign.tags.join(", ")}` : ""}${campaign.parent ? ` · follow-up to ${campaign.parent.name}` : ""}`}
              actions={<Badge tone={campaign.status === "SENT" ? "positive" : campaign.status === "SENDING" ? "brand" : campaign.status === "CANCELLED" ? "warn" : "neutral"}>{statuses[campaign.status]}</Badge>}
            >
              {stats.total ? (
                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Sent" value={stats.sent} hint={`of ${stats.total}`} />
                  {campaign.channel === "WHATSAPP"
                    ? <StatCard label="Read" value={stats.read} hint={`${pct(stats.read, stats.sent)} · ${stats.delivered} delivered`} />
                    : <StatCard label="Waiting" value={stats.queued} hint="paced sending" />}
                  <StatCard label="Clicked" value={stats.clicked} tone="brand" hint={pct(stats.clicked, stats.sent)} />
                  <StatCard label="Signed up" value={stats.signedUp} tone="positive" hint={pct(stats.signedUp, stats.sent)} />
                  <StatCard label="Replied" value={stats.replied} />
                  <StatCard label="Opted out" value={stats.optedOut} tone="warn" />
                  <StatCard label="Failed" value={stats.failed} tone={stats.failed ? "negative" : "neutral"} />
                  <StatCard label="Skipped" value={stats.skipped} hint="opted out first" />
                </div>
              ) : null}
              {failures.length ? (
                <div className="mb-4 rounded-xl border border-line p-3 text-sm">
                  <p className="font-medium">Why some failed</p>
                  <ul className="mt-1 space-y-0.5 text-muted">{failures.map((f, i) => <li key={i} className="break-words">{f.toAddress}: {f.error}</li>)}</ul>
                </div>
              ) : null}

              <div className="mb-4 rounded-xl border border-line bg-subtle p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Preview for {sample.name}</p>
                {campaign.channel === "EMAIL" ? (
                  <>
                    <p className="text-sm font-medium">{renderMerge(campaign.subject, sample, campaign.ctaUrl)}</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2">{renderMerge(campaign.body, sample, campaign.ctaUrl ? `${campaign.ctaUrl} (personal link)` : null)}</p>
                  </>
                ) : template ? (
                  <p className="whitespace-pre-wrap break-words text-sm text-ink-2">
                    {template.bodyText.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => templateValues(campaign.templateParams, sample, campaign.ctaUrl ? "(personal link)" : null)[Number(n) - 1] ?? `{{${n}}}`)}
                  </p>
                ) : <p className="text-sm text-muted">Template {campaign.whatsappTemplate}: connect WhatsApp to preview it.</p>}
              </div>

              {audience !== null ? <p className="mb-4 text-sm">{audience} contact{audience === 1 ? "" : "s"} will receive this, counting only those with {campaign.channel === "EMAIL" ? "email" : "WhatsApp"} permission who haven't opted out.</p> : null}

              {campaign.status === "DRAFT" ? (
                <form key={campaign.id} action={editCampaign.bind(null, campaign.id)} className="space-y-3">
                  <CampaignFields draft={campaign} channel={campaign.channel} templates={templates} />
                  <Button type="submit" variant="secondary">Save changes</Button>
                </form>
              ) : null}

              <div className="mt-5 space-y-4 border-t border-line pt-4">
                {["DRAFT", "APPROVED"].includes(campaign.status) ? (
                  <form action={testCampaign.bind(null, campaign.id)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Field label={campaign.channel === "EMAIL" ? "Send a test to your email" : "Send a test to your WhatsApp"} className="flex-1">
                      <Input name="to" type={campaign.channel === "EMAIL" ? "email" : "tel"} required maxLength={200} placeholder={campaign.channel === "EMAIL" ? "you@practice.co.za" : "082 123 4567"} />
                    </Field>
                    <Button type="submit" variant="secondary">Send test</Button>
                  </form>
                ) : null}
                {campaign.status === "DRAFT" && ctx.role === "OWNER" ? (
                  <form action={approveCampaign.bind(null, campaign.id)}><Button type="submit">Approve campaign</Button></form>
                ) : campaign.status === "DRAFT" ? <p className="text-sm text-muted">The practice owner approves campaigns before they can be sent.</p> : null}
                {campaign.status === "APPROVED" ? (
                  <form action={sendCampaign.bind(null, campaign.id)} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="When"><Select name="when"><option value="now">Send now</option><option value="later">At the time below</option></Select></Field>
                      <Field label="Date and time (SA time)"><Input name="scheduledAt" type="datetime-local" /></Field>
                    </div>
                    <Button type="submit">Send to {audience} contact{audience === 1 ? "" : "s"}</Button>
                  </form>
                ) : null}
                {campaign.status === "SENDING" ? (
                  <p className="text-sm text-muted">{campaign.startedAt && campaign.startedAt > new Date() ? `Starts ${saTime(campaign.startedAt)}.` : `Sending since ${campaign.startedAt ? saTime(campaign.startedAt) : "now"}.`} Refresh to see progress.</p>
                ) : null}
                {["APPROVED", "SENDING"].includes(campaign.status) ? (
                  <form action={cancelCampaign.bind(null, campaign.id)}><Button type="submit" variant="secondary">Stop campaign</Button></form>
                ) : null}
                {["SENDING", "SENT"].includes(campaign.status) ? (
                  <form action={createFollowUp.bind(null, campaign.id)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Field label="Follow up with the people who" className="flex-1"><Select name="rule"><Options values={followUps} /></Select></Field>
                    <Button type="submit" variant="secondary">Draft follow-up</Button>
                  </form>
                ) : null}
                {campaign.finishedAt ? <p className="text-xs text-faint">{campaign.status === "CANCELLED" ? "Stopped" : "Finished"} {saTime(campaign.finishedAt)}.</p> : null}
              </div>
            </Card>
          ) : null}

          <Card title="New campaign" description="Email costs nothing to send. WhatsApp is billed by Meta per delivered message, with no monthly fee.">
            <div className="mb-4 flex flex-wrap gap-2">
              <ButtonLink size="sm" variant={channel === "EMAIL" ? "primary" : "secondary"} href="/marketing/campaigns">Email</ButtonLink>
              <ButtonLink size="sm" variant={channel === "WHATSAPP" ? "primary" : "secondary"} href="/marketing/campaigns?channel=WHATSAPP">WhatsApp</ButtonLink>
            </div>
            {channel === "EMAIL" ? (
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Start from:</span>
                {Object.entries(starters).map(([key, item]) => <Link key={key} href={`/marketing/campaigns?template=${key}`} className="inline-flex min-h-9 items-center rounded-lg border border-line px-2.5 text-brand hover:border-line-strong">{item.name}</Link>)}
              </div>
            ) : !setting ? (
              <Notice tone="brand">Connect your WhatsApp Business number first, under <Link className="underline" href="/marketing/whatsapp">WhatsApp</Link>.</Notice>
            ) : null}
            <form key={`${channel}-${params.template ?? "blank"}`} action={createCampaign} className="space-y-3">
              <CampaignFields draft={starter} channel={channel} templates={templates} />
              <Button type="submit" disabled={channel === "WHATSAPP" && !setting}>Save draft</Button>
            </form>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card title="Campaigns">
            {campaigns.length ? (
              <ul className="divide-y divide-line">
                {campaigns.map((item) => (
                  <li key={item.id}>
                    <Link href={`/marketing/campaigns?campaign=${item.id}`} aria-current={item.id === campaign?.id ? "true" : undefined} className="-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-subtle">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{item.name}</span>
                        <span className="block text-xs text-muted">{channels[item.channel]} · {item.createdAt.toISOString().slice(0, 10)}</span>
                      </span>
                      <Badge tone={item.status === "SENT" ? "positive" : item.status === "SENDING" ? "brand" : item.status === "CANCELLED" ? "warn" : "neutral"}>{statuses[item.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No campaigns yet. Start with the Analiva launch email.</p>}
          </Card>
          <Card title="How sending works">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
              <li>Save a draft, then send a test to yourself.</li>
              <li>The practice owner approves it.</li>
              <li>Send now or pick a time. Messages go out in batches every minute; email is paced so your mailbox isn't blocked.</li>
              <li>See who clicks and signs up (and who reads, on WhatsApp). Anyone who replies STOP or unsubscribes is never messaged again.</li>
              <li>Draft a follow-up for the people who didn't click.</li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
