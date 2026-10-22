import Link from "next/link";
import type { ReactNode } from "react";

/** Horizontal bar list (top suppliers, spend by account). Server-rendered, no JS. */
export function BarList({ items, format }: { items: Array<{ label: string; value: number; href?: string; detail?: ReactNode }>; format: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => {
        const label = i.href ? (
          <Link href={i.href} className="truncate hover:underline">
            {i.label}
          </Link>
        ) : (
          <span className="truncate">{i.label}</span>
        );
        return (
          <li key={i.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-baseline gap-2 text-ink">
                {label}
                {i.detail ? <span className="shrink-0 text-xs text-faint">{i.detail}</span> : null}
              </span>
              <span className="shrink-0 tabular text-ink-2">{format(i.value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full bg-brand" style={{ width: `${(Math.abs(i.value) / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
