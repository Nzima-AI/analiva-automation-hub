import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { processQueue } from "@/lib/marketing/engine";

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

/** Called every minute by Supabase pg_cron (docs/decisions/0004-marketing-campaigns.md): sends the next batch of each running campaign. */
export async function POST(request: NextRequest) {
  if (!authorised(request)) return new NextResponse("Unauthorized", { status: 401 });
  const started = Date.now();
  after(async () => {
    const results = await processQueue({ deadline: started + 50_000 });
    if (results.length) console.log("marketing send", JSON.stringify(results));
  });
  return NextResponse.json({ accepted: true });
}
