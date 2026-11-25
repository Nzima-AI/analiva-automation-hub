import { Badge, Button, Card, Field, Input, Notice, PageHeader, Textarea, Toggle } from "@/components/ui";
import { appUrl, marketingSettings, monthSpendCents } from "@/lib/marketing/engine";
import { requireStaff } from "@/lib/session";
import { checkConnection, tierLimit } from "@/lib/whatsapp";
import { saveWhatsApp } from "../actions";
import { clearDemoAction, saveMarketingSettings, seedDemoAction } from "../growth-actions";
import { MarketingTabs } from "../shared";

export const metadata = { title: "Marketing settings" };

const rand = (cents: number | null) => (cents == null ? "" : String(cents / 100));

export default async function MarketingSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db, ctx } = await requireStaff();
  const params = await searchParams;
  const [setting, settings, spent, demoContacts] = await Promise.all([db.whatsAppSetting.findFirst(), marketingSettings(db), monthSpendCents(db), db.marketingLead.count({ where: { tags: { has: "demo" } } })]);
  const health = setting ? await checkConnection(setting) : null;
  const isOwner = ctx.role === "OWNER";
  const limit = tierLimit(health?.ok ? health.tier : setting?.messagingTier, settings.dailyLimit);

  return (
    <>
      <PageHeader title="Settings" subtitle="Your WhatsApp number, costs and budget, sending hours and safety limits." />
      <MarketingTabs active="/marketing/settings" />
      {params.error ? <Notice tone="warn">{params.error}</Notice> : null}
      {params.saved ? <Notice tone="positive">Saved.</Notice> : null}
      {params.cleared ? <Notice tone="positive">Demo data removed ({params.cleared} contacts) and demo mode switched off.</Notice> : null}

      <div data-tour="settings" className="grid items-start gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <Card title="Budget, costs and sending hours" description={`WhatsApp spend this month: R ${(spent / 100).toFixed(2)}${settings.monthlyBudgetCents ? ` of R ${(settings.monthlyBudgetCents / 100).toFixed(0)}` : ""}.`}>
            <form action={saveMarketingSettings} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Monthly budget (R)" hint="Campaigns pause when it's used up. Empty: no cap."><Input name="monthlyBudget" type="number" min={0} step={50} defaultValue={rand(settings.monthlyBudgetCents)} disabled={!isOwner} /></Field>
                <Field label="Marketing message (R)" hint="Meta's rate; check its rate card."><Input name="marketingCost" type="number" min={0} step={0.01} defaultValue={rand(settings.marketingCostCents)} disabled={!isOwner} /></Field>
                <Field label="Utility message (R)" hint="Reminders and updates."><Input name="utilityCost" type="number" min={0} step={0.01} defaultValue={rand(settings.utilityCostCents)} disabled={!isOwner} /></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Quiet from (hour)"><Input name="quietStart" type="number" min={0} max={23} defaultValue={settings.quietStart} disabled={!isOwner} /></Field>
                <Field label="Until (hour)"><Input name="quietEnd" type="number" min={0} max={23} defaultValue={settings.quietEnd} disabled={!isOwner} /></Field>
                <Field label="Auto-pause at opt-outs (%)"><Input name="autoPausePct" type="number" min={1} max={50} defaultValue={settings.autoPausePct} disabled={!isOwner} /></Field>
                <Field label="Daily limit (people)" hint="Used until Meta reports your tier."><Input name="dailyLimit" type="number" min={1} defaultValue={settings.dailyLimit} disabled={!isOwner} /></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle name="skipSundays" defaultChecked={settings.skipSundays} label="No messages on Sundays" />
                <Toggle name="skipHolidays" defaultChecked={settings.skipHolidays} label="No messages on public holidays" hint="South African holidays, including Easter dates." />
                <Toggle name="weeklyReport" defaultChecked={settings.weeklyReport} label="Weekly report every Monday" hint="A one-page summary emailed to the practice owner." />
                <Toggle name="demoMode" defaultChecked={settings.demoMode} label="Demo mode" hint="WhatsApp isn't really sent; replies and results are simulated." />
              </div>
              <Field label="Out-of-hours auto-reply" hint="Sent once a day to people who message you during quiet hours (free within 24 hours). Empty: off.">
                <Textarea name="autoReplyText" rows={2} maxLength={1000} defaultValue={settings.autoReplyText ?? ""} placeholder="Thanks for your message! We're closed now and will reply first thing tomorrow." disabled={!isOwner} />
              </Field>
              {isOwner ? <Button type="submit">Save settings</Button> : <p className="text-sm text-muted">The practice owner changes these.</p>}
            </form>
          </Card>

          <Card title="Demo" description={demoContacts ? `${demoContacts} demo contacts loaded.` : "Load sample contacts and 8 weeks of history to see everything working."}>
            {isOwner ? (
              <div className="flex flex-wrap gap-2">
                {!demoContacts ? <form action={seedDemoAction}><Button type="submit" variant="secondary">Load the demo</Button></form> : null}
                {demoContacts ? <form action={clearDemoAction}><Button type="submit" variant="danger">Remove demo data</Button></form> : null}
              </div>
            ) : <p className="text-sm text-muted">The practice owner loads or removes the demo.</p>}
          </Card>
        </div>

        <div className="space-y-5">
          <Card
            title="WhatsApp number"
            description={setting ? `Number ${health?.ok ? health.displayNumber : setting.displayNumber ?? setting.phoneNumberId}` : "Not connected yet."}
            actions={setting ? <Badge tone={health?.ok ? "positive" : "warn"}>{health?.ok ? "Connected" : "Check failed"}</Badge> : null}
          >
            {setting && health?.ok ? (
              <dl className="mb-4 grid grid-cols-3 gap-3 text-sm">
                <div><dt className="text-xs text-muted">Quality</dt><dd className="font-medium">{health.quality ? health.quality.toLowerCase() : "unknown"}</dd></div>
                <div><dt className="text-xs text-muted">Tier</dt><dd className="font-medium">{health.tier ? health.tier.replace("TIER_", "") : "unknown"}</dd></div>
                <div><dt className="text-xs text-muted">New people per 24 h</dt><dd className="font-medium">{limit.toLocaleString("en-US")}</dd></div>
              </dl>
            ) : null}
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
                <Field label="Callback URL"><Input readOnly value={`${appUrl()}/api/webhooks/whatsapp`} /></Field>
                <Field label="Verify token"><Input readOnly value={setting.verifyToken} /></Field>
                <p className="text-xs text-muted">Subscribe the webhook to the <b>messages</b> field so receipts and replies arrive here.</p>
              </div>
            ) : null}
          </Card>

          <Card title="Setting up WhatsApp (about 30 minutes, once)">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
              <li>At business.facebook.com, create or open the practice&apos;s Meta Business account and verify the business (CIPC document and a utility bill or bank statement).</li>
              <li>At developers.facebook.com, create an app of type Business and add the WhatsApp product.</li>
              <li>Add a phone number that isn&apos;t used in the WhatsApp app (a new SIM, or a landline that can receive a code).</li>
              <li>Create a system user, give it the app and the WhatsApp account, and generate a permanent token.</li>
              <li>Paste the IDs, token and app secret here, then copy the webhook details into the app.</li>
              <li>In WhatsApp Manager, create your templates (marketing and utility), with quick-reply buttons such as &quot;Sign me up&quot;, &quot;Call me back&quot; and &quot;Not now&quot;. Approval usually takes minutes.</li>
              <li>Add a payment method in WhatsApp Manager. Meta bills per delivered message; there is no monthly fee.</li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
