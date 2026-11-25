import { NextResponse, type NextRequest } from "next/server";
import { rootDb } from "@aah/db";
import { appUrl } from "@/lib/marketing/engine";

export const dynamic = "force-dynamic";

/**
 * A contact's personal referral link. Records the click and sends the visitor to the
 * sign-up page with ?ref=R-<referrer token>, so the sign-up callback credits the referrer.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lead = await rootDb().marketingLead.findUnique({ where: { token }, select: { id: true, practiceId: true } });
  const target = process.env.MARKETING_REFERRAL_URL ?? process.env.MARKETING_SIGNUP_URL ?? "https://analiva.app";
  if (!lead) return NextResponse.redirect(appUrl(), 302);
  await rootDb().referralEvent.create({ data: { practiceId: lead.practiceId, referrerId: lead.id, kind: "CLICK" } });
  const url = new URL(target);
  url.searchParams.set("ref", `R-${token}`);
  return NextResponse.redirect(url, 302);
}
