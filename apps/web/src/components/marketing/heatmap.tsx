import { DAY_NAMES, type HeatCell } from "@aah/core";

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00 to 21:00

/** Day x hour grid of results per message sent at that time. Darker = better. */
export function Heatmap({ cells, metric = "score" }: { cells: HeatCell[]; metric?: "score" | "read" }) {
  const value = (c: HeatCell) => (metric === "read" ? (c.sent ? c.read / c.sent : 0) : c.score);
  const max = Math.max(0.0001, ...cells.filter((c) => c.sent >= 3).map(value));
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="overflow-x-auto" data-tour="heatmap">
      <table className="w-full min-w-[640px] border-separate border-spacing-[3px] text-[11px]">
        <thead>
          <tr>
            <th className="w-10" />
            {HOURS.map((h) => <th key={h} className="font-normal text-faint">{String(h).padStart(2, "0")}</th>)}
          </tr>
        </thead>
        <tbody>
          {order.map((dow) => (
            <tr key={dow}>
              <th className="pr-1 text-left font-medium text-muted">{DAY_NAMES[dow]}</th>
              {HOURS.map((hour) => {
                const c = cells[dow * 24 + hour]!;
                const v = c.sent >= 3 ? value(c) / max : 0;
                const title = c.sent ? `${DAY_NAMES[dow]} ${String(hour).padStart(2, "0")}:00 · ${c.sent} sent · ${c.read} read · ${c.clicked} clicked · ${c.signedUp} signed up` : `${DAY_NAMES[dow]} ${String(hour).padStart(2, "0")}:00 · nothing sent yet`;
                return (
                  <td key={hour} title={title} aria-label={title} className="h-7 rounded-[5px] border border-line/60" style={{ background: c.sent >= 3 ? `color-mix(in oklab, var(--color-brand) ${Math.round(8 + v * 88)}%, transparent)` : undefined }} />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
        <span>Fewer results</span>
        <span className="h-2 w-28 rounded-full" style={{ background: "linear-gradient(to right, color-mix(in oklab, var(--color-brand) 10%, transparent), var(--color-brand))" }} />
        <span>More results</span>
        <span className="ml-auto">Hours are South African time. Hover a square for the numbers.</span>
      </div>
    </div>
  );
}
