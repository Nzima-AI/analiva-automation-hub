import Link from "next/link";
import { BookOpen, PenLine } from "lucide-react";
import { formatCents } from "@aah/core";
import { Badge, Card, Empty, Notice } from "@/components/ui";
import { formatCalendarDate, humanise } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { postManualJournal, reverseJournalEntry } from "../../actions";
import { JournalEditor } from "./journal-editor";

export const metadata = { title: "Journals" };

const sourceTone = { INVOICE: "brand", PAYMENT: "positive", BANK: "neutral", MANUAL: "warn", OPENING: "neutral", REVERSAL: "danger" } as const;

export default async function JournalsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ error?: string; posted?: string; source?: string }> }) {
  const { db } = await requireStaff();
  const { clientId } = await params;
  const { error, posted, source } = await searchParams;
  const sources = ["INVOICE", "PAYMENT", "BANK", "MANUAL", "OPENING", "REVERSAL"] as const;
  const src = sources.find((s) => s === source);
  const [entries, accounts] = await Promise.all([
    db.journalEntry.findMany({
      where: { clientId, ...(src ? { source: src } : {}) },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { lines: { include: { account: { select: { code: true, name: true } } } }, reversedBy: { select: { id: true } } },
    }),
    db.ledgerAccount.findMany({ where: { clientId, isActive: true }, orderBy: { code: "asc" }, select: { code: true, name: true } }),
  ]);

  return (
    <div className="space-y-6">
      {error ? <Notice>{error}</Notice> : null}
      {posted ? <Notice tone="positive">Journal posted.</Notice> : null}
      <Card title="New journal" description="Adjustments, depreciation, opening balances, accruals. Debits must equal credits." icon={PenLine}>
        <JournalEditor action={postManualJournal.bind(null, clientId)} accounts={accounts} />
      </Card>

      <Card title="Journal register" icon={BookOpen} padded={false}>
        <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3 text-sm">
          <Link href={`/books/${clientId}/journals`} className={!src ? "font-medium text-brand-text" : "text-muted hover:text-ink"}>
            All
          </Link>
          {sources.map((s) => (
            <Link key={s} href={`/books/${clientId}/journals?source=${s}`} className={`ml-3 ${src === s ? "font-medium text-brand-text" : "text-muted hover:text-ink"}`}>
              {humanise(s)}
            </Link>
          ))}
        </div>
        {entries.length === 0 ? (
          <Empty icon={BookOpen}>No journals yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((e) => {
              const total = e.lines.reduce((s, l) => s + l.debitCents, 0n);
              return (
                <li key={e.id} className="px-5 py-3">
                  <details>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="w-24 shrink-0 text-xs text-faint tabular">{formatCalendarDate(e.date)}</span>
                        <Badge tone={sourceTone[e.source]}>{humanise(e.source)}</Badge>
                        <span className="truncate text-sm text-ink">{e.description}</span>
                        {e.reversedBy ? <Badge tone="danger">Reversed</Badge> : null}
                      </span>
                      <span className="font-medium tabular">{formatCents(total)}</span>
                    </summary>
                    <table className="mt-3 w-full text-sm">
                      <tbody>
                        {e.lines.map((l) => (
                          <tr key={l.id} className="text-ink-2">
                            <td className="py-1 pl-28">
                              <Link href={`/books/${clientId}/reports?r=gl&account=${l.account.code}`} className="hover:text-brand-text">
                                <span className="mr-2 text-faint tabular">{l.account.code}</span>
                                {l.account.name}
                              </Link>
                            </td>
                            <td className="w-32 py-1 text-right tabular">{l.debitCents ? formatCents(l.debitCents) : ""}</td>
                            <td className="w-32 py-1 text-right tabular">{l.creditCents ? formatCents(l.creditCents) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(e.source === "MANUAL" || e.source === "OPENING") && !e.reversedBy ? (
                      <form action={reverseJournalEntry.bind(null, clientId, e.id)} className="mt-2 flex justify-end gap-2 pl-28">
                        <input name="reason" placeholder="Reason" className="h-8 rounded-lg border border-line bg-panel px-2 text-xs" />
                        <button className="text-xs font-medium text-danger hover:underline">Reverse</button>
                      </form>
                    ) : null}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
