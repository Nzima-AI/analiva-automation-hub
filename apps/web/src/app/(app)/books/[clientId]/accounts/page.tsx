import Link from "next/link";
import { ListTree, Plus } from "lucide-react";
import { ACCOUNT_TYPE_INFO, ACCOUNT_TYPES, formatCents, natural, type AccountType } from "@aah/core";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { accountTotals } from "@/lib/books/ledger";
import { requireStaff } from "@/lib/session";
import { addLedgerAccount } from "../../actions";

export const metadata = { title: "Chart of accounts" };

export default async function AccountsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { db } = await requireStaff();
  const { clientId } = await params;
  const { error } = await searchParams;
  const [accounts, totals] = await Promise.all([
    db.ledgerAccount.findMany({ where: { clientId }, orderBy: { code: "asc" } }),
    accountTotals(db, clientId),
  ]);
  const balance = new Map(totals.map((t) => [t.accountId, natural(t)]));

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2">
        {error ? <Notice>{error}</Notice> : null}
        <Card title="Chart of accounts" description="Balances are all-time, in each account's natural sign" icon={ListTree} padded={false}>
          {ACCOUNT_TYPES.map((t: AccountType) => {
            const group = accounts.filter((a) => a.type === t);
            if (!group.length) return null;
            return (
              <div key={t} className="border-b border-line last:border-b-0">
                <h3 className="bg-panel-2 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">{ACCOUNT_TYPE_INFO[t].label}</h3>
                <ul className="divide-y divide-line">
                  {group.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                      <Link href={`/books/${clientId}/reports?r=gl&account=${a.code}`} className="flex min-w-0 items-center gap-3 hover:text-brand-text">
                        <span className="w-12 shrink-0 text-faint tabular">{a.code}</span>
                        <span className="truncate">{a.name}</span>
                        {a.systemKey ? <Badge>System</Badge> : null}
                      </Link>
                      <span className="tabular text-ink-2">{balance.get(a.id) ? formatCents(balance.get(a.id)!) : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Card>
      </div>
      <Card title="Add an account" icon={Plus}>
        <form action={addLedgerAccount.bind(null, clientId)} className="space-y-3">
          <Field label="Code" hint="Numbering: 1xxx income, 2xxx cost of sales, 3xxx expenses, 5-7xxx assets, 8xxx liabilities, 9xxx equity">
            <Input name="code" required inputMode="numeric" />
          </Field>
          <Field label="Name">
            <Input name="name" required />
          </Field>
          <Field label="Type">
            <Select name="type" defaultValue="EXPENSE">
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_INFO[t].label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" className="w-full">
            Add account
          </Button>
        </form>
      </Card>
    </div>
  );
}
