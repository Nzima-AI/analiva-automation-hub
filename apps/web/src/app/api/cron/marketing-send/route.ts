import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { learnBestHours, processQueue, simulateReceipts } from "@/lib/marketing/engine";
import { refreshQuality, resetDemoPractice, runReminders, runSequences, weeklyReports } from "@/lib/marketing/automation";
import { rootDb, tenantDb } from "@aah/db";
import { systemCtx } from "@/lib/marketing/engine";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Called every minute by Supabase pg_cron (ADR 0004/0005): sends due messages, plays out demo receipts, runs sequences; hourly reminders, best hours and the Monday report. */
export async function POST(request: NextRequest) {
  if (!authorised(request)) return new NextResponse("Unauthorized", { status: 401 });
  const started = Date.now();
  after(async () => {
    const deadline = started + 50_000;
    // Each job is independent: one failing must not stop the others.
    const run = async (name: string, job: () => Promise<unknown>) => {
      try {
        const out = await job();
        if (out && (!Array.isArray(out) || out.length)) console.log(`marketing ${name}`, JSON.stringify(out));
      } catch (e) {
        console.error(`marketing ${name} failed`, e instanceof Error ? e.message : e);
      }
    };
    const minute = new Date().getUTCMinutes();
    await run("send", () => processQueue({ deadline }));
    await run("simulate", () => simulateReceipts());
    await run("sequences", () => runSequences(deadline));
    if (minute % 15 === 0) await run("quality", () => refreshQuality());
    // 02:20 South African time (00:20 UTC): the Demo Practice starts the day clean.
    if (new Date().getUTCHours() === 0 && minute === 20) await run("demo-reset", () => resetDemoPractice());
    if (minute === 5) {
      await run("reminders", () => runReminders());
      await run("weekly", () => weeklyReports());
      await run("best-hours", async () => {
        for (const s of await rootDb().marketingSettings.findMany({ select: { practiceId: true } })) await learnBestHours(tenantDb(systemCtx(s.practiceId)));
      });
    }
  });
  return NextResponse.json({ accepted: true });
}
