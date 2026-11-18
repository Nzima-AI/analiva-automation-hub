"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, FunnelSimple, MagnifyingGlass, X } from "@phosphor-icons/react";
import { parseLookupQuery } from "@aah/core";
import { cx } from "@/components/ui";

/**
 * CRM table: everything loaded up front, narrowed instantly as you type or filter.
 * The search box understands names, numbers, R amounts, dates, phones and VAT/CIPC
 * numbers (same parser as the lookup). When the table holds only the newest rows of
 * a larger set, a server search fills in older matches.
 */

export type Cell = string | number | null;

export interface Column {
  key: string;
  label: string;
  /** "money" values are cents; "date" values are ISO strings */
  kind?: "text" | "money" | "date" | "badge" | "number";
  align?: "left" | "right";
  /** Text shown under the main value (key of another field) */
  sub?: string;
  /** Tone per badge value */
  tones?: Record<string, "neutral" | "brand" | "positive" | "warn" | "danger">;
  hideBelow?: "sm" | "md" | "lg" | "xl";
  sortable?: boolean;
}

export interface Facet {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

export interface Row {
  id: string;
  href: string;
  /** Free text searched by the box (names, numbers, emails, ...) */
  search: string;
  /** Cents fields matched by an amount query */
  amounts?: number[];
  /** ISO date matched by a date query */
  date?: string | null;
  values: Record<string, Cell>;
}

const toneCls = {
  neutral: "bg-subtle text-ink-2 border-line",
  brand: "bg-brand-soft text-brand-text border-brand/20",
  positive: "bg-positive-soft text-positive border-positive/20",
  warn: "bg-warn-soft text-warn border-warn/25",
  danger: "bg-danger-soft text-danger border-danger/20",
};
const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" };

const money = (cents: number) => {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}R ${whole},${String(abs % 100).padStart(2, "0")}`;
};
const date = (iso: string) => new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length || !text) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-brand/20 px-0.5 text-inherit">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function DataTable({
  rows,
  columns,
  facets = [],
  initialQuery = "",
  totalAvailable,
  remoteSearch,
  emptyText,
  placeholder,
  defaultSort,
}: {
  rows: Row[];
  columns: Column[];
  facets?: Facet[];
  initialQuery?: string;
  /** How many records exist in total (rows may be only the newest) */
  totalAvailable: number;
  /** Server search for records not loaded in `rows` */
  remoteSearch?: (q: string) => Promise<Row[]>;
  emptyText: string;
  placeholder: string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const deferred = useDeferredValue(q);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(defaultSort ?? null);
  const [limit, setLimit] = useState(100);
  const [extra, setExtra] = useState<Row[]>([]);
  const [searching, startSearch] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  // "/" focuses search, like most CRMs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the query in the URL (shareable, survives refresh) without a navigation.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (deferred) url.searchParams.set("q", deferred);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
    setLimit(100);
  }, [deferred]);

  // Older records: ask the server when the table only holds part of the set.
  useEffect(() => {
    if (!remoteSearch || rows.length >= totalAvailable || deferred.trim().length < 2) {
      setExtra([]);
      return;
    }
    const t = setTimeout(() => startSearch(async () => setExtra(await remoteSearch(deferred.trim()))), 250);
    return () => clearTimeout(t);
  }, [deferred, remoteSearch, rows.length, totalAvailable]);

  const parsed = useMemo(() => parseLookupQuery(deferred), [deferred]);
  const terms = useMemo(() => deferred.trim().toLowerCase().split(/\s+/).filter((t) => t.length >= 2), [deferred]);

  const visible = useMemo(() => {
    const all = [...rows, ...extra.filter((e) => !rows.some((r) => r.id === e.id))];
    const amount = parsed.amountCents !== null ? Number(parsed.amountCents) : null;
    const range = parsed.dateRange;
    const digits = deferred.replace(/\D/g, "");
    const out = all.filter((r) => {
      for (const [k, v] of Object.entries(filters)) if (v && String(r.values[k] ?? "") !== v) return false;
      if (!deferred.trim()) return true;
      const hay = r.search.toLowerCase();
      if (terms.length && terms.every((t) => hay.includes(t))) return true;
      if (amount !== null && amount > 0 && r.amounts?.includes(amount)) return true;
      if (range && r.date) {
        const d = new Date(r.date).getTime();
        if (d >= range.from.getTime() && d < range.to.getTime()) return true;
      }
      if (digits.length >= 6 && hay.replace(/\D/g, "").includes(digits)) return true;
      return false;
    });
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      out.sort((a, b) => {
        const av = a.values[sort.key];
        const bv = b.values[sort.key];
        const cmp =
          col?.kind === "money" || col?.kind === "number" ? Number(av ?? 0) - Number(bv ?? 0) : String(av ?? "").localeCompare(String(bv ?? ""), "en-ZA", { numeric: true });
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, extra, filters, deferred, terms, parsed, sort, columns]);

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const narrowed = deferred.trim() || activeFilters;

  return (
    <div>
      <div className="sticky top-[57px] z-10 -mx-1 mb-3 flex flex-wrap items-center gap-2 bg-canvas/85 px-1 py-2 backdrop-blur">
        <label className="group relative min-w-64 flex-1">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint transition-colors group-focus-within:text-brand-text" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="h-11 w-full rounded-xl border border-line bg-panel pl-10 pr-20 text-[15px] text-ink shadow-xs outline-none transition-all placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
            aria-label="Search records"
            autoComplete="off"
          />
          <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {searching ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-brand" /> : null}
            {q ? (
              <button onClick={() => setQ("")} className="rounded p-0.5 text-faint hover:text-ink" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            ) : (
              <kbd className="rounded border border-line bg-subtle px-1.5 font-mono text-[11px] text-muted">/</kbd>
            )}
          </span>
        </label>
        {facets.map((f) => (
          <label key={f.key} className="relative">
            <span className="sr-only">{f.label}</span>
            <select
              value={filters[f.key] ?? ""}
              onChange={(e) => setFilters((x) => ({ ...x, [f.key]: e.target.value }))}
              className={cx(
                "h-11 appearance-none rounded-xl border bg-panel pl-3 pr-8 text-sm shadow-xs outline-none transition-all focus:ring-4 focus:ring-brand/15",
                filters[f.key] ? "border-brand text-brand-text" : "border-line text-ink-2 hover:border-line-strong",
              )}
            >
              <option value="">{f.label}: all</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <FunnelSimple className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          </label>
        ))}
        {activeFilters ? (
          <button onClick={() => setFilters({})} className="h-11 rounded-xl px-3 text-sm text-muted hover:text-ink">
            Clear filters
          </button>
        ) : null}
      </div>

      <p className="mb-2 px-1 text-xs text-muted" aria-live="polite">
        {narrowed ? (
          <>
            <span className="font-medium text-ink tabular">{visible.length}</span> of {totalAvailable.toLocaleString("en-ZA")} match
            {parsed.amountCents !== null && Number(parsed.amountCents) > 0 ? <> · reading “{deferred.trim()}” as {money(Number(parsed.amountCents))} too</> : null}
            {parsed.dateRange ? <> · and as a date</> : null}
          </>
        ) : (
          <>
            <span className="font-medium text-ink tabular">{totalAvailable.toLocaleString("en-ZA")}</span> records
            {rows.length < totalAvailable ? <> · newest {rows.length.toLocaleString("en-ZA")} shown, search reaches every year</> : null}
          </>
        )}
      </p>

      <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-xs">
        <div className="max-h-[calc(100dvh-260px)] overflow-auto scroll-thin">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-panel-2/95 backdrop-blur">
              <tr className="border-b border-line">
                {columns.map((c) => {
                  const active = sort?.key === c.key;
                  return (
                    <th key={c.key} className={cx("whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-faint", c.align === "right" && "text-right", c.hideBelow && hide[c.hideBelow])}>
                      {c.sortable === false ? (
                        c.label
                      ) : (
                        <button
                          onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: c.kind === "money" || c.kind === "date" ? "desc" : "asc" }))}
                          className={cx("inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-ink", active && "text-ink")}
                        >
                          {c.label}
                          {active ? sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, limit).map((r) => (
                <tr
                  key={r.id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button")) return;
                    router.push(r.href);
                  }}
                  className="group cursor-pointer border-b border-line/70 transition-colors last:border-b-0 hover:bg-brand-soft/40"
                >
                  {columns.map((c, i) => {
                    const v = r.values[c.key];
                    const sub = c.sub ? r.values[c.sub] : null;
                    let content: React.ReactNode;
                    if (v === null || v === undefined || v === "") content = <span className="text-faint">-</span>;
                    else if (c.kind === "money") content = <span className="font-mono text-[13px] tabular">{money(Number(v))}</span>;
                    else if (c.kind === "date") content = <span className="font-mono text-[13px] text-muted tabular">{date(String(v))}</span>;
                    else if (c.kind === "number") content = <span className="font-mono text-[13px] tabular">{v}</span>;
                    else if (c.kind === "badge")
                      content = <span className={cx("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", toneCls[c.tones?.[String(v)] ?? "neutral"])}>{String(v).replace(/_/g, " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase())}</span>;
                    else content = <Highlight text={String(v)} terms={terms} />;
                    return (
                      <td key={c.key} className={cx("px-4 py-3 align-top", c.align === "right" && "text-right", c.hideBelow && hide[c.hideBelow], i === 0 && "relative")}>
                        {i === 0 ? (
                          <>
                            <span className="absolute inset-y-2 left-0 w-[3px] origin-center scale-y-0 rounded-r-full bg-brand transition-transform duration-300 group-hover:scale-y-100" aria-hidden />
                            <Link href={r.href} className="font-medium text-ink transition-colors group-hover:text-brand-text">
                              {content}
                            </Link>
                          </>
                        ) : (
                          content
                        )}
                        {sub ? (
                          <div className="mt-0.5 truncate text-xs text-faint">
                            <Highlight text={String(sub)} terms={terms} />
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 ? <p className="px-4 py-14 text-center text-sm text-muted">{narrowed ? "Nothing matches. Try fewer words, an amount like 4500 or a date like Mar 2024." : emptyText}</p> : null}
        </div>
        {visible.length > limit ? (
          <button onClick={() => setLimit((l) => l + 200)} className="w-full border-t border-line py-3 text-sm font-medium text-brand-text transition-colors hover:bg-subtle">
            Show {Math.min(200, visible.length - limit)} more of {visible.length - limit}
          </button>
        ) : null}
      </div>
    </div>
  );
}
