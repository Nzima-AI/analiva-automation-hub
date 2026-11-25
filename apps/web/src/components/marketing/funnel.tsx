const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** Sent → delivered → read → clicked → signed up, each as a bar against "sent". */
export function Funnel({ stats, big }: { stats: { sent: number; delivered: number; read: number; clicked: number; signedUp: number }; big?: boolean }) {
  const steps = [
    ["Sent", stats.sent],
    ["Delivered", stats.delivered],
    ["Read", stats.read],
    ["Clicked", stats.clicked],
    ["Signed up", stats.signedUp],
  ] as const;
  return (
    <ol className="space-y-2" data-tour="funnel">
      {steps.map(([label, n], i) => (
        <li key={label} className="grid grid-cols-[88px_minmax(0,1fr)_auto_40px] items-center gap-3">
          <span className={big ? "text-base font-medium" : "text-sm text-ink-2"}>{label}</span>
          <span className={`${big ? "h-7" : "h-4"} overflow-hidden rounded-full bg-subtle`}>
            <span className="block h-full rounded-full bg-gradient-to-r from-brand-strong to-brand transition-[width] duration-700" style={{ width: `${Math.max(stats.sent ? 2 : 0, pct(n, stats.sent))}%`, opacity: 1 - i * 0.12 }} />
          </span>
          <span className={`num text-right ${big ? "text-xl font-semibold" : "text-sm"}`}>{n.toLocaleString("en-US")}</span>
          <span className="num text-right text-xs text-muted">{i ? `${pct(n, stats.sent)}%` : ""}</span>
        </li>
      ))}
    </ol>
  );
}

/** Horizontal bars for a short labelled list. */
export function BarRows({ rows, format = (n: number) => n.toLocaleString("en-US") }: { rows: Array<{ label: string; value: number; note?: string }>; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <span className="truncate text-ink-2" title={r.label}>{r.label}</span>
          <span className="h-3 overflow-hidden rounded-full bg-subtle"><span className="block h-full rounded-full bg-brand" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="num text-right text-xs text-muted">{format(r.value)}{r.note ? ` · ${r.note}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}
