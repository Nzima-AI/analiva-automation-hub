import Link from "next/link";
import { CalendarCheck2, CalendarClock, CircleAlert, ExternalLink } from "lucide-react";
import { Badge, Card, Empty, PageHeader, Select, StatCard, cx } from "@/components/ui";
import { clientDeadlines, type ClientDeadline } from "@/lib/compliance";
import { formatCalendarDate } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { setFiled } from "./actions";

export const metadata = { title: "Deadlines" };

const DAY = 86_400_000;

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ client?: string; show?: string }> }) {
  const { db } = await requireStaff();
  const sp = await searchParams;
  const today = new Date(new Date().toISOString().slice(0, 10));
  const showDone = sp.show === "all";
  const [all, clients, profiled] = await Promise.all([
    clientDeadlines(db, { from: new Date(today.getTime() - 120 * DAY), to: new Date(today.getTime() + 120 * DAY), clientId: sp.client || undefined }),
    db.client.findMany({ where: { deletedAt: null, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.client.count({ where: { deletedAt: null, status: { not: "ARCHIVED" }, OR: [{ vatRegistered: true }, { payeRegistered: true }, { incorporationDate: { not: null } }] } }),
  ]);
  const visible = all.filter((d) => (showDone ? true : !d.done) && (d.overdue || d.dueDate.getTime() >= today.getTime() - 0 || d.done));
  const overdue = all.filter((d) => d.overdue);
  const week = all.filter((d) => !d.done && !d.overdue && d.dueDate.getTime() <= today.getTime() + 7 * DAY);
  const month = all.filter((d) => !d.done && !d.overdue && d.dueDate.getTime() <= today.getTime() + 30 * DAY);

  // Group by month of due date.
  const groups = new Map<string, ClientDeadline[]>();
  for (const d of visible) {
    const key = d.overdue ? "Overdue" : new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(d.dueDate);
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }

  return (
    <div>
      <PageHeader
        title="Deadlines"
        subtitle="SARS and CIPC dates worked out from each client's tax profile. Typical statutory dates: confirm on eFiling, especially during filing season."
        actions={
          <a href="https://www.sarsefiling.co.za" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-text hover:underline">
            SARS eFiling <ExternalLink className="h-3.5 w-3.5" />
          </a>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Overdue" value={overdue.length} icon={CircleAlert} tone={overdue.length ? "negative" : "positive"} />
        <StatCard label="Due in 7 days" value={week.length} icon={CalendarClock} tone={week.length ? "warn" : "neutral"} />
        <StatCard label="Due in 30 days" value={month.length} icon={CalendarCheck2} hint={`${profiled} client${profiled === 1 ? "" : "s"} with a tax profile`} />
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="client" defaultValue={sp.client ?? ""} className="w-64">
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="show" defaultValue={sp.show ?? ""} className="w-48">
          <option value="">Open only</option>
          <option value="all">Include filed</option>
        </Select>
        <button className="h-9 rounded-lg border border-line bg-panel px-3 text-sm hover:bg-subtle">Apply</button>
      </form>

      {groups.size === 0 ? (
        <Card>
          <Empty icon={CalendarClock}>
            Nothing due. Deadlines appear once clients have a tax profile: open a client, choose <strong>Edit</strong>, and set VAT, PAYE, year-end and incorporation date.
          </Empty>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([month, items]) => (
            <Card key={month} title={month} padded={false} className={month === "Overdue" ? "border-danger/30" : ""}>
              <ul className="divide-y divide-line">
                {items.map((d) => (
                  <li key={`${d.clientId}-${d.periodKey}`} className="flex flex-wrap items-center gap-4 px-5 py-3">
                    <div className="w-24 shrink-0">
                      <p className={cx("font-display text-sm font-semibold tabular", d.overdue ? "text-danger" : "text-ink")}>{formatCalendarDate(d.dueDate)}</p>
                      <p className="text-[11px] text-faint">{d.body}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cx("text-sm font-medium", d.done ? "text-muted line-through" : "text-ink")}>{d.label}</p>
                      <p className="text-xs text-muted">
                        <Link href={`/clients/${d.clientId}`} className="hover:underline">
                          {d.clientName}
                        </Link>{" "}
                        · {d.periodLabel}
                        {d.type === "VAT201" ? (
                          <>
                            {" · "}
                            <Link href={`/books/${d.clientId}/reports?r=vat&period=${d.periodKey.split(":")[1]}`} className="text-brand-text hover:underline">
                              VAT201 figures
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                    {d.done ? <Badge tone="positive">Filed</Badge> : d.overdue ? <Badge tone="danger">Overdue</Badge> : null}
                    <form action={setFiled.bind(null, d.clientId, d.periodKey, !d.done)}>
                      <button className={cx("rounded-lg border px-3 py-1.5 text-xs font-medium", d.done ? "border-line text-muted hover:text-ink" : "border-brand/30 bg-brand-soft text-brand-text hover:bg-brand/15")}>
                        {d.done ? "Undo" : "Mark filed"}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
