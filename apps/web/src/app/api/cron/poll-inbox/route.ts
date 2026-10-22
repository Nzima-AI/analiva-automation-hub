import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { pollInboxes } from "@/lib/inbox/poll";

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

/**
 * Called every 5 minutes by Supabase pg_cron (see docs/decisions/0003-inbox-capture.md).
 * Answers immediately and does the work after the response, so the caller's short
 * HTTP timeout doesn't cut the poll short.
 */
export async function POST(request: NextRequest) {
  if (!authorised(request)) return new NextResponse("Unauthorized", { status: 401 });
  const started = Date.now();
  after(async () => {
    const results = await pollInboxes({ deadline: started + 270_000 });
    console.log("inbox poll", JSON.stringify(results));
  });
  return NextResponse.json({ accepted: true });
}
