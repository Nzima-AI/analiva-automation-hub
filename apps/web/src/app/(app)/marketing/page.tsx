import Link from "next/link";
import { ArrowRight, Broadcast, ChatCircleDots, Lightning, PaperPlaneTilt, Phone, Sparkle, TrendUp, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { DAY_NAMES, randFromCents } from "@aah/core";
import { Funnel } from "@/components/marketing/funnel";
import { LiveRefresh } from "@/components/marketing/live-refresh";
import { WhatsAppTourButton } from "@/components/tour/whatsapp-tour";
import { Badge, Button, ButtonLink, Card, Notice, PageHeader, StatCard } from "@/components/ui";
import { overviewData } from "@/lib/marketing/analytics";
import { requireStaff } from "@/lib/session";
import { completeTask, dismissAlert, seedDemoAction } from "./growth-actions";
import { formatPhone, MarketingTabs, statuses } from "./shared";

export const metadata = { title: "WhatsApp marketing" };

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default async function MarketingOverview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db, ctx } = await requireStaff();
  const params = await searchParams;
  const d = await overviewData(db);
  const tasks = await db.marketingTask.findMany({ where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 5 });
  const taskLeads = new Map((await db.marketingLead.findMany({ where: { id: { in: tasks.map((t) => t.leadId) } }, select: { id: true, name: true, phone: true } })).map((l) => [l.id, l]));
  const empty = d.contacts === 0;
  const budget = d.settings.monthlyBudgetCents;
  const live = d.live;

  return (
    <>
      <LiveRefresh seconds={10} />
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-1.5"><WhatsappLogo size={14} weight="fill" className="text-[#25d366]" /> WhatsApp marketing</span>}
        title="Mission control"
        subtitle="Every campaign, reply and sign-up as it happens."
        actions={<div className="flex flex-wrap gap-2"><WhatsAppTourButton /><ButtonLink href="/marketing/live" variant="secondary" size="sm"><Broadcast size={16} /> Live wall</ButtonLink><ButtonLink href="/marketing/campaigns" size="sm"><PaperPlaneTilt size={16} /> New campaign</ButtonLink></div>}
      />
      <MarketingTabs active="/marketing" badge={d.waiting} />
      {params.demo === "loaded" ? <Notice tone="positive">Demo loaded: 180 sample contacts, 8 weeks of campaign history and demo mode switched on. Start a campaign and watch it play out here.</Notice> : null}

      {empty ? (
        <Card title="Get started" description="Import your contacts, or load the demo to see everything working first." className="mb-6">
          <div className="flex flex-wrap gap-2">
            {ctx.role === "OWNER" ? <form action={seedDemoAction}><Button type="submit"><Sparkle size={16} /> Load the demo</Button></form> : null}
            <ButtonLink href="/marketing/contacts" variant="secondary">Import contacts</ButtonLink>
          </div>
        </Card>
      ) : null}

      <div data-tour="kpis" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Sent today" value={d.sentToday} hint={`${d.sentWeek} this week`} />
        <StatCard label="Read rate" value={`${d.readRate}%`} tone="brand" hint="last 7 days" />
        <StatCard label="Replies waiting" value={d.waiting} tone={d.waiting ? "warn" : "neutral"} href="/marketing/inbox" />
        <StatCard label="Sign-ups" value={d.signupsWeek} tone="positive" hint="last 7 days" />
        <StatCard label="WhatsApp spend" value={randFromCents(d.spent)} hint={budget ? `of ${randFromCents(budget)} this month` : "this month"} />
      </div>

      {d.alerts.length ? (
        <div className="mb-5 space-y-2">
          {d.alerts.map((a) => (
            <form key={a.id} action={dismissAlert.bind(null, a.id)} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm">
              <span className="flex items-start gap-2"><Lightning size={16} weight="fill" className="mt-0.5 shrink-0 text-warn" />{a.message}</span>
              <Button type="submit" variant="ghost" size="sm">Dismiss</Button>
            </form>
          ))}
        </div>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <div data-tour="mission-control">
            <Card
              title={live ? live.campaign.name : "No campaign running"}
              description={live ? `${statuses[live.campaign.status]}${live.campaign.startedAt ? ` · started ${live.campaign.startedAt.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" })}` : ""}` : "Start a campaign and it appears here, live."}
              actions={live ? <div className="flex gap-2"><Badge tone={live.campaign.status === "SENDING" ? "brand" : live.campaign.status === "PAUSED" ? "warn" : "positive"} dot>{statuses[live.campaign.status]}</Badge><Link href={`/marketing/campaigns?campaign=${live.campaign.id}`} className="text-sm text-brand hover:underline">Open</Link></div> : null}
            >
              {live ? (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <Funnel stats={live.stats} big />
                  <div className="space-y-3">
                    <div className="rounded-xl bg-subtle p-4">
                      <p className="text-xs text-muted">Spent so far</p>
                      <p className="num text-2xl font-semibold">{randFromCents(live.costCents)}</p>
                      <p className="mt-1 text-xs text-muted">{live.perSignup != null ? `${randFromCents(live.perSignup)} per sign-up` : "No sign-ups yet"}</p>
                    </div>
                    {live.forecast ? (
                      <div className="rounded-xl bg-subtle p-4">
                        <p className="flex items-center gap-1.5 text-xs text-muted"><TrendUp size={14} /> Forecast ({live.forecast.confidence} estimate)</p>
                        <p className="num text-2xl font-semibold">{live.forecast.signedUp} sign-ups</p>
                        <p className="mt-1 text-xs text-muted">and about {live.forecast.clicked} clicks when replies settle</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="lg:col-span-2">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><ChatCircleDots size={16} /> Latest replies</p>
                    {live.replies.length ? (
                      <ul className="divide-y divide-line">
                        {live.replies.map((r) => (
                          <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                            <span className="min-w-0"><b className="font-medium">{r.fromName ?? formatPhone(r.fromPhone)}</b> <span className="text-ink-2">{r.body}</span></span>
                            {r.tag && r.tag !== "OTHER" ? <Badge tone={r.tag === "STOP" || r.tag === "COMPLAINT" ? "warn" : r.tag === "INTERESTED" ? "positive" : "brand"}>{r.tag.toLowerCase()}</Badge> : null}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-muted">Replies appear here as they arrive.</p>}
                  </div>
                </div>
              ) : <ButtonLink href="/marketing/campaigns">Create a campaign <ArrowRight size={14} /></ButtonLink>}
            </Card>
          </div>

          <div data-tour="best-times">
            <Card title="When your clients respond" description="Best send times from your campaigns so far (South African time).">
              {d.best.length ? (
                <ol className="grid gap-3 sm:grid-cols-3">
                  {d.best.map((c, i) => (
                    <li key={`${c.dow}-${c.hour}`} className="rounded-xl border border-line p-3">
                      <p className="text-xs text-muted">#{i + 1}</p>
                      <p className="text-lg font-semibold">{DAY_NAMES[c.dow]} {hourLabel(c.hour)}</p>
                      <p className="text-xs text-muted">{c.sent ? Math.round((c.read / c.sent) * 100) : 0}% read · {c.clicked} clicks · {c.signedUp} sign-ups</p>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-muted">After your first campaigns, the Hub shows the days and hours that bring the most results here.</p>}
              <Link href="/marketing/analytics" className="mt-3 inline-flex min-h-11 items-center text-sm text-brand hover:underline">See the full heatmap and analytics</Link>
            </Card>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div data-tour="hot-leads">
            <Card title="Who to phone today" description="Warmest contacts who haven't signed up yet.">
              {d.hot.length ? (
                <ul className="divide-y divide-line">
                  {d.hot.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/marketing/contacts?lead=${l.id}`} className="min-w-0">
                        <span className="block truncate text-sm font-medium">{l.name}</span>
                        <span className="block truncate text-xs text-muted">{l.company}{l.bestHour != null ? ` · reads around ${hourLabel(l.bestHour)}` : ""}</span>
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge tone={l.band === "Hot" ? "danger" : "warn"}>{l.band} {l.score}</Badge>
                        {l.phone ? <a href={`tel:+${l.phone}`} className="grid h-11 w-11 place-items-center rounded-full border border-line hover:bg-subtle" aria-label={`Call ${l.name}`}><Phone size={16} /></a> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Contacts who read, click or reply show up here.</p>}
            </Card>
          </div>

          <Card title="Call-backs" description={tasks.length ? "People who asked you to call them." : "No call-backs waiting."}>
            {tasks.length ? (
              <ul className="divide-y divide-line">
                {tasks.map((t) => {
                  const lead = taskLeads.get(t.leadId);
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0"><b className="font-medium">{lead?.name ?? "Contact"}</b>{t.note ? <span className="block truncate text-xs text-muted">“{t.note}”</span> : null}</span>
                      <span className="flex shrink-0 gap-2">
                        {lead?.phone ? <a href={`tel:+${lead.phone}`} className="grid h-11 w-11 place-items-center rounded-full border border-line hover:bg-subtle" aria-label={`Call ${lead.name}`}><Phone size={16} /></a> : null}
                        <form action={completeTask.bind(null, t.id)}><Button type="submit" variant="secondary" size="sm">Done</Button></form>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Card>

          <Card title="WhatsApp number" description={d.whatsapp ? `${d.whatsapp.displayNumber ?? d.whatsapp.phoneNumberId}` : d.settings.demoMode ? "Demo mode: no number needed yet." : "Not connected yet."}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted">Quality</dt><dd className="font-medium">{d.whatsapp?.qualityRating?.toLowerCase() ?? "not checked yet"}</dd></div>
              <div><dt className="text-xs text-muted">Daily limit</dt><dd className="font-medium">{d.whatsapp?.messagingTier?.replace("TIER_", "") ?? d.settings.dailyLimit} people</dd></div>
              <div><dt className="text-xs text-muted">Reachable on WhatsApp</dt><dd className="font-medium">{d.reachable.toLocaleString("en-US")} of {d.contacts.toLocaleString("en-US")}</dd></div>
              <div><dt className="text-xs text-muted">Call-backs open</dt><dd className="font-medium">{d.tasks}</dd></div>
            </dl>
            <Link href="/marketing/settings" className="mt-2 inline-flex min-h-11 items-center text-sm text-brand hover:underline">Settings and limits</Link>
          </Card>
        </div>
      </div>
    </>
  );
}
