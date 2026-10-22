const rand = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 });

/** R1.2m / R45k / R950: short rand amounts for charts and lists (server and client). */
export function compactRand(v: number): string {
  const a = Math.abs(v);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(1)}m` : a >= 10_000 ? `${Math.round(a / 1000)}k` : rand.format(a);
  return `${v < 0 ? "-" : ""}R${s}`;
}
