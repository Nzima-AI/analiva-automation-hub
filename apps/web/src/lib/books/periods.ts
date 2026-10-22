import { parseDateRange } from "@aah/core";
import { financialYearStart } from "./ledger";

export interface Period {
  key: string;
  label: string;
  from: Date;
  /** exclusive */
  to: Date;
}

const DAY = 86_400_000;
const utc = (y: number, m0: number, d = 1) => new Date(Date.UTC(y, m0, d));
const fmt = (d: Date) => new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);

export function presetPeriods(yearEndMonth: number, today = new Date(new Date().toISOString().slice(0, 10))): Period[] {
  const fyStart = financialYearStart(today, yearEndMonth);
  const lastFyStart = utc(fyStart.getUTCFullYear() - 1, fyStart.getUTCMonth());
  const monthStart = utc(today.getUTCFullYear(), today.getUTCMonth());
  const lastMonthStart = utc(today.getUTCFullYear(), today.getUTCMonth() - 1);
  const tomorrow = new Date(today.getTime() + DAY);
  return [
    { key: "fy", label: "This financial year", from: fyStart, to: tomorrow },
    { key: "lastfy", label: "Last financial year", from: lastFyStart, to: fyStart },
    { key: "month", label: "This month", from: monthStart, to: tomorrow },
    { key: "lastmonth", label: "Last month", from: lastMonthStart, to: monthStart },
    { key: "12m", label: "Last 12 months", from: utc(today.getUTCFullYear() - 1, today.getUTCMonth() + 1), to: tomorrow },
  ];
}

/** Resolve ?p=fy|... or ?from=&to= (inclusive end date) into a period. */
export function resolvePeriod(params: { p?: string; from?: string; to?: string }, yearEndMonth: number): Period {
  const presets = presetPeriods(yearEndMonth);
  if (params.from || params.to) {
    const f = params.from ? parseDateRange(params.from) : null;
    const t = params.to ? parseDateRange(params.to) : null;
    const from = f?.from ?? presets[0]!.from;
    const to = t?.to ?? presets[0]!.to;
    return { key: "custom", label: `${fmt(from)} to ${fmt(new Date(to.getTime() - DAY))}`, from, to };
  }
  return presets.find((p) => p.key === params.p) ?? presets[0]!;
}

export function describePeriod(p: Period): string {
  return `${fmt(p.from)} to ${fmt(new Date(p.to.getTime() - DAY))}`;
}
