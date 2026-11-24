import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizePhone } from "@aah/core";
import { rootDb } from "@aah/db";

export const dynamic = "force-dynamic";

const body = z.union([
  z.object({ ref: z.string().min(10).max(40) }),
  z.object({ practice: z.string().min(1).max(80), email: z.string().email().max(200).optional(), phone: z.string().max(40).optional() }).refine((b) => b.email || b.phone, "email or phone is required"),
]);

function authorised(request: NextRequest): boolean {
  const secret = process.env.MARKETING_CONVERSION_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/**
 * Analiva (or any sign-up form) calls this when someone signs up, with the ?ref= value from the
 * tracked link, or the practice slug and the person's email or phone. Marks the contact Won.
 * POST /api/marketing/conversions  Authorization: Bearer MARKETING_CONVERSION_SECRET
 */
export async function POST(request: NextRequest) {
  if (!authorised(request)) return new NextResponse("Unauthorized", { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const db = rootDb();
  const input = parsed.data;
  let lead: { id: string; practiceId: string; signedUpAt: Date | null } | null;
  if ("ref" in input) {
    lead = await db.marketingLead.findUnique({ where: { token: input.ref }, select: { id: true, practiceId: true, signedUpAt: true } });
  } else {
    const practice = await db.practice.findUnique({ where: { slug: input.practice }, select: { id: true } });
    const phone = normalizePhone(input.phone);
    lead = practice
      ? await db.marketingLead.findFirst({
          where: { practiceId: practice.id, OR: [...(input.email ? [{ email: input.email.toLowerCase() }] : []), ...(phone ? [{ phone }] : [])] },
          select: { id: true, practiceId: true, signedUpAt: true },
        })
      : null;
  }
  if (!lead) return NextResponse.json({ matched: false });
  if (!lead.signedUpAt) {
    const now = new Date();
    const latest = await db.marketingSend.findFirst({ where: { leadId: lead.id, sentAt: { not: null } }, orderBy: { sentAt: "desc" }, select: { id: true } });
    await db.$transaction([
      db.marketingLead.updateMany({ where: { id: lead.id }, data: { signedUpAt: now, stage: "WON" } }),
      ...(latest ? [db.marketingSend.updateMany({ where: { id: latest.id }, data: { signedUpAt: now } })] : []),
      db.auditLog.create({ data: { practiceId: lead.practiceId, actorType: "API_KEY", actorLabel: "Sign-up callback", action: "lead.signed_up", entityType: "MarketingLead", entityId: lead.id } }),
    ]);
  }
  return NextResponse.json({ matched: true });
}
