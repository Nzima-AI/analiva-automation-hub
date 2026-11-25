import Link from "next/link";
import { Broadcast } from "@phosphor-icons/react/dist/ssr";
import { randFromCents, renderMerge, TEMPLATE_FIELDS } from "@aah/core";
import type { MarketingCampaign } from "@aah/db";
import { Funnel } from "@/components/marketing/funnel";
import { PhonePreview } from "@/components/marketing/phone-preview";
import { Badge, Button, ButtonLink, Card, Field, Input, Notice, PageHeader, Select, StatCard, Textarea, Toggle } from "@/components/ui";
import { availableTemplates } from "@/lib/marketing/automation";
import { campaignStats, estimateCampaign, marketingSettings } from "@/lib/marketing/engine";
import { requireStaff } from "@/lib/session";
import { tierLimit, type WaTemplate } from "@/lib/whatsapp";
import { approveCampaign, cancelCampaign, createCampaign, createFollowUp, editCampaign, sendCampaign, testCampaign } from "../actions";
import { resumeCampaign } from "../growth-actions";
import { channels, interests, MarketingTabs, Options, statuses } from "../shared";
import { TemplatePicker } from "./template-picker";

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
const saTime = (d: Date) => d.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });
const key = (t: WaTemplate) => `${t.name}|${t.language}`;
const tone = (s: string) => (s === "SENT" ? "positive" : s === "SENDING" ? "brand" : s === "CANCELLED" || s === "PAUSED" ? "warn" : "neutral");

