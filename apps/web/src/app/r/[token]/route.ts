import { NextResponse, type NextRequest } from "next/server";
import { rootDb } from "@aah/db";
import { appUrl } from "@/lib/marketing/engine";

export const dynamic = "force-dynamic";

/** A tracked campaign link: records the click, then sends the person on with ?ref=<contact> for sign-up attribution. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const send = await rootDb().marketingSend.findUnique({ where: { token }, include: { campaign: { select: { ctaUrl: true } }, lead: { select: { id: true, token: true, stage: true } } } });
  if (!send?.campaign.ctaUrl) return NextResponse.redirect(appUrl(), 302);
  const now = new Date();
  await rootDb().$transaction([
    rootDb().marketingSend.updateMany({ where: { id: send.id, clickedAt: null }, data: { clickedAt: now } }),
    rootDb().marketingLead.updateMany({ where: { id: send.lead.id }, data: { lastClickedAt: now, ...(send.lead.stage === "NEW" ? { stage: "CONTACTED" } : {}) } }),
  ]);
  const target = new URL(send.campaign.ctaUrl);
  target.searchParams.set("ref", send.lead.token);
  return NextResponse.redirect(target, 302);
}
