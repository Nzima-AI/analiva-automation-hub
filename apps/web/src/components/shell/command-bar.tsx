"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { cx } from "@/components/ui";
import { quickSearch, type CommandResult } from "./command-actions";

interface Item {
  group: string;
  label: string;
  detail?: string;
  href: string;
}

const PAGES: Item[] = [
  { group: "Go to", label: "Dashboard", href: "/" },
  { group: "Go to", label: "Review queue", href: "/review" },
  { group: "Go to", label: "Inbox", href: "/inbox" },
  { group: "Go to", label: "Deadlines", href: "/compliance" },
  { group: "Go to", label: "Clients", href: "/clients" },
  { group: "Go to", label: "Books", href: "/books" },
  { group: "Go to", label: "Invoices", href: "/invoices" },
  { group: "Go to", label: "Documents", href: "/documents" },
  { group: "Create", label: "New client", href: "/clients/new" },
  { group: "Create", label: "Capture an invoice", href: "/invoices/new" },
  { group: "Go to", label: "Settings", href: "/settings" },
];

export function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CommandResult[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => start(async () => setResults(await quickSearch(text))), 180);
    return () => clearTimeout(t);
  }, [q]);

  const pages = PAGES.filter((p) => !q.trim() || p.label.toLowerCase().includes(q.trim().toLowerCase()));
  const items: Item[] = [
    ...results,
    ...pages,
    ...(q.trim().length >= 2 ? [{ group: "Search", label: `Search everything for “${q.trim()}”`, href: `/lookup?q=${encodeURIComponent(q.trim())}` }] : []),
  ];

  const go = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  let lastGroup = "";
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="no-print flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm text-faint shadow-xs transition-colors hover:border-line-strong hover:text-muted"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search clients, invoices, amounts…</span>
        <kbd className="hidden rounded border border-line bg-subtle px-1.5 font-sans text-[11px] text-muted sm:inline">Ctrl K</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command bar">
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-label="Close" />
          <div className="fade-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-panel shadow-lg">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 text-faint" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, items.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    go(items[active]);
                  }
                }}
                placeholder="Name, invoice number, R amount, date, phone…"
                className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
              />
              {pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" /> : null}
            </div>
            <ul className="max-h-[50vh] overflow-y-auto py-2 scroll-thin" role="listbox">
              {items.length === 0 ? <li className="px-4 py-6 text-center text-sm text-muted">No matches.</li> : null}
              {items.map((item, i) => {
                const header = item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                return (
                  <li key={`${item.group}-${item.href}-${i}`}>
                    {header ? <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-faint">{header}</p> : null}
                    <button
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(item)}
                      className={cx("flex w-full items-center gap-3 px-4 py-2 text-left", i === active ? "bg-brand-soft" : "")}
                      role="option"
                      aria-selected={i === active}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{item.label}</span>
                        {item.detail ? <span className="block truncate text-xs text-muted">{item.detail}</span> : null}
                      </span>
                      {i === active ? <CornerDownLeft className="h-3.5 w-3.5 text-brand-text" /> : <ArrowRight className="h-3.5 w-3.5 text-faint opacity-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