function CampaignFields({ draft, channel, templates, tpl }: { draft?: Partial<MarketingCampaign>; channel: "EMAIL" | "WHATSAPP"; templates: WaTemplate[]; tpl: string }) {
  const options = templates.map((t) => ({ value: key(t), label: `${t.name} (${t.language}, ${t.category.toLowerCase()}${t.quickReplies?.length ? ", buttons" : ""}${t.carousel ? ", carousel" : ""})` }));
  const chosen = templates.find((t) => key(t) === tpl);
  return (
    <>
      <input type="hidden" name="channel" value={channel} />
      <Field label="Campaign name"><Input name="name" defaultValue={draft?.name} required maxLength={160} /></Field>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field label="Service interest"><Select name="interest" defaultValue={draft?.interest ?? "ALL"}><option value="ALL">Everyone</option><Options values={interests} /></Select></Field>
        <Field label="Segments" hint="Contacts must have all of these. Empty: everyone."><Input name="tags" defaultValue={draft?.tags?.join(", ")} maxLength={400} placeholder="past client" /></Field>
      </div>
      <Field label="Link to track" hint="Where {{link}} sends people, e.g. the Analiva sign-up page. Each contact gets a personal link, so you see who clicked and who signed up.">
        <Input name="ctaUrl" type="url" defaultValue={draft?.ctaUrl ?? ""} maxLength={500} placeholder="https://analiva.app/..." />
      </Field>
      {channel === "EMAIL" ? (
        <>
          <Field label="Subject"><Input name="subject" defaultValue={draft?.subject} required maxLength={200} /></Field>
          <Field label="Message" hint="Use {{firstName}}, {{name}}, {{company}} and {{link}}. An unsubscribe link is added to every email."><Textarea name="body" defaultValue={draft?.body} required maxLength={12000} rows={8} /></Field>
        </>
      ) : (
        <>
          <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
            <Field label="WhatsApp template" hint="Only templates Meta has approved are listed."><TemplatePicker name="template" options={options} value={tpl} required /></Field>
            <Field label="Message type" hint="Utility costs about a quarter."><Select name="category" defaultValue={draft?.category ?? chosen?.category ?? "MARKETING"}><option value="MARKETING">Marketing</option><option value="UTILITY">Utility</option></Select></Field>
          </div>
          <Field label="Template fields" hint={`What fills {{1}}, {{2}}... in order. Choose from: ${Object.keys(TEMPLATE_FIELDS).join(", ")}.`}>
            <Input name="templateParams" defaultValue={draft?.templateParams?.join(", ") ?? "firstName, link"} maxLength={200} />
          </Field>
          {chosen?.urlButton ? <input type="hidden" name="urlButton" value="true" /> : null}
          <div data-tour="campaign-options" className="space-y-3 rounded-xl border border-line p-3">
            <p className="text-sm font-medium">Smart sending</p>
            <Toggle name="bestTime" defaultChecked={draft?.bestTime ?? true} label="Send each person at their best time" hint="The hour they usually read WhatsApp, or your best hour overall. Quiet hours, Sundays and public holidays are always skipped." />
            <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
              <Field label="A/B test: second template" hint="Optional. The winner goes to everyone else."><Select name="variantTemplate" defaultValue={draft?.variantTemplate ? `${draft.variantTemplate}|${draft.variantLanguage ?? "en"}` : ""}><option value="">No test</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
              <Field label="Test on (%)"><Input name="testPercent" type="number" min={4} max={50} defaultValue={draft?.testPercent ?? 20} /></Field>
              <Field label="Decide after (h)"><Input name="testHours" type="number" min={1} max={72} defaultValue={draft?.testHours ?? 4} /></Field>
            </div>
            {chosen?.header && chosen.header !== "TEXT" ? (
              <div className="grid items-start gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                <Field label="Header"><Select name="headerType" defaultValue={draft?.headerType ?? chosen.header}><option value="IMAGE">Image</option><option value="VIDEO">Video</option><option value="DOCUMENT">PDF</option></Select></Field>
                <Field label="Header link (https)" hint="A brochure, product image or short demo video."><Input name="headerMediaUrl" type="url" defaultValue={draft?.headerMediaUrl ?? ""} maxLength={500} /></Field>
              </div>
            ) : null}
            {chosen?.carousel ? <Field label="Carousel card images (https, one per card)" hint="Separate with spaces or commas."><Textarea name="carouselMedia" rows={2} defaultValue={draft?.carouselMedia?.join("\n") ?? ""} /></Field> : null}
            {chosen?.quickReplies?.length ? <p className="text-xs text-muted">Buttons work on their own: &quot;Sign me up&quot; sends their personal link, &quot;Call me back&quot; adds a call-back, &quot;Not now&quot; pauses follow-ups for 30 days, STOP opts them out.</p> : null}
          </div>
          <Field label="Notes" hint="For your team; not sent."><Textarea name="body" defaultValue={draft?.body} maxLength={2000} rows={2} /></Field>
        </>
      )}
    </>
  );
}

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db, ctx, practice } = await requireStaff();
  const params = await searchParams;
  const campaignId = typeof params.campaign === "string" ? params.campaign : "";
  const channel = params.channel === "EMAIL" ? "EMAIL" : "WHATSAPP";
  const starter = typeof params.template === "string" && Object.hasOwn(starters, params.template) ? starters[params.template as keyof typeof starters] : undefined;

  const [campaigns, campaign, settings, waiting, sampleContacts, setting] = await Promise.all([
    db.marketingCampaign.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 40 }),
    campaignId ? db.marketingCampaign.findFirst({ where: { id: campaignId }, include: { parent: { select: { id: true, name: true } } } }) : null,
    marketingSettings(db),
    db.whatsAppMessage.count({ where: { direction: "IN", handledAt: null, optOut: false } }),
    db.marketingLead.findMany({ where: { phone: { not: null }, whatsappOptedOutAt: null }, select: { name: true, company: true }, take: 12, orderBy: { updatedAt: "desc" } }),
    db.whatsAppSetting.findFirst(),
  ]);
  const { templates, error: templateError } = await availableTemplates(db);
  const [stats, estimate, failures] = campaign
    ? await Promise.all([
        campaignStats(db, campaign.id),
        ["DRAFT", "APPROVED"].includes(campaign.status) ? estimateCampaign(db, campaign) : null,
        db.marketingSend.findMany({ where: { campaignId: campaign.id, status: "FAILED" }, select: { toAddress: true, error: true }, take: 5 }),
      ])
    : [null, null, []];
  const campaignTpl = campaign?.whatsappTemplate ? `${campaign.whatsappTemplate}|${campaign.templateLanguage ?? "en"}` : "";
  const tpl = (params.tpl as string) || campaignTpl || (templates[0] ? key(templates[0]) : "");
  const previewTemplate = templates.find((t) => key(t) === tpl) ?? null;
  const previewParams = campaign?.templateParams?.length ? campaign.templateParams : ["firstName", "link"];
  const perDay = tierLimit(setting?.messagingTier, settings.dailyLimit);
  const canSendWa = Boolean(setting) || settings.demoMode;
  const showPhone = campaign ? campaign.channel === "WHATSAPP" : channel === "WHATSAPP";

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Write it, see it on a phone, test it on yourself, get it approved and send it at the best moment."
        actions={<div className="flex gap-2"><ButtonLink href="/marketing/campaigns?channel=WHATSAPP" size="sm">New WhatsApp campaign</ButtonLink><ButtonLink href="/marketing/campaigns?channel=EMAIL" variant="secondary" size="sm">New email</ButtonLink></div>}
      />
      <MarketingTabs active="/marketing/campaigns" badge={waiting} />
      {params.error ? <Notice tone="warn">{params.error}</Notice> : null}
      {params.tested ? <Notice tone="positive">{settings.demoMode ? "Test accepted (demo mode: nothing was really sent)." : "Test sent. Check your inbox or WhatsApp."}</Notice> : null}
      {params.queued ? <Notice tone="positive">{params.queued} messages queued. They go out at each person&apos;s send time, in batches every minute. Watch it live in Mission control.</Notice> : null}
      {templateError ? <Notice tone="warn">WhatsApp templates couldn&apos;t be loaded: {templateError}</Notice> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {campaign && stats ? (
            <Card
              title={campaign.name}
              description={`${channels[campaign.channel]} · ${campaign.interest ? interests[campaign.interest] : "Everyone"}${campaign.tags.length ? ` · ${campaign.tags.join(", ")}` : ""}${campaign.parent ? ` · follow-up to ${campaign.parent.name}` : ""}${campaign.variantTemplate ? ` · A/B test${campaign.winner ? `, ${campaign.winner} won` : ""}` : ""}`}
              actions={<Badge tone={tone(campaign.status)}>{statuses[campaign.status]}</Badge>}
            >
              {stats.total ? (
                <div className="mb-5 space-y-4">
                  <Funnel stats={stats} />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label="Replied" value={stats.replied} />
                    <StatCard label="Opted out" value={stats.optedOut} tone="warn" />
                    <StatCard label="Failed" value={stats.failed} tone={stats.failed ? "negative" : "neutral"} />
                    <StatCard label="Spent" value={randFromCents(stats.costCents)} hint={stats.signedUp ? `${randFromCents(Math.round(stats.costCents / stats.signedUp))} per sign-up` : undefined} />
                  </div>
                  {["SENDING", "PAUSED"].includes(campaign.status) ? <ButtonLink href={`/marketing/live?campaign=${campaign.id}`} variant="secondary" size="sm"><Broadcast size={16} /> Watch live</ButtonLink> : null}
                </div>
              ) : null}
              {failures.length ? (
                <div className="mb-4 rounded-xl border border-line p-3 text-sm">
                  <p className="font-medium">Why some failed</p>
                  <ul className="mt-1 space-y-0.5 text-muted">{failures.map((f, i) => <li key={i} className="break-words">{f.toAddress}: {f.error}</li>)}</ul>
                </div>
              ) : null}

              {campaign.channel === "EMAIL" ? (
                <div className="mb-4 rounded-xl border border-line bg-subtle p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Preview for {sample.name}</p>
                  <p className="text-sm font-medium">{renderMerge(campaign.subject, sample, campaign.ctaUrl)}</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2">{renderMerge(campaign.body, sample, campaign.ctaUrl ? `${campaign.ctaUrl} (personal link)` : null)}</p>
                </div>
              ) : null}

              {estimate ? (
                <div className="mb-4 grid gap-3 rounded-xl bg-subtle p-4 text-sm sm:grid-cols-3">
                  <div><p className="text-xs text-muted">Will receive it</p><p className="num text-xl font-semibold">{estimate.count.toLocaleString("en-US")}</p><p className="text-xs text-muted">with permission, not opted out</p></div>
                  <div><p className="text-xs text-muted">Estimated cost</p><p className="num text-xl font-semibold">{campaign.channel === "WHATSAPP" ? randFromCents(estimate.costCents) : "Free"}</p><p className="text-xs text-muted">{estimate.budgetLeft != null ? `${randFromCents(estimate.budgetLeft)} left this month` : "no monthly cap set"}</p></div>
                  <div><p className="text-xs text-muted">Sending time</p><p className="num text-xl font-semibold">{campaign.channel === "WHATSAPP" && estimate.count > perDay ? `${Math.ceil(estimate.count / perDay)} days` : "Same day"}</p><p className="text-xs text-muted">{campaign.channel === "WHATSAPP" ? `Meta allows ${perDay.toLocaleString("en-US")} new people a day` : "paced for your mailbox"}</p></div>
                  {estimate.overBudget ? <p className="text-warn sm:col-span-3">This is more than the budget left this month. Raise the budget under Settings or narrow the audience.</p> : null}
                </div>
              ) : null}

              {campaign.status === "DRAFT" ? (
                <form key={campaign.id} action={editCampaign.bind(null, campaign.id)} className="space-y-3">
                  <CampaignFields draft={campaign} channel={campaign.channel} templates={templates} tpl={tpl} />
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
                    <div className="grid items-start gap-3 sm:grid-cols-2">
                      <Field label="When"><Select name="when"><option value="now">Start now</option><option value="later">At the time below</option></Select></Field>
                      <Field label="Date and time (SA time)"><Input name="scheduledAt" type="datetime-local" /></Field>
                    </div>
                    <Button type="submit" disabled={campaign.channel === "WHATSAPP" && !canSendWa}>Send to {estimate?.count ?? 0} people{campaign.channel === "WHATSAPP" && estimate ? ` (about ${randFromCents(estimate.costCents)})` : ""}</Button>
                  </form>
                ) : null}
                {campaign.status === "PAUSED" && ctx.role === "OWNER" ? <form action={resumeCampaign.bind(null, campaign.id)}><Button type="submit">Resume campaign</Button></form> : null}
                {campaign.status === "SENDING" ? <p className="text-sm text-muted">{campaign.startedAt && campaign.startedAt > new Date() ? `Starts ${saTime(campaign.startedAt)}.` : `Sending since ${campaign.startedAt ? saTime(campaign.startedAt) : "now"}.`}</p> : null}
                {["APPROVED", "SENDING", "PAUSED"].includes(campaign.status) ? <form action={cancelCampaign.bind(null, campaign.id)}><Button type="submit" variant="secondary">Stop campaign</Button></form> : null}
                {["SENDING", "SENT", "PAUSED"].includes(campaign.status) ? (
                  <form action={createFollowUp.bind(null, campaign.id)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Field label="Follow up with the people who" className="flex-1"><Select name="rule"><Options values={followUps} /></Select></Field>
                    <Button type="submit" variant="secondary">Draft follow-up</Button>
                  </form>
                ) : null}
                {campaign.finishedAt ? <p className="text-xs text-faint">{campaign.status === "CANCELLED" ? "Stopped" : "Finished"} {saTime(campaign.finishedAt)}.</p> : null}
              </div>
            </Card>
          ) : (
            <Card title={channel === "WHATSAPP" ? "New WhatsApp campaign" : "New email campaign"} description={channel === "WHATSAPP" ? "Meta bills per delivered message, with no monthly fee. You see the cost before you send." : "Email costs nothing to send."}>
              {channel === "EMAIL" ? (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">Start from:</span>
                  {Object.entries(starters).map(([k, item]) => <Link key={k} href={`/marketing/campaigns?channel=EMAIL&template=${k}`} className="inline-flex min-h-9 items-center rounded-lg border border-line px-2.5 text-brand hover:border-line-strong">{item.name}</Link>)}
                </div>
              ) : !canSendWa ? (
                <Notice tone="brand">Connect your WhatsApp number under <Link className="underline" href="/marketing/settings">Settings</Link>, or switch on demo mode to try it first.</Notice>
              ) : null}
              <form key={`${channel}-${params.template ?? "blank"}`} action={createCampaign} className="space-y-3">
                <CampaignFields draft={starter} channel={channel} templates={templates} tpl={tpl} />
                <Button type="submit">Save draft</Button>
              </form>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          {showPhone ? (
            <Card title="On their phone" description="Exactly what your clients will see.">
              <PhonePreview practiceName={practice.name} template={previewTemplate} params={previewParams} contacts={sampleContacts} headerMediaUrl={campaign?.headerMediaUrl} />
            </Card>
          ) : null}
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
                      <Badge tone={tone(item.status)}>{statuses[item.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No campaigns yet.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
