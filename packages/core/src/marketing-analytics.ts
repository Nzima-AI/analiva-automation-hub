/**
 * Campaign analytics and scheduling maths. Pure functions, no I/O. All "hours" and
 * "days" are South African time (UTC+2, no daylight saving).
 */

const SA_OFFSET_MS = 2 * 3600_000;
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Day of week (0 = Sunday) and hour (0-23) in South Africa. */
export function saParts(d: Date): { dow: number; hour: number; day: string } {
  const t = new Date(d.getTime() + SA_OFFSET_MS);
  return { dow: t.getUTCDay(), hour: t.getUTCHours(), day: t.toISOString().slice(0, 10) };
}

/** A moment given as a South African date and hour. */
export function saMoment(day: string, hour: number, minute = 0): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) + (hour * 60 + minute) * 60_000 - SA_OFFSET_MS);
}

function easterSunday(year: number): string {
  // Anonymous Gregorian algorithm.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** South African public holidays (Public Holidays Act: a Sunday holiday moves to Monday). */
export function saPublicHolidays(year: number): Set<string> {
  const fixed = ["01-01", "03-21", "04-27", "05-01", "06-16", "08-09", "09-24", "12-16", "12-25", "12-26"].map((md) => `${year}-${md}`);
  const easter = easterSunday(year);
  const days = new Set([...fixed, addDays(easter, -2), addDays(easter, 1)]);
  for (const day of fixed) if (new Date(`${day}T00:00:00Z`).getUTCDay() === 0) days.add(addDays(day, 1));
  return days;
}

export interface SendWindow {
  quietStart: number;
  quietEnd: number;
  skipSundays: boolean;
  skipHolidays: boolean;
}

function dayAllowed(day: string, w: SendWindow): boolean {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  if (w.skipSundays && dow === 0) return false;
  if (w.skipHolidays && saPublicHolidays(Number(day.slice(0, 4))).has(day)) return false;
  return true;
}

const hourAllowed = (hour: number, w: SendWindow) => (w.quietStart > w.quietEnd ? hour >= w.quietEnd && hour < w.quietStart : hour >= w.quietEnd || hour < w.quietStart);

/**
 * The earliest moment at or after `from` that is outside quiet hours, Sundays and
 * public holidays. With `preferredHour`, the next time that hour comes round on an
 * allowed day (if that hour is itself allowed).
 */
export function nextSendTime(from: Date, w: SendWindow, preferredHour?: number | null): Date {
  const start = saParts(from);
  const usePreferred = preferredHour != null && hourAllowed(preferredHour, w);
  for (let i = 0; i < 14; i++) {
    const day = addDays(start.day, i);
    if (!dayAllowed(day, w)) continue;
    if (usePreferred) {
      const at = saMoment(day, preferredHour!);
      if (at >= from) return at;
      continue;
    }
    for (let h = i === 0 ? start.hour : 0; h < 24; h++) {
      if (!hourAllowed(h, w)) continue;
      const at = i === 0 && h === start.hour ? from : saMoment(day, h);
      if (at >= from) return at;
    }
  }
  return from;
}

export interface SendFacts {
  sentAt: Date | null;
  deliveredAt?: Date | null;
  readAt: Date | null;
  clickedAt: Date | null;
  repliedAt: Date | null;
  signedUpAt: Date | null;
}

export interface HeatCell {
  dow: number;
  hour: number;
  sent: number;
  read: number;
  clicked: number;
  replied: number;
  signedUp: number;
  /** Weighted results per message: reads 1, clicks 3, replies 3, sign-ups 10. */
  score: number;
}

/** Results by the day and hour the message was sent: which send times work. */
export function sendTimeHeatmap(sends: SendFacts[]): HeatCell[] {
  const cells: HeatCell[] = [];
  for (let dow = 0; dow < 7; dow++) for (let hour = 0; hour < 24; hour++) cells.push({ dow, hour, sent: 0, read: 0, clicked: 0, replied: 0, signedUp: 0, score: 0 });
  for (const s of sends) {
    if (!s.sentAt) continue;
    const { dow, hour } = saParts(s.sentAt);
    const c = cells[dow * 24 + hour]!;
    c.sent++;
    if (s.readAt) c.read++;
    if (s.clickedAt) c.clicked++;
    if (s.repliedAt) c.replied++;
    if (s.signedUpAt) c.signedUp++;
  }
  for (const c of cells) c.score = c.sent ? (c.read + 3 * c.clicked + 3 * c.replied + 10 * c.signedUp) / c.sent : 0;
  return cells;
}

/** The best send slots, ignoring slots with too few messages to judge. */
export function bestSlots(cells: HeatCell[], minSent = 10, top = 3): HeatCell[] {
  return cells.filter((c) => c.sent >= minSent).sort((a, b) => b.score - a.score).slice(0, top);
}

/** When people actually read: 24 counts by South African hour. */
export function readHours(times: Array<Date | null>): number[] {
  const hours = Array.from({ length: 24 }, () => 0);
  for (const t of times) if (t) hours[saParts(t).hour]!++;
  return hours;
}

/** The hour a person most often reads or clicks; null with fewer than two events. */
export function bestHourFor(times: Array<Date | null>): number | null {
  const real = times.filter((t): t is Date => Boolean(t));
  if (real.length < 2) return null;
  const counts = readHours(real);
  const max = Math.max(...counts);
  return counts.indexOf(max);
}

export const READ_BUCKETS = [5, 15, 30, 60, 180, 720, 1440] as const;

/** Share of eventual readers who had read within 5 min, 15 min, ... 24 h of sending. */
export function timeToRead(sends: SendFacts[]): Array<{ minutes: number; pct: number }> {
  const delays = sends.flatMap((s) => (s.sentAt && s.readAt ? [(s.readAt.getTime() - s.sentAt.getTime()) / 60_000] : []));
  return READ_BUCKETS.map((minutes) => ({ minutes, pct: delays.length ? Math.round((delays.filter((d) => d <= minutes).length / delays.length) * 100) : 0 }));
}

export type EngagementBand = "Customer" | "Hot" | "Warm" | "Cold" | "Dormant" | "New";

/** 0-100 from reads, clicks and replies, halving in value every 30 days. */
export function engagementScore(sends: SendFacts[], signedUpAt: Date | null, now = new Date()): { score: number; band: EngagementBand } {
  if (signedUpAt) return { score: 100, band: "Customer" };
  if (!sends.some((s) => s.sentAt)) return { score: 0, band: "New" };
  const decay = (t: Date) => Math.pow(0.5, (now.getTime() - t.getTime()) / (30 * 86_400_000));
  let raw = 0;
  for (const s of sends) {
    if (s.readAt) raw += 8 * decay(s.readAt);
    if (s.clickedAt) raw += 30 * decay(s.clickedAt);
    if (s.repliedAt) raw += 35 * decay(s.repliedAt);
  }
  const score = Math.min(99, Math.round(raw));
  return { score, band: score >= 35 ? "Hot" : score >= 20 ? "Warm" : score >= 5 ? "Cold" : "Dormant" };
}

/**
 * Expected final clicks and sign-ups from the results so far. Responses arrive roughly
 * as 1 - e^(-t/tau): most within hours, the rest over the next day.
 */
export function forecast(now: { clicked: number; signedUp: number; elapsedHours: number }, tauHours = 5) {
  const done = Math.max(0.15, 1 - Math.exp(-Math.max(0, now.elapsedHours) / tauHours));
  return { clicked: Math.round(now.clicked / done), signedUp: Math.round(now.signedUp / done), confidence: done >= 0.9 ? "high" : done >= 0.5 ? "medium" : "early" };
}

/** A/B: the variant with the better click rate (read rate breaks a tie). */
export function abWinner(a: { sent: number; read: number; clicked: number }, b: { sent: number; read: number; clicked: number }): "A" | "B" {
  const rate = (n: number, d: number) => (d ? n / d : 0);
  const byClick = rate(b.clicked, b.sent) - rate(a.clicked, a.sent);
  if (Math.abs(byClick) > 0.005) return byClick > 0 ? "B" : "A";
  return rate(b.read, b.sent) > rate(a.read, a.sent) ? "B" : "A";
}

export type ReplyTag = "STOP" | "CALLBACK" | "PRICE" | "INTERESTED" | "COMPLAINT" | "OTHER";

/** Sorts a reply without paid AI: keyword rules, most decisive first. */
export function tagReply(text: string): ReplyTag {
  const t = text.toLowerCase();
  if (/^\s*(stop|unsubscribe|opt[\s-]?out|remove me)\b/.test(t)) return "STOP";
  if (/\b(call me|phone me|ring me|call back|callback|give me a call)\b/.test(t)) return "CALLBACK";
  if (/\b(price|cost|how much|fee|fees|charge|r\s?\d+|pricing|expensive)\b/.test(t)) return "PRICE";
  if (/\b(unhappy|complain|complaint|spam|annoy|why are you|not happy|rubbish|stop sending)\b/.test(t)) return "COMPLAINT";
  if (/\b(yes|interested|sign me up|sounds good|tell me more|keen|please send|great|count me in|let'?s do it)\b/.test(t)) return "INTERESTED";
  return "OTHER";
}

/** Rand cents to "R 1,234.50". */
export function randFromCents(cents: number): string {
  return `R ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---- Demo simulator -----------------------------------------------------------

/** Small deterministic random numbers from a string, so a demo replays the same way. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export const DEMO_REPLIES = [
  "Yes please, sounds great!",
  "How much does it cost?",
  "Please call me tomorrow morning",
  "Interested. Can you send more info?",
  "Thanks, will have a look",
  "STOP",
] as const;

export interface SimulatedOutcome {
  deliveredAfterMin: number;
  readAfterMin: number | null;
  clicked: boolean;
  reply: string | null;
  signedUp: boolean;
}

/**
 * What happens to one demo message. Mornings and early evenings read best,
 * mid-afternoon and late night worst, so the demo heatmap shows a real pattern.
 */
export function simulateOutcome(seed: string, sentHour: number, button?: boolean): SimulatedOutcome {
  const r = seeded(seed);
  const hourBoost = sentHour >= 7 && sentHour <= 9 ? 0.25 : sentHour >= 17 && sentHour <= 19 ? 0.15 : sentHour >= 13 && sentHour <= 15 ? -0.15 : sentHour >= 21 || sentHour < 6 ? -0.3 : 0;
  const delivered = r() < 0.96;
  const read = delivered && r() < 0.62 + hourBoost;
  const clicked = read && r() < 0.36 + hourBoost / 2;
  const replyRoll = r();
  const reply = read && replyRoll < 0.14 ? DEMO_REPLIES[Math.floor(r() * DEMO_REPLIES.length)]! : null;
  const signedUp = clicked && r() < 0.34 + (button ? 0.08 : 0);
  return {
    deliveredAfterMin: delivered ? 0.2 + r() * 1.5 : Number.POSITIVE_INFINITY,
    readAfterMin: read ? Math.round(1 + Math.pow(r(), 2.4) * 600) : null,
    clicked,
    reply,
    signedUp,
  };
}

/** "Vat return!" -> "VAT RETURN": how keywords and incoming messages are compared. */
export function normaliseKeyword(text: string): string {
  return text.normalize("NFKC").replace(/^#/, "").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * The keyword rule an incoming WhatsApp message triggers: the whole message must be the keyword
 * (any case, punctuation and a leading # ignored), so ordinary sentences don't set off replies.
 * STOP and START are never keywords: they are opt-out and opt-in.
 */
export function matchKeyword<T extends { keyword: string; active: boolean }>(text: string, rules: T[]): T | null {
  const said = normaliseKeyword(text);
  if (!said || said === "STOP" || said === "START") return null;
  return rules.find((r) => r.active && normaliseKeyword(r.keyword) === said) ?? null;
}
