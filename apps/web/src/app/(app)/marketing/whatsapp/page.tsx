import Link from "next/link";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Textarea } from "@/components/ui";
import { appUrl } from "@/lib/marketing/engine";
import { requireStaff } from "@/lib/session";
import { checkConnection } from "@/lib/whatsapp";
import { markHandled, replyToMessage, saveWhatsApp } from "../actions";
import { formatPhone, MarketingTabs } from "../shared";

export const metadata = { title: "WhatsApp" };

const saTime = (d: Date) => d.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db, ctx } = await requireStaff();
  const params = await searchParams;
  const [setting, messages, unread] = await Promise.all([
    db.whatsAppSetting.findFirst(),
    db.whatsAppMessage.findMany({ orderBy: { receivedAt: "desc" }, take: 40 }),
    db.whatsAppMessage.count({ where: { handledAt: null } }),
  ]);
  const leads = messages.length
    ? await db.marketingLead.findMany({ where: { id: { in: messages.flatMap((m) => (m.leadId ? [m.leadId] : [])) } }, select: { id: true, name: true, company: true } })
    : [];
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const health = setting ? await checkConnection(setting) : null;
  const webhook = `${appUrl()}/api/webhooks/whatsapp`;
  const isOwner = ctx.role === "OWNER";

  return (
    <>
      <PageHeader title="Marketing" subtitle="Your WhatsApp Business number, through Meta directly: no monthly fee, Meta bills per delivered marketing message." />
      <MarketingTabs active="/marketing/whatsapp" badge={unread} />
      {params.error ? <Notice tone="warn">{params.error}</Notice> : null}
      {params.saved ? <Notice tone="positive">WhatsApp is connected.</Notice> : null}
      {params.replied ? <Notice tone="positive">Reply sent.</Notice> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card title="Replies" description="Messages your contacts send back. STOP replies opt them out automatically and get a confirmation.">
            {messages.length ? (
              <ul className="divide-y divide-line">
                {messages.map((message) => {
                  const lead = message.leadId ? leadById.get(message.leadId) : undefined;
                  const canReply = Date.now() - message.receivedAt.getTime() < 24 * 3600_000;
                  return (
                    <li key={message.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">
                            {lead ? <Link className="text-brand hover:underline" href={`/marketing?lead=${lead.id}`}>{lead.name}</Link> : message.fromName ?? "Unknown contact"}
                            <span className="font-normal text-muted"> · {formatPhone(message.fromPhone)}</span>
                          </p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-2">{message.body}</p>
                          <p className="mt-1 text-xs text-faint">{saTime(message.receivedAt)}</p>
                        </div>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {message.optOut ? <Badge tone="warn">Opted out</Badge> : null}
                          {!message.handledAt ? <Badge tone="brand">New</Badge> : null}
                        </span>
                      </div>
                      {!message.handledAt && !message.optOut ? (
                        <div className="mt-2 space-y-2">
                          {canReply ? (
                            <form action={replyToMessage.bind(null, message.id)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                              <Field label="Reply" className="flex-1"><Textarea name="text" required maxLength={4000} rows={2} /></Field>
                              <Button type="submit" size="sm">Send reply</Button>
                            </form>
                          ) : <p className="text-xs text-muted">Over 24 hours old: WhatsApp only allows a free reply within 24 hours. Reply from your phone.</p>}
                          <form action={markHandled.bind(null, message.id)}><Button type="submit" size="sm" variant="secondary">Mark as done</Button></form>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted">No replies yet. They appear here once WhatsApp is connected and a campaign has gone out.</p>}
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card title="Connection" description={setting ? `Number ${health?.ok ? health.displayNumber : setting.displayNumber ?? setting.phoneNumberId}` : "Not connected yet."}
            actions={setting ? <Badge tone={health?.ok ? "positive" : "warn"}>{health?.ok ? `Connected${health.quality ? ` · quality ${health.quality.toLowerCase()}` : ""}` : "Check failed"}</Badge> : null}>
            {setting && health && !health.ok ? <Notice tone="warn">Meta says: {health.error}</Notice> : null}
            {isOwner ? (
              <form action={saveWhatsApp} className="space-y-3">
                <Field label="Phone number ID"><Input name="phoneNumberId" inputMode="numeric" defaultValue={setting?.phoneNumberId} required maxLength={30} /></Field>
                <Field label="WhatsApp Business Account ID"><Input name="businessAccountId" inputMode="numeric" defaultValue={setting?.businessAccountId} required maxLength={30} /></Field>
                <Field label="Access token" hint={setting ? "Saved. Paste a new one only to replace it." : "A permanent token for a system user, with whatsapp_business_messaging and whatsapp_business_management."}>
                  <Input name="accessToken" type="password" autoComplete="off" maxLength={1000} required={!setting} />
                </Field>
                <Field label="App secret" hint={setting ? "Saved. Paste a new one only to replace it." : "Meta app → App settings → Basic. Used to check that webhook calls really come from Meta."}>
                  <Input name="appSecret" type="password" autoComplete="off" maxLength={200} required={!setting} />
                </Field>
                <Button type="submit">{setting ? "Save and check" : "Connect WhatsApp"}</Button>
              </form>
            ) : <p className="text-sm text-muted">The practice owner connects WhatsApp.</p>}
            {setting ? (
              <div className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
                <p className="font-medium">Webhook for the Meta app</p>
                <Field label="Callback URL"><Input readOnly value={webhook} /></Field>
                <Field label="Verify token"><Input readOnly value={setting.verifyToken} /></Field>
                <p className="text-xs text-muted">Subscribe the webhook to the <b>messages</b> field so delivery receipts and replies arrive here.</p>
              </div>
            ) : null}
          </Card>

          <Card title="Setting up (about 30 minutes, once)">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
              <li>At business.facebook.com, create or open the practice's Meta Business account and verify the business.</li>
              <li>At developers.facebook.com, create an app of type Business and add the WhatsApp product.</li>
              <li>Add a phone number that isn't used in the WhatsApp app (a new SIM, or a landline that can receive a code).</li>
              <li>Create a system user, give it the app and the WhatsApp account, and generate a permanent token.</li>
              <li>Paste the IDs, token and app secret here, then copy the webhook details above into the app.</li>
              <li>In WhatsApp Manager, create a marketing template (e.g. Hi {"{{1}}"}, Analiva is live: {"{{2}}"}) and wait for approval, usually minutes.</li>
              <li>Add a payment method in WhatsApp Manager. Meta bills per delivered message; there is no monthly fee.</li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
