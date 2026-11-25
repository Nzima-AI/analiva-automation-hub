import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import { availableTemplates } from "@/lib/marketing/automation";
import { appUrl } from "@/lib/marketing/engine";
import { requireStaff } from "@/lib/session";
import { saveReminder, saveSequence, toggleReminder, toggleSequence } from "../growth-actions";
import { MarketingTabs } from "../shared";

export const metadata = { title: "Marketing automations" };

const TRIGGERS = { NEW_CONTACT: "A new contact is added", CAMPAIGN_SENT: "A campaign reaches them", SIGNED_UP: "They sign up" } as const;
const CONDITIONS = { ALL: "Always", NOT_CLICKED: "Only if they haven't clicked", NOT_SIGNED_UP: "Only if they haven't signed up" } as const;

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db } = await requireStaff();
  const params = await searchParams;
  const [{ templates }, sequences, reminders, campaigns, whatsapp, enrolled, topReferrers] = await Promise.all([
    availableTemplates(db),
    db.marketingSequence.findMany({ orderBy: { createdAt: "desc" } }),
    db.reminderRule.findMany({ orderBy: { createdAt: "desc" } }),
    db.marketingCampaign.findMany({ where: { channel: "WHATSAPP" }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, name: true } }),
    db.whatsAppSetting.findFirst(),
    db.sequenceEnrollment.groupBy({ by: ["sequenceId"], _count: { _all: true } }),
    db.referralEvent.groupBy({ by: ["referrerId"], where: { kind: "SIGNED_UP" }, _count: { _all: true }, orderBy: { _count: { referrerId: "desc" } }, take: 5 }),
  ]);
  const referrers = new Map((await db.marketingLead.findMany({ where: { id: { in: topReferrers.map((r) => r.referrerId) } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
  const marketing = templates.filter((t) => t.category !== "UTILITY");
  const utility = templates.filter((t) => t.category === "UTILITY");
  const options = (list: typeof templates) => list.map((t) => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} ({t.language})</option>);
  const waNumber = whatsapp?.displayNumber?.replace(/\D/g, "") ?? "";
  const waLink = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent("Hi, I'd like to know more about Analiva")}` : null;

  return (
    <>
      <PageHeader title="Automations" subtitle="Set them up once and they keep working: follow-ups, reminders, referrals and your WhatsApp link." />
      <MarketingTabs active="/marketing/automations" />
      {params.saved ? <Notice tone="positive">Saved.</Notice> : null}
      {params.error ? <Notice tone="warn">{params.error}</Notice> : null}

      <div data-tour="automations" className="grid items-start gap-5 xl:grid-cols-2">
        <Card title="Follow-up sequences" description="Messages that go out on their own after something happens, with a delay and a condition per step.">
          {sequences.length ? (
            <ul className="mb-4 divide-y divide-line">
              {sequences.map((s) => {
                const steps = (s.steps as Array<{ template: string; delayHours: number; condition: string }>) ?? [];
                return (
                  <li key={s.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <b className="font-medium">{s.name}</b> <Badge tone={s.active ? "positive" : "neutral"}>{s.active ? "On" : "Off"}</Badge>
                      <span className="block text-xs text-muted">When {TRIGGERS[s.trigger as keyof typeof TRIGGERS]?.toLowerCase() ?? s.trigger} · {enrolled.find((e) => e.sequenceId === s.id)?._count._all ?? 0} people so far</span>
                      <span className="block text-xs text-muted">{steps.map((st, i) => `${i + 1}. ${st.template} after ${st.delayHours} h`).join(" → ")}</span>
                    </span>
                    <form action={toggleSequence.bind(null, s.id)}><Button type="submit" variant="secondary" size="sm">{s.active ? "Switch off" : "Switch on"}</Button></form>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <form action={saveSequence} className="space-y-3">
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <Field label="Name"><Input name="name" required maxLength={120} placeholder="Launch follow-up" /></Field>
              <Field label="Start when"><Select name="trigger">{Object.entries(TRIGGERS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            </div>
            <Field label="Campaign (for &quot;A campaign reaches them&quot;)"><Select name="triggerRef" defaultValue=""><option value="">Not needed</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            {[1, 2, 3].map((n) => (
              <div key={n} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1.3fr)_100px_minmax(0,1fr)]">
                <Field label={`Step ${n}: template`}><Select name={`template${n}`} defaultValue="" required={n === 1}><option value="">{n === 1 ? "Choose" : "No step"}</option>{options(marketing)}</Select></Field>
                <Field label="After (hours)"><Input name={`delay${n}`} type="number" min={0} max={2160} defaultValue={n === 1 ? 0 : n === 2 ? 72 : 168} /></Field>
                <Field label="Send"><Select name={`condition${n}`} defaultValue={n === 1 ? "ALL" : "NOT_SIGNED_UP"}>{Object.entries(CONDITIONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
              </div>
            ))}
            <Button type="submit">Create sequence</Button>
          </form>
        </Card>

        <div className="space-y-5">
          <Card title="Compliance reminders on WhatsApp" description="VAT201, EMP201 and CIPC deadlines from each client's tax profile, sent to their contacts at the utility rate (much cheaper than marketing).">
            {reminders.length ? (
              <ul className="mb-4 divide-y divide-line">
                {reminders.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span><b className="font-medium">Filings due in {r.daysBefore} days</b> <Badge tone={r.active ? "positive" : "neutral"}>{r.active ? "On" : "Off"}</Badge><span className="block text-xs text-muted">Template {r.template} · last run {r.lastRunAt?.toISOString().slice(0, 10) ?? "not yet"}</span></span>
                    <form action={toggleReminder.bind(null, r.id)}><Button type="submit" variant="secondary" size="sm">{r.active ? "Switch off" : "Switch on"}</Button></form>
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={saveReminder} className="grid items-start gap-3 sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:items-end">
              <input type="hidden" name="kind" value="FILING_DUE" />
              <Field label="Days before"><Input name="daysBefore" type="number" min={0} max={60} defaultValue={5} /></Field>
              <Field label="Utility template"><Select name="template" required defaultValue="">{utility.length ? <option value="" disabled>Choose</option> : <option value="">Create a utility template in Meta first</option>}{options(utility)}</Select></Field>
              <Button type="submit" variant="secondary">Add reminder</Button>
            </form>
            <p className="mt-2 text-xs text-muted">Reminders reach contacts linked to a client. Link them with &quot;Sync my clients&quot; on the Contacts tab.</p>
          </Card>

          <Card title="Referrals" description={`Every contact has a personal link to share, e.g. ${appUrl()}/j/… Sign-ups through it count towards the person who shared it.`}>
            {topReferrers.length ? (
              <ul className="divide-y divide-line text-sm">
                {topReferrers.map((r) => <li key={r.referrerId} className="flex justify-between py-1.5"><span>{referrers.get(r.referrerId) ?? "Contact"}</span><span className="num">{r._count._all} sign-ups</span></li>)}
              </ul>
            ) : <p className="text-sm text-muted">Top referrers appear here. Put {"{{referral}}"} links in a thank-you message after sign-up.</p>}
          </Card>

          <Card title="Your WhatsApp link and QR code" description="For your email signature, website, invoices and a poster at reception. People who message you land in the Inbox.">
            {waLink ? (
              <div className="flex flex-wrap items-center gap-4">
                {/* QR image from a public generator: the link only contains your public business number. */}
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(waLink)}`} alt="QR code that opens a WhatsApp chat with the practice" width={160} height={160} className="rounded-xl border border-line" />
                <div className="min-w-0 flex-1 space-y-2 text-sm">
                  <Field label="Chat link"><Input readOnly value={waLink} /></Field>
                  <a href={`https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&margin=24&data=${encodeURIComponent(waLink)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-brand hover:underline">Download a large QR code for printing</a>
                </div>
              </div>
            ) : <p className="text-sm text-muted">Appears once your WhatsApp number is connected under Settings.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
