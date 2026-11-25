import Link from "next/link";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { assignThread, closeThread, deleteSavedReply, replyInThread, saveSavedReply, sendLinkInThread } from "../growth-actions";
import { formatPhone, MarketingTabs } from "../shared";
import { Composer } from "./composer";

export const metadata = { title: "WhatsApp inbox" };

const TAGS = { all: "All", open: "Waiting", INTERESTED: "Interested", PRICE: "Price questions", CALLBACK: "Call-backs", COMPLAINT: "Complaints", STOP: "Opt-outs", mine: "Assigned to me" } as const;
type Filter = keyof typeof TAGS;
const tone = (tag: string | null) => (tag === "STOP" || tag === "COMPLAINT" ? "warn" : tag === "INTERESTED" ? "positive" : tag === "PRICE" || tag === "CALLBACK" ? "brand" : "neutral");
const sa = (d: Date) => d.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db, ctx } = await requireStaff();
  const params = await searchParams;
  const filter: Filter = Object.hasOwn(TAGS, params.f ?? "") ? (params.f as Filter) : "open";
  const latest = await db.whatsAppMessage.findMany({ orderBy: { receivedAt: "desc" }, take: 1500 });
  const threads = new Map<string, { phone: string; name: string | null; leadId: string | null; last: (typeof latest)[number]; open: number; tags: Set<string>; assignedTo: string | null }>();
  for (const m of latest) {
    const t = threads.get(m.fromPhone) ?? { phone: m.fromPhone, name: null, leadId: null, last: m, open: 0, tags: new Set<string>(), assignedTo: null };
    if (m.direction === "IN") {
      t.name ??= m.fromName;
      if (!m.handledAt && !m.optOut) t.open++;
      if (m.tag) t.tags.add(m.tag);
    }
    t.leadId ??= m.leadId;
    t.assignedTo ??= m.assignedTo;
    threads.set(m.fromPhone, t);
  }
  const leads = new Map((await db.marketingLead.findMany({ where: { id: { in: [...threads.values()].flatMap((t) => (t.leadId ? [t.leadId] : [])) } }, select: { id: true, name: true, company: true } })).map((l) => [l.id, l]));
  const list = [...threads.values()].filter((t) =>
    filter === "all" ? true : filter === "open" ? t.open > 0 : filter === "mine" ? t.assignedTo === ctx.userId : t.tags.has(filter),
  );
  const current = params.thread ? threads.get(params.thread) : list[0];
  const [messages, saved, staff] = await Promise.all([
    current ? db.whatsAppMessage.findMany({ where: { fromPhone: current.phone }, orderBy: { receivedAt: "asc" }, take: 200 }) : [],
    db.marketingSavedReply.findMany({ orderBy: { title: "asc" } }),
    db.user.findMany({ where: { role: { in: ["OWNER", "STAFF"] }, disabledAt: null }, select: { id: true, name: true } }),
  ]);
  const lastIn = [...messages].reverse().find((m) => m.direction === "IN");
  const windowOpen = lastIn ? Date.now() - lastIn.receivedAt.getTime() < 24 * 3600_000 : false;
  const lead = current?.leadId ? leads.get(current.leadId) : undefined;
  const counts = Object.fromEntries((Object.keys(TAGS) as Filter[]).map((f) => [f, [...threads.values()].filter((t) => (f === "all" ? true : f === "open" ? t.open > 0 : f === "mine" ? t.assignedTo === ctx.userId : t.tags.has(f))).length]));

  return (
    <>
      <PageHeader title="Inbox" subtitle="Every WhatsApp reply in one place, sorted for you. Replies within 24 hours of a client's message are free." />
      <MarketingTabs active="/marketing/inbox" badge={[...threads.values()].filter((t) => t.open).length} />
      {params.error ? <Notice tone="warn">{params.error}</Notice> : null}
      <nav aria-label="Filter" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {(Object.keys(TAGS) as Filter[]).map((f) => (
          <Link key={f} href={`/marketing/inbox?f=${f}`} aria-current={f === filter ? "page" : undefined} className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm ${f === filter ? "border-brand bg-brand text-white" : "border-line hover:border-line-strong"}`}>
            {TAGS[f]} <span className="num text-xs opacity-75">{counts[f]}</span>
          </Link>
        ))}
      </nav>
      <div data-tour="inbox" className="grid items-start gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card title="Conversations" padded={false}>
          {list.length ? (
            <ul className="divide-y divide-line">
              {list.slice(0, 80).map((t) => {
                const who = (t.leadId && leads.get(t.leadId)?.name) || t.name || formatPhone(t.phone);
                return (
                  <li key={t.phone}>
                    <Link href={`/marketing/inbox?f=${filter}&thread=${encodeURIComponent(t.phone)}`} aria-current={current?.phone === t.phone ? "true" : undefined} className={`block px-4 py-3 hover:bg-subtle ${current?.phone === t.phone ? "bg-subtle" : ""}`}>
                      <span className="flex items-center justify-between gap-2"><b className="truncate text-sm font-medium">{who}</b><span className="shrink-0 text-[11px] text-faint">{sa(t.last.receivedAt)}</span></span>
                      <span className="mt-0.5 flex items-center justify-between gap-2"><span className="truncate text-xs text-muted">{t.last.direction === "OUT" ? "You: " : ""}{t.last.body}</span>{t.open ? <span className="num shrink-0 rounded-full bg-[#25d366] px-1.5 text-[11px] font-semibold text-white">{t.open}</span> : null}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <p className="p-4 text-sm text-muted">Nothing here. Replies to your campaigns arrive in this inbox.</p>}
        </Card>

        <div className="min-w-0 space-y-5">
          {current ? (
            <Card
              title={lead?.name ?? current.name ?? formatPhone(current.phone)}
              description={`${formatPhone(current.phone)}${lead?.company ? ` · ${lead.company}` : ""}`}
              actions={lead ? <Link href={`/marketing/contacts?lead=${lead.id}`} className="text-sm text-brand hover:underline">Contact record</Link> : null}
            >
              <div className="max-h-[460px] space-y-2 overflow-y-auto rounded-xl bg-[#efeae2] p-3 dark:bg-subtle">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "OUT" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-[0_1px_0.5px_rgb(0_0_0/0.13)] ${m.direction === "OUT" ? "rounded-tr-none bg-[#d9fdd3] text-[#111b21]" : "rounded-tl-none bg-white text-[#111b21]"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] text-[#667781]">{m.tag && m.tag !== "OTHER" ? <Badge tone={tone(m.tag)}>{m.tag.toLowerCase()}</Badge> : null}{sa(m.receivedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Composer action={replyInThread.bind(null, current.phone)} saved={saved} disabled={windowOpen ? undefined : "The free 24-hour reply window has closed. Send a template, or reply from your phone."} />
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                {windowOpen ? <form action={sendLinkInThread.bind(null, current.phone)}><Button type="submit" variant="secondary" size="sm">Send their sign-up link</Button></form> : null}
                <form action={assignThread.bind(null, current.phone)} className="flex items-end gap-2">
                  <Field label="Assigned to"><Select name="userId" defaultValue={current.assignedTo ?? ""}><option value="">Nobody</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                  <Button type="submit" variant="secondary" size="sm">Assign</Button>
                </form>
                <form action={closeThread.bind(null, current.phone)} className="ml-auto"><Button type="submit" variant="ghost" size="sm">Mark as done</Button></form>
              </div>
            </Card>
          ) : null}

          <Card title="Saved replies" description="One tap to insert in a reply.">
            {saved.length ? (
              <ul className="mb-4 divide-y divide-line">
                {saved.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <span><b className="font-medium">{s.title}</b><span className="block text-muted">{s.body}</span></span>
                    <form action={deleteSavedReply.bind(null, s.id)}><Button type="submit" variant="ghost" size="sm">Delete</Button></form>
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={saveSavedReply} className="space-y-3">
              <Field label="Name"><Input name="title" required maxLength={80} placeholder="Pricing" /></Field>
              <Field label="Reply"><Textarea name="body" required maxLength={2000} rows={3} placeholder="Analiva is R 0 extra on your current plan. Shall I set it up for you?" /></Field>
              <div className="flex justify-end"><Button type="submit" variant="secondary">Save reply</Button></div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
