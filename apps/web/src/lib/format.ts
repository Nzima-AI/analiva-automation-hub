import { DISPLAY_TIMEZONE, formatCents } from "@aah/core";

export { formatCents };

const dateFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: DISPLAY_TIMEZONE, day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-ZA", {
  timeZone: DISPLAY_TIMEZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
// @db.Date columns are calendar dates stored at UTC midnight; never shift them.
const calendarFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

export function formatDate(d: Date | null | undefined): string {
  return d ? dateFmt.format(d) : "-";
}

export function formatDateTime(d: Date | null | undefined): string {
  return d ? dateTimeFmt.format(d) : "-";
}

export function formatCalendarDate(d: Date | null | undefined): string {
  return d ? calendarFmt.format(d) : "-";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function humanise(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}
