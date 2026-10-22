import { CalendarDots } from "@phosphor-icons/react/dist/ssr";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { clientDeadlines } from "@/lib/compliance";
import { formatCalendarDate } from "@/lib/format";
import { requireClient } from "@/lib/session";

export const metadata = { title: "Deadlines" };

export default async function PortalDeadlinesPage() {
  const { db, clientId, practice } = await requireClient();
  const today = new Date(new Date().toISOString().slice(0, 10));
  const items = await clientDeadlines(db, { from: new Date(today.getTime() - 90 * 86_400_000), to: new Date(today.getTime() + 365 * 86_400_000), clientId });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Deadlines" subtitle={`SARS and CIPC dates for your business. ${practice.name} marks each one off once it's filed.`} />
      <Card padded={false}>
        {items.length === 0 ? (
          <Empty icon={CalendarDots}>No deadlines on record yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((d) => (
              <li key={d.periodKey} className="flex items-center gap-4 px-5 py-3.5">
                <span className="w-28 shrink-0 font-display text-sm font-semibold tabular">{formatCalendarDate(d.dueDate)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.label}</span>
                  <span className="block text-xs text-muted">{d.periodLabel}</span>
                </span>
                {d.done ? <Badge tone="positive">Filed</Badge> : d.overdue ? <Badge tone="danger">Overdue</Badge> : <Badge>Upcoming</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-faint">Typical statutory dates. Your accountant confirms the exact dates on SARS eFiling.</p>
    </div>
  );
}
