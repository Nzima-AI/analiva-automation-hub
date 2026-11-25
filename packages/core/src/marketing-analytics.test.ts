import { describe, expect, it } from "vitest";
import {
  abWinner,
  bestHourFor,
  bestSlots,
  engagementScore,
  forecast,
  nextSendTime,
  randFromCents,
  readHours,
  saMoment,
  saParts,
  saPublicHolidays,
  sendTimeHeatmap,
  simulateOutcome,
  tagReply,
  timeToRead,
} from "./marketing-analytics";

const window = { quietStart: 19, quietEnd: 7, skipSundays: true, skipHolidays: true };

describe("South African time and holidays", () => {
  it("reads day and hour in SA time", () => {
    expect(saParts(new Date("2026-11-24T23:30:00Z"))).toMatchObject({ dow: 3, hour: 1, day: "2026-11-25" });
    expect(saMoment("2026-11-25", 8).toISOString()).toBe("2026-11-25T06:00:00.000Z");
  });
  it("knows public holidays, Easter and Sunday moves", () => {
    const h2026 = saPublicHolidays(2026);
    expect(h2026.has("2026-04-03")).toBe(true); // Good Friday
    expect(h2026.has("2026-04-06")).toBe(true); // Family Day
    expect(h2026.has("2026-12-16")).toBe(true);
    const h2027 = saPublicHolidays(2027);
    expect(h2027.has("2027-03-22")).toBe(true); // 21 March 2027 is a Sunday
  });
});

describe("nextSendTime", () => {
  it("keeps an allowed moment", () => {
    const at = saMoment("2026-11-25", 10, 15);
    expect(nextSendTime(at, window)).toEqual(at);
  });
  it("moves out of quiet hours, Sundays and holidays", () => {
    expect(nextSendTime(saMoment("2026-11-25", 21), window)).toEqual(saMoment("2026-11-26", 7));
    expect(nextSendTime(saMoment("2026-11-28", 20), window)).toEqual(saMoment("2026-11-30", 7)); // Sat night -> Monday
    expect(nextSendTime(saMoment("2026-12-15", 22), window)).toEqual(saMoment("2026-12-17", 7)); // skips 16 Dec
  });
  it("uses a person's preferred hour", () => {
    expect(nextSendTime(saMoment("2026-11-25", 10), window, 8)).toEqual(saMoment("2026-11-26", 8));
    expect(nextSendTime(saMoment("2026-11-25", 6), window, 8)).toEqual(saMoment("2026-11-25", 8));
    expect(nextSendTime(saMoment("2026-11-25", 10), window, 23)).toEqual(saMoment("2026-11-25", 10)); // quiet hour ignored
  });
});

describe("analytics", () => {
  const at = (day: string, h: number, m = 0) => saMoment(day, h, m);
  const sends = [
    { sentAt: at("2026-11-24", 8), readAt: at("2026-11-24", 8, 4), clickedAt: at("2026-11-24", 8, 6), repliedAt: null, signedUpAt: at("2026-11-24", 9) },
    { sentAt: at("2026-11-24", 8), readAt: at("2026-11-24", 8, 40), clickedAt: null, repliedAt: null, signedUpAt: null },
    { sentAt: at("2026-11-24", 14), readAt: null, clickedAt: null, repliedAt: null, signedUpAt: null },
  ];
  it("builds the send-time heatmap", () => {
    const cells = sendTimeHeatmap(sends);
    const tue8 = cells[2 * 24 + 8]!;
    expect(tue8).toMatchObject({ sent: 2, read: 2, clicked: 1, signedUp: 1 });
    expect(tue8.score).toBe((2 + 3 + 10) / 2);
    expect(bestSlots(cells, 1, 1)[0]).toMatchObject({ dow: 2, hour: 8 });
  });
  it("finds read hours and each person's best hour", () => {
    expect(readHours([at("2026-11-24", 8), at("2026-11-25", 8), null])[8]).toBe(2);
    expect(bestHourFor([at("2026-11-24", 8), at("2026-11-25", 8), at("2026-11-26", 17)])).toBe(8);
    expect(bestHourFor([at("2026-11-24", 8)])).toBeNull();
  });
  it("measures time to read", () => {
    expect(timeToRead(sends).slice(0, 4)).toEqual([{ minutes: 5, pct: 50 }, { minutes: 15, pct: 50 }, { minutes: 30, pct: 50 }, { minutes: 60, pct: 100 }]);
  });
  it("scores engagement with decay", () => {
    const now = at("2026-11-25", 9);
    expect(engagementScore(sends.slice(0, 1), null, now).band).toBe("Hot");
    expect(engagementScore(sends.slice(1, 2), null, now).band).toBe("Cold");
    expect(engagementScore(sends.slice(2), null, now).band).toBe("Dormant");
    expect(engagementScore([], null, now).band).toBe("New");
    expect(engagementScore(sends, at("2026-11-24", 9), now)).toEqual({ score: 100, band: "Customer" });
  });
  it("forecasts, picks A/B winners, tags replies, formats rand", () => {
    expect(forecast({ clicked: 30, signedUp: 6, elapsedHours: 5 })).toMatchObject({ clicked: 47, signedUp: 9, confidence: "medium" });
    expect(abWinner({ sent: 100, read: 60, clicked: 10 }, { sent: 100, read: 50, clicked: 20 })).toBe("B");
    expect(abWinner({ sent: 100, read: 70, clicked: 10 }, { sent: 100, read: 50, clicked: 10 })).toBe("A");
    expect(tagReply("Please call me tomorrow")).toBe("CALLBACK");
    expect(tagReply("How much does it cost?")).toBe("PRICE");
    expect(tagReply("Yes please, sounds great")).toBe("INTERESTED");
    expect(tagReply("STOP")).toBe("STOP");
    expect(tagReply("ok")).toBe("OTHER");
    expect(randFromCents(123450)).toBe("R 1,234.50");
  });
  it("simulates demo outcomes deterministically, with morning sends doing better", () => {
    expect(simulateOutcome("x1", 8)).toEqual(simulateOutcome("x1", 8));
    const rate = (hour: number) => Array.from({ length: 400 }, (_, i) => simulateOutcome(`s${i}`, hour)).filter((o) => o.readAfterMin != null).length;
    expect(rate(8)).toBeGreaterThan(rate(14));
  });
});
