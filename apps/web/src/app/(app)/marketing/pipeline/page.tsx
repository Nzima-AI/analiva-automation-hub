import Link from "next/link";
import { engagementScore, type EngagementBand } from "@aah/core";
import { Badge, Button, PageHeader, Select, type BadgeTone } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { moveLeadStage } from "../growth-actions";
import { formatPhone, MarketingTabs, stages } from "../shared";

export const metadata = { title: "Pipeline" };

const COLUMNS = ["NEW", "CONTACTED", "QUALIFIED", "WON"] as const;
const PER_COLUMN = 40;
const bandTone: Record<EngagementBand, BadgeTone> = { Customer: "positive", Hot: "danger", Warm: "warn", Cold: "neutral", Dormant: "neutral", New: "brand" };

/** The WhatsApp contacts as a sales pipeline: one column per stage, warmest first, moved with one click. */
export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db } = await requireStaff();
  const { tag: rawTag } = await searchParams;
  const tag = (rawTag ?? "").trim().toLowerCase().slice(0, 40);
  const base = { whatsappOptedOutAt: null, ...(tag ? { tags: { has: tag } } : {}) };
  const [columns, counts, closed] = await Promise.all([
    Promise.all(COLUMNS.map((stage) => db.marketingLead.findMany({
      where: { ...base, stage },
      select: { id: true, name: true, company: true, phone: true, tags: true, lastRepliedAt: true, signedUpAt: true, sends: { select: { sentAt: true, readAt: true, clickedAt: true, repliedAt: true, signedUpAt: true }, orderBy: { createdAt: "desc" }, take: 20 } },
      orderBy: [{ lastRepliedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      take: PER_COLUMN * 3,
    }))),
    Promise.all(COLUMNS.map((stage) => db.marketingLead.count({ where: { ...base, stage } }))),
    db.marketingLead.count({ where: { ...base, stage: "CLOSED" } }),
  ]);
  const scored = columns.map((leads) => leads
    .map((l) => ({ ...l, ...engagementScore(l.sends, l.signedUpAt) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, PER_COLUMN));

  return (
    <>
      <PageHeader title="Pipeline" subtitle="Every WhatsApp contact by stage, warmest first. Move a contact as the conversation moves; Won marks them as signed up." />
      <MarketingTabs active="/marketing/pipeline" />
      <form className="mb-4 flex flex-wrap items-center gap-2 text-sm" action="/marketing/pipeline">
        <label htmlFor="pipeline-tag" className="text-muted">Segment</label>
        <input id="pipeline-tag" name="tag" defaultValue={tag} placeholder="e.g. past client" className="h-9 w-48 rounded-lg border border-line bg-panel px-3 text-sm" />
        <Button type="submit" variant="secondary" size="sm">Filter</Button>
        {tag ? <Link href="/marketing/pipeline" className="text-brand-text hover:underline">Clear</Link> : null}
        <span className="ml-auto text-muted">{closed} closed (not shown)</span>
      </form>
      <div data-tour="pipeline" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((stage, c) => (
          <section key={stage} className="min-w-0 rounded-[1.25rem] border border-line bg-panel-2 p-3 shadow-[0_1px_0_var(--hl)_inset]">
            <header className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-ink">{stages[stage]}</h2>
              <span className="num rounded-md bg-subtle px-2 py-0.5 text-xs text-muted">{counts[c]}</span>
            </header>
            <ul className="space-y-2">
              {scored[c]!.map((l) => (
                <li key={l.id} className="rounded-xl border border-line bg-panel p-3 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/marketing/contacts?lead=${l.id}`} className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink hover:text-brand-text">{l.name}</span>
                      <span className="block truncate text-xs text-muted">{l.company || formatPhone(l.phone)}</span>
                    </Link>
                    <Badge tone={bandTone[l.band]}>{l.band}</Badge>
                  </div>
                  {l.lastRepliedAt ? <p className="mt-1.5 text-xs text-faint">Replied {l.lastRepliedAt.toISOString().slice(0, 10)}</p> : null}
                  <form action={moveLeadStage.bind(null, l.id)} className="mt-2 flex items-center gap-1.5">
                    <Select name="stage" defaultValue={stage} aria-label={`Stage for ${l.name}`} className="h-8 text-xs">
                      {Object.entries(stages).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </Select>
                    <Button type="submit" variant="ghost" size="sm">Move</Button>
                  </form>
                </li>
              ))}
              {counts[c]! > PER_COLUMN ? <li className="px-1 text-xs text-muted"><Link className="text-brand-text hover:underline" href={`/marketing/contacts?stage=${stage}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`}>All {counts[c]} in {stages[stage]}</Link></li> : null}
              {!counts[c] ? <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">No contacts here yet.</li> : null}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
