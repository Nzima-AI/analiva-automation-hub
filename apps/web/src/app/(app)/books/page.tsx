import Link from "next/link";
import { ArrowRight, BookOpen, Briefcase } from "lucide-react";
import { Badge, Card, Empty, PageHeader, Table, Td } from "@/components/ui";
import { formatCalendarDate } from "@/lib/format";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Books & reports" };

export default async function BooksIndexPage() {
  const { db } = await requireStaff();
  const [clients, unmatched, lastJournal, entries] = await Promise.all([
    db.client.findMany({ where: { deletedAt: null, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, vatRegistered: true, financialYearEndMonth: true } }),
    db.bankTransaction.groupBy({ by: ["clientId"], where: { status: "UNMATCHED" }, _count: { _all: true } }),
    db.journalEntry.groupBy({ by: ["clientId"], _max: { date: true } }),
    db.journalEntry.groupBy({ by: ["clientId"], _count: { _all: true } }),
  ]);
  const u = new Map(unmatched.map((x) => [x.clientId, x._count._all]));
  const last = new Map(lastJournal.map((x) => [x.clientId, x._max.date]));
  const count = new Map(entries.map((x) => [x.clientId, x._count._all]));

  return (
    <div>
      <PageHeader
        title="Books & reports"
        subtitle="Each client's double-entry ledger, built from captured invoices and imported bank statements. Statements, VAT201 and ratios are produced from it."
      />
      <Card padded>
        {clients.length === 0 ? (
          <Empty icon={Briefcase} action={<Link href="/clients/new" className="text-sm font-medium text-brand-text hover:underline">Add a client</Link>}>
            No clients yet.
          </Empty>
        ) : (
          <Table head={["Client", "VAT", "Journals", "Last entry", "Bank lines to code", ""]}>
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-subtle/60">
                <Td>
                  <Link href={`/books/${c.id}`} className="font-medium text-ink hover:text-brand-text">
                    {c.name}
                  </Link>
                  <div className="text-xs text-faint">{c.code}</div>
                </Td>
                <Td>{c.vatRegistered ? <Badge tone="brand">Registered</Badge> : <Badge>No</Badge>}</Td>
                <Td className="tabular">{count.get(c.id) ?? 0}</Td>
                <Td className="tabular text-muted">{last.get(c.id) ? formatCalendarDate(last.get(c.id)!) : "—"}</Td>
                <Td>{u.get(c.id) ? <Badge tone="warn">{u.get(c.id)} to code</Badge> : <span className="text-faint">—</span>}</Td>
                <Td className="text-right">
                  <Link href={`/books/${c.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline">
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <p className="mt-4 flex items-center gap-2 text-xs text-faint">
        <BookOpen className="h-3.5 w-3.5" /> New clients get a standard South African chart of accounts the first time their books are opened.
      </p>
    </div>
  );
}
