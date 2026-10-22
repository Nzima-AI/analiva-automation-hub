"use client";

import { useMemo, useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { Button, Field, Input, Select } from "@/components/ui";

interface Line {
  accountCode: string;
  debit: string;
  credit: string;
  description: string;
}

const blank = (): Line => ({ accountCode: "", debit: "", credit: "", description: "" });

function cents(v: string): number {
  const n = Number(v.replace(/[\sR]/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function JournalEditor({ action, accounts }: { action: (fd: FormData) => Promise<void>; accounts: Array<{ code: string; name: string }> }) {
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const totals = useMemo(() => lines.reduce((t, l) => ({ dr: t.dr + cents(l.debit), cr: t.cr + cents(l.credit) }), { dr: 0, cr: 0 }), [lines]);
  const balanced = totals.dr > 0 && totals.dr === totals.cr;
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const fmt = (c: number) => `R ${(c / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Date">
          <Input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Input name="description" required placeholder="e.g. Depreciation for the year" />
        </Field>
        <Field label="Reference">
          <Input name="reference" />
        </Field>
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-faint">
              <th className="pb-2 pr-2">Account</th>
              <th className="pb-2 pr-2">Line note</th>
              <th className="w-32 pb-2 pr-2 text-right">Debit</th>
              <th className="w-32 pb-2 pr-2 text-right">Credit</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <Select value={l.accountCode} onChange={(e) => set(i, { accountCode: e.target.value })} aria-label="Account">
                    <option value="">Choose…</option>
                    {accounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="py-1 pr-2">
                  <Input value={l.description} onChange={(e) => set(i, { description: e.target.value })} aria-label="Line note" />
                </td>
                <td className="py-1 pr-2">
                  <Input value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} inputMode="decimal" className="text-right tabular" aria-label="Debit" />
                </td>
                <td className="py-1 pr-2">
                  <Input value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} inputMode="decimal" className="text-right tabular" aria-label="Credit" />
                </td>
                <td className="py-1">
                  {lines.length > 2 ? (
                    <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="rounded p-1.5 text-faint hover:bg-subtle hover:text-danger" aria-label="Remove line">
                      <Trash className="h-4 w-4" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-medium">
              <td className="pt-2">
                <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="inline-flex items-center gap-1 text-sm text-brand-text hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add line
                </button>
              </td>
              <td className="pt-2 text-right text-xs text-muted">{balanced ? "Balanced" : `Difference ${fmt(Math.abs(totals.dr - totals.cr))}`}</td>
              <td className="pt-2 pr-2 text-right tabular">{fmt(totals.dr)}</td>
              <td className="pt-2 pr-2 text-right tabular">{fmt(totals.cr)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <Button type="submit" disabled={!balanced}>
        Post journal
      </Button>
    </form>
  );
}
