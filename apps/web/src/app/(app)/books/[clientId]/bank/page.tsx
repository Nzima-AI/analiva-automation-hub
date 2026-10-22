import Link from "next/link";
import { notFound } from "next/navigation";
import { Bank, MagicWand, Plus, Sparkle, UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { ACCOUNT_TYPE_INFO, formatCents, suggestAccountCode, type AccountType } from "@aah/core";
import { Badge, Button, Card, Empty, Field, Input, Notice, Select } from "@/components/ui";
import { formatCalendarDate } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { addBankAccount, codeBankLine, ignoreBankLine, importBankStatement, matchBankLine, runAutoCoding, undoBankLine } from "../../actions";

export const metadata = { title: "Bank" };

const FILTERS = [
  { key: "UNMATCHED", label: "To code" },
  { key: "CODED", label: "Coded" },
  { key: "MATCHED", label: "Matched to invoices" },
  { key: "IGNORED", label: "Ignored" },
  { key: "ALL", label: "All" },
] as const;

const TYPE_ORDER: AccountType[] = ["EXPENSE", "COST_OF_SALES", "SALES", "OTHER_INCOME", "CURRENT_ASSET", "FIXED_ASSET", "CURRENT_LIABILITY", "LONG_TERM_LIABILITY", "EQUITY", "BANK", "INCOME_TAX"];

/** The distinctive words of a bank description, for a "remember" rule. */
function ruleTextFor(description: string): string {
  return description
    .split("·")[0]!
    .replace(/\b(pos|eft|debit order|purchase|payment|card|ref|fnb|absa|capitec|nedbank|stdbank|\d{2,}[\w/-]*)\b/gi, " ")
    .replace(/[^a-zA-Z& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ")
    .toLowerCase();
}

export default async function BankPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { db } = await requireStaff();
  const { clientId } = await params;
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.show)?.key ?? "UNMATCHED";

  const client = await db.client.findFirst({ where: { id: clientId }, select: { vatRegistered: true } });
  if (!client) notFound();
  const [accounts, bankAccounts, txns, counts, openInvoices, rules] = await Promise.all([
    db.ledgerAccount.findMany({ where: { clientId, isActive: true }, orderBy: { code: "asc" } }),
    db.bankAccount.findMany({ where: { clientId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { transactions: true } } } }),
    db.bankTransaction.findMany({
      where: { clientId, ...(filter === "ALL" ? {} : { status: filter }) },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 150,
      include: { invoice: { select: { id: true, invoiceNumber: true } }, rule: { select: { matchText: true } }, bankAccount: { select: { name: true } } },
    }),
    db.bankTransaction.groupBy({ by: ["status"], where: { clientId }, _count: { _all: true } }),
    db.invoice.findMany({
      where: { clientId, deletedAt: null, journalEntryId: { not: null }, status: { not: "REJECTED" } },
      select: { id: true, direction: true, invoiceNumber: true, totalCents: true, amountPaidCents: true, supplier: { select: { name: true } } },
      orderBy: { issueDate: "desc" },
      take: 300,
    }),
    db.bankRule.findMany({ where: { OR: [{ clientId }, { clientId: null }] }, orderBy: { timesApplied: "desc" }, take: 30 }),
  ]);
  const count = (k: string) => counts.find((c) => c.status === k)?._count._all ?? 0;
  const accountName = new Map(accounts.map((a) => [a.code, `${a.code} · ${a.name}`]));
  const grouped = TYPE_ORDER.map((t) => ({ type: t, items: accounts.filter((a) => a.type === t) })).filter((g) => g.items.length);
  const chartForSuggest = accounts.map((a) => ({ code: a.code, keywords: a.keywords }));
  const open = openInvoices.map((i) => ({ ...i, outstanding: i.totalCents - i.amountPaidCents })).filter((i) => i.outstanding > 0n);

  return (
    <div className="space-y-6">
      {sp.imported ? (
        <Notice tone="positive">
          Imported {sp.imported} new line{sp.imported === "1" ? "" : "s"}
          {Number(sp.duplicates) ? `, skipped ${sp.duplicates} already imported` : ""}
          {Number(sp.skipped) ? ` and ${sp.skipped} unreadable rows` : ""}. Matched {sp.matched} to invoices and coded {sp.coded} by rules; {sp.left} left to code.
        </Notice>
      ) : null}
      {sp.auto ? (
        <Notice tone="brand">
          Auto-coding: matched {sp.matched}, coded {sp.coded}, {sp.left} still to code.
        </Notice>
      ) : null}
      {sp.error ? <Notice>{sp.error}</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Import a bank statement" description="CSV from FNB, ABSA, Standard Bank, Nedbank, Capitec and most others" icon={UploadSimple} className="lg:col-span-2">
          <form action={importBankStatement.bind(null, clientId)} className="flex flex-wrap items-end gap-3">
            {bankAccounts.length > 1 ? (
              <Field label="Account" className="min-w-48">
                <Select name="bankAccountId">
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : bankAccounts[0] ? (
              <input type="hidden" name="bankAccountId" value={bankAccounts[0].id} />
            ) : null}
            <Field label="Statement file (.csv)" className="min-w-64 flex-1">
              <input
                type="file"
                name="statement"
                accept=".csv,text/csv,.txt"
                required
                className="block w-full text-sm text-muted file:mr-3 file:h-9 file:rounded-lg file:border file:border-line file:bg-panel file:px-3 file:text-sm file:text-ink hover:file:bg-subtle"
              />
            </Field>
            <Button type="submit">
              <UploadSimple className="h-4 w-4" /> Import
            </Button>
          </form>
          <p className="mt-3 text-xs text-faint">
            Re-importing an overlapping period is safe: lines already imported are skipped. Payments are matched to captured invoices by amount and reference, then your rules code the rest.
          </p>
        </Card>
        <Card title="Bank accounts" icon={Bank}>
          {bankAccounts.length === 0 ? <p className="text-sm text-muted">The first import creates the main current account.</p> : null}
          <ul className="space-y-2 text-sm">
            {bankAccounts.map((b) => (
              <li key={b.id} className="flex justify-between">
                <span>
                  {b.name}
                  {b.accountLast4 ? <span className="text-faint"> ···{b.accountLast4}</span> : null}
                </span>
                <span className="text-faint tabular">{b._count.transactions} lines</span>
              </li>
            ))}
          </ul>
          <details className="mt-3 border-t border-line pt-3">
            <summary className="flex cursor-pointer items-center gap-1 text-sm font-medium text-brand-text">
              <Plus className="h-3.5 w-3.5" /> Add account
            </summary>
            <form action={addBankAccount.bind(null, clientId)} className="mt-3 space-y-3">
              <Field label="Name">
                <Input name="name" required placeholder="Savings account" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Bank">
                  <Input name="bankName" placeholder="FNB" />
                </Field>
                <Field label="Last 4 digits">
                  <Input name="accountLast4" inputMode="numeric" maxLength={4} />
                </Field>
              </div>
              <Button type="submit" variant="secondary" className="w-full">
                Add
              </Button>
            </form>
          </details>
        </Card>
      </div>

      <Card
        title="Bank lines"
        icon={Sparkle}
        padded={false}
        actions={
          count("UNMATCHED") ? (
            <form action={runAutoCoding.bind(null, clientId)}>
              <Button variant="secondary" size="sm">
                <MagicWand className="h-3.5 w-3.5" /> Run auto-coding
              </Button>
            </form>
          ) : undefined
        }
      >
        <div className="flex gap-1 overflow-x-auto border-b border-line px-4 pt-2 scroll-thin">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/books/${clientId}/bank?show=${f.key}`}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${filter === f.key ? "border-brand font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {f.label}
              {f.key !== "ALL" && count(f.key) ? <span className="ml-1.5 rounded-full bg-subtle px-1.5 text-xs text-muted">{count(f.key)}</span> : null}
            </Link>
          ))}
        </div>
        {txns.length === 0 ? (
          <Empty icon={Bank}>{filter === "UNMATCHED" ? "Nothing to code. Import a statement to bring in new lines." : "No lines here."}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {txns.map((t) => {
              const out = t.amountCents < 0n;
              const abs = out ? -t.amountCents : t.amountCents;
              const suggestion = t.status === "UNMATCHED" ? suggestAccountCode(t.description, chartForSuggest) : null;
              const candidates = t.status === "UNMATCHED" ? open.filter((i) => i.direction === (out ? "PAYABLE" : "RECEIVABLE")).sort((a, b) => Number((a.outstanding === abs ? 0n : 1n) - (b.outstanding === abs ? 0n : 1n))).slice(0, 25) : [];
              return (
                <li key={t.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{t.description}</p>
                      <p className="text-xs text-faint">
                        {formatCalendarDate(t.date)}
                        {bankAccounts.length > 1 ? ` · ${t.bankAccount.name}` : ""}
                        {t.status === "CODED" ? ` · ${accountName.get(t.accountCode ?? "") ?? t.accountCode}${t.rule ? ` (rule “${t.rule.matchText}”)` : ""}` : ""}
                        {t.status === "MATCHED" && t.invoice ? (
                          <>
                            {" · settles "}
                            <Link href={`/invoices/${t.invoice.id}`} className="text-brand-text hover:underline">
                              {t.invoice.invoiceNumber}
                            </Link>
                            {t.matchReason ? ` (${t.matchReason})` : ""}
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-display text-sm font-semibold tabular ${out ? "text-ink" : "text-positive"}`}>
                        {out ? "−" : "+"}
                        {formatCents(abs)}
                      </span>
                      {t.status !== "UNMATCHED" ? (
                        <>
                          <Badge tone={t.status === "MATCHED" ? "positive" : t.status === "CODED" ? "brand" : "neutral"}>{t.status === "IGNORED" ? "Ignored" : t.status === "CODED" ? "Coded" : "Matched"}</Badge>
                          <form action={undoBankLine.bind(null, clientId, t.id)}>
                            <button className="text-xs text-faint hover:text-danger">Undo</button>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {t.status === "UNMATCHED" ? (
                    <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
                      <form action={codeBankLine.bind(null, clientId, t.id)} className="flex flex-wrap items-center gap-2">
                        <Select name="accountCode" required defaultValue={suggestion ?? ""} className="w-64 max-w-full">
                          <option value="" disabled>
                            Code to account…
                          </option>
                          {grouped.map((g) => (
                            <optgroup key={g.type} label={ACCOUNT_TYPE_INFO[g.type].label}>
                              {g.items.map((a) => (
                                <option key={a.id} value={a.code}>
                                  {a.code} · {a.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </Select>
                        {client.vatRegistered ? (
                          <label className="flex items-center gap-1.5 text-xs text-muted">
                            <input type="checkbox" name="vatInclusive" defaultChecked={out} className="accent-[var(--brand)]" /> Incl. 15% VAT
                          </label>
                        ) : null}
                        <Select name="remember" defaultValue="no" className="w-auto text-xs">
                          <option value="no">Just this line</option>
                          <option value="client">Always, for this client</option>
                          <option value="practice">Always, for all clients</option>
                        </Select>
                        <Input name="ruleText" defaultValue={ruleTextFor(t.description)} className="w-36 text-xs" aria-label="Rule text" title="Lines containing this text get the same account" />
                        <Button size="sm">Code</Button>
                        {suggestion ? <span className="text-[11px] text-brand-text">suggested</span> : null}
                      </form>
                      <div className="flex flex-wrap items-center gap-2">
                        {candidates.length ? (
                          <form action={matchBankLine.bind(null, clientId, t.id)} className="flex items-center gap-2">
                            <Select name="invoiceId" required defaultValue="" className="w-56 text-xs">
                              <option value="" disabled>
                                Match to invoice…
                              </option>
                              {candidates.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.invoiceNumber} · {i.supplier?.name ?? ""} · {formatCents(i.outstanding)}
                                  {i.outstanding === abs ? " ✓" : ""}
                                </option>
                              ))}
                            </Select>
                            <Button size="sm" variant="secondary">
                              Match
                            </Button>
                          </form>
                        ) : null}
                        <form action={ignoreBankLine.bind(null, clientId, t.id)}>
                          <Button size="sm" variant="ghost">
                            Ignore
                          </Button>
                        </form>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {rules.length ? (
        <Card title="Coding rules" description="Applied automatically to new bank lines. Client rules win over practice-wide rules." icon={MagicWand}>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <span className="min-w-0 truncate">
                  “{r.matchText}” → {accountName.get(r.accountCode) ?? r.accountCode}
                  {r.vatInclusive ? " (VAT)" : ""}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.clientId ? <Badge>Client</Badge> : <Badge tone="brand">All clients</Badge>}
                  <span className="text-xs text-faint tabular">{r.timesApplied}×</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
