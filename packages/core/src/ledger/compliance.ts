/**
 * SARS and CIPC deadlines per client, worked out from the client's tax profile.
 * These are the usual statutory dates; SARS sometimes moves them (e.g. filing
 * season). The calendar says "typical" and links staff to eFiling to confirm.
 */

export type ComplianceType = "VAT201" | "EMP201" | "EMP501" | "IRP6_1" | "IRP6_2" | "ITR14" | "CIPC_AR";

export const COMPLIANCE_INFO: Record<ComplianceType, { label: string; body: "SARS" | "CIPC" }> = {
  VAT201: { label: "VAT201 return", body: "SARS" },
  EMP201: { label: "EMP201 (PAYE, UIF, SDL)", body: "SARS" },
  EMP501: { label: "EMP501 reconciliation", body: "SARS" },
  IRP6_1: { label: "Provisional tax: 1st payment", body: "SARS" },
  IRP6_2: { label: "Provisional tax: 2nd payment", body: "SARS" },
  ITR14: { label: "Company income tax return (ITR14)", body: "SARS" },
  CIPC_AR: { label: "CIPC annual return", body: "CIPC" },
};

export interface TaxProfile {
  vatRegistered: boolean;
  /** A: periods end Feb, Apr, Jun, Aug, Oct, Dec. B: Jan, Mar, May, Jul, Sep, Nov. C: monthly. */
  vatCategory: "A" | "B" | "C" | null;
  payeRegistered: boolean;
  /** 1-12, the month the financial year ends (Feb = 2 is the SA default). */
  financialYearEndMonth: number;
  /** Companies and close corporations file ITR14 and CIPC returns. */
  isCompany: boolean;
  incorporationDate: Date | null;
}

export interface Deadline {
  type: ComplianceType;
  label: string;
  body: "SARS" | "CIPC";
  /** Stable key for marking done, e.g. VAT201:2026-08 */
  periodKey: string;
  periodLabel: string;
  dueDate: Date;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const ym = (y: number, m0: number) => `${y}-${String(m0 + 1).padStart(2, "0")}`;

/** Last weekday of a month (m0 is 0-based). */
export function lastBusinessDay(y: number, m0: number): Date {
  const d = utc(y, m0 + 1, 0);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** The given day, moved back to Friday if it falls on a weekend. */
function businessDayOnOrBefore(y: number, m0: number, day: number): Date {
  const d = utc(y, m0, day);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** Add n business days (weekends skipped; public holidays not modelled). */
function addBusinessDays(date: Date, n: number): Date {
  const d = new Date(date);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--;
  }
  return d;
}

/** Deadlines falling between `from` (inclusive) and `to` (exclusive). */
export function deadlinesBetween(profile: TaxProfile, from: Date, to: Date): Deadline[] {
  const out: Deadline[] = [];
  const push = (type: ComplianceType, periodKey: string, periodLabel: string, dueDate: Date) => {
    if (dueDate >= from && dueDate < to) out.push({ type, ...COMPLIANCE_INFO[type], periodKey: `${type}:${periodKey}`, periodLabel, dueDate });
  };

  // Walk period-end months from a year before `from` to cover returns due soon after.
  const startY = from.getUTCFullYear() - 2;
  const endY = to.getUTCFullYear() + 1;
  for (let y = startY; y <= endY; y++) {
    for (let m0 = 0; m0 < 12; m0++) {
      const nextY = m0 === 11 ? y + 1 : y;
      const nextM = (m0 + 1) % 12;

      if (profile.vatRegistered && profile.vatCategory) {
        const endsPeriod =
          profile.vatCategory === "C" ||
          (profile.vatCategory === "A" && (m0 + 1) % 2 === 0) ||
          (profile.vatCategory === "B" && (m0 + 1) % 2 === 1);
        if (endsPeriod) {
          const label =
            profile.vatCategory === "C" ? `${MONTHS[m0]} ${y}` : `${MONTHS[(m0 + 11) % 12]}–${MONTHS[m0]} ${y}`;
          // eFiling: last business day of the following month.
          push("VAT201", ym(y, m0), label, lastBusinessDay(nextY, nextM));
        }
      }

      if (profile.payeRegistered) {
        push("EMP201", ym(y, m0), `${MONTHS[m0]} ${y}`, businessDayOnOrBefore(nextY, nextM, 7));
      }
    }

    if (profile.payeRegistered) {
      push("EMP501", `${y}-interim`, `Interim (Mar–Aug ${y})`, utc(y, 9, 31));
      push("EMP501", `${y}-annual`, `Annual (Mar ${y - 1}–Feb ${y})`, utc(y, 4, 31));
    }

    // Financial year ending in month fye of year y.
    const fye0 = profile.financialYearEndMonth - 1;
    const firstHalf0 = (fye0 + 6) % 12;
    const firstHalfY = firstHalf0 > fye0 ? y - 1 : y;
    const fyLabel = `FY ending ${MONTHS[fye0]} ${y}`;
    push("IRP6_1", `${y}`, fyLabel, lastBusinessDay(firstHalfY, firstHalf0));
    push("IRP6_2", `${y}`, fyLabel, lastBusinessDay(y, fye0));
    if (profile.isCompany) {
      // ITR14: within 12 months of the financial year end.
      push("ITR14", `${y}`, fyLabel, lastBusinessDay(y + 1, fye0));
    }

    if (profile.isCompany && profile.incorporationDate) {
      const inc = profile.incorporationDate;
      if (y > inc.getUTCFullYear()) {
        const anniversary = utc(y, inc.getUTCMonth(), inc.getUTCDate());
        push("CIPC_AR", `${y}`, `${y} (anniversary ${anniversary.getUTCDate()} ${MONTHS[anniversary.getUTCMonth()]})`, addBusinessDays(anniversary, 30));
      }
    }
  }
  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/** The VAT period (first day, exclusive end) that ends in the month of `periodKeyMonth` ("YYYY-MM"). */
export function vatPeriodRange(category: "A" | "B" | "C", periodEnd: string): { from: Date; to: Date } {
  const [y, m] = periodEnd.split("-").map(Number) as [number, number];
  const to = utc(y, m, 1);
  const from = category === "C" ? utc(y, m - 1, 1) : utc(y, m - 2, 1);
  return { from, to };
}
