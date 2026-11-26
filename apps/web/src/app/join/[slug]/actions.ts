"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizePhone } from "@aah/core";
import { rootDb } from "@aah/db";

const schema = z.object({
  name: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(6).max(40),
  email: z.string().trim().toLowerCase().max(200).optional().transform((v) => (v && v.includes("@") ? v : null)),
  company: z.string().trim().max(200).optional().transform((v) => v ?? ""),
  interest: z.enum(["REPORTING", "BOOKKEEPING", "PAYROLL"]).catch("REPORTING"),
  consent: z.literal("on"),
  website: z.string().max(0).optional(), // left empty by people; bots fill it in
});

/** The public opt-in form: adds the person with WhatsApp permission recorded as evidence (POPIA). */
export async function joinList(slug: string, form: FormData) {
  const back = (error: string) => redirect(`/join/${slug}?error=${encodeURIComponent(error)}`);
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "consent")) back("Please tick the box to agree to WhatsApp messages.");
    back("Please enter your name and a mobile number.");
    return;
  }
  const i = parsed.data;
  const phone = normalizePhone(i.phone);
  if (!phone) back("That mobile number doesn't look right. Try 082 123 4567.");

  const db = rootDb();
  const practice = await db.practice.findUnique({ where: { slug }, select: { id: true, marketingSettings: { select: { optInEnabled: true } } } });
  if (!practice?.marketingSettings?.optInEnabled) redirect(`/join/${slug}`);
  const owner = await db.user.findFirst({ where: { practiceId: practice.id, role: "OWNER", disabledAt: null }, select: { id: true } });
  if (!owner) redirect(`/join/${slug}`);

  const now = new Date();
  const evidence = `Opted in on the practice's WhatsApp sign-up page on ${now.toISOString().slice(0, 16).replace("T", " ")} UTC (ticked the consent box).`;
  const existing = await db.marketingLead.findFirst({ where: { practiceId: practice.id, phone }, select: { id: true, tags: true } });
  const lead = existing
    ? await db.marketingLead.update({ where: { id: existing.id }, data: { whatsappConsentAt: now, whatsappOptedOutAt: null, consentEvidence: evidence, tags: existing.tags.includes("opt-in") ? undefined : { push: "opt-in" } } })
    : await db.marketingLead.create({
        data: {
          practiceId: practice.id, ownerId: owner.id, name: i.name, company: i.company, phone, email: i.email, interest: i.interest, source: "WEBSITE",
          tags: ["opt-in"], whatsappConsentAt: now, consentEvidence: evidence,
        },
      }).catch(() => null); // the same email already on another contact: keep the person out rather than fail
  if (lead) {
    await db.auditLog.create({ data: { practiceId: practice.id, actorType: "SYSTEM", actorLabel: "WhatsApp sign-up page", action: "lead.opted_in", entityType: "MarketingLead", entityId: lead.id, metadata: { channel: "WHATSAPP", evidence } } });
  }
  redirect(`/join/${slug}?done=1`);
}
