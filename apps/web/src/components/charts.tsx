"use client";

import { compactRand } from "@/lib/compact-rand";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];


const tooltipStyle = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  boxShadow: "var(--shadow-md)",
  fontSize: 12,
  color: "var(--ink)",
};
const axisProps = { stroke: "var(--faint)", fontSize: 11, tickLine: false, axisLine: false } as const;

export interface SeriesDef {
  key: string;
  label: string;
  /** "bar" (default) or "line" for combo charts */
  kind?: "bar" | "line";
}

/** Stacked or grouped bars, optionally with a line (e.g. profit over income/expenses). */
export function BarTrend({
  data,
  xKey,
  series,
  stacked,
  money = true,
  height = 260,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: SeriesDef[];
  stacked?: boolean;
  money?: boolean;
  height?: number;
}) {
  const fmt = (v: number) => (money ? compactRand(v) : String(v));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} tickFormatter={fmt} width={56} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(Number(v))} cursor={{ fill: "var(--subtle)" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
          {series.map((s, i) =>
            s.kind === "line" ? (
              <Line key={s.key} dataKey={s.key} name={s.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2.5} dot={false} type="monotone" />
            ) : (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]} radius={stacked ? 0 : [4, 4, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={36} />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaTrend({ data, xKey, yKey, label, money = true, height = 220 }: { data: Array<Record<string, string | number>>; xKey: string; yKey: string; label: string; money?: boolean; height?: number }) {
  const fmt = (v: number) => (money ? compactRand(v) : String(v));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`g-${yKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} tickFormatter={fmt} width={56} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt(Number(v)), label]} />
          <Area dataKey={yKey} name={label} stroke="var(--chart-1)" strokeWidth={2.5} fill={`url(#g-${yKey})`} type="monotone" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ data, height = 220, money = true }: { data: Array<{ name: string; value: number }>; height?: number; money?: boolean }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const fmt = (v: number) => (money ? compactRand(v) : String(v));
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(Number(v))} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" paddingAngle={2} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-lg font-semibold tabular text-ink">{fmt(total)}</span>
        <span className="text-xs text-muted">total</span>
      </div>
    </div>
  );
}

export function MiniBars({ data, height = 48 }: { data: number[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey="v" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const CHART_COLORS = COLORS;
