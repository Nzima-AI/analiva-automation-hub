import { NextResponse } from "next/server";
import { audit } from "@aah/db";
import { isPracticeRole } from "@aah/core";
import { loadSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every marketing contact as CSV, with consent evidence (POPIA access requests, backups). Staff only. */
export async function GET() {
  const result = await loadSession();
  if (result.status !== "ok" || !isPracticeRole(result.session.ctx.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { db, ctx, user } = result.session;
  const leads = await db.marketingLead.findMany({ orderBy: { createdAt: "asc" }, take: 50_000 });
  const head = ["Name", "Company", "Mobile", "Email", "Interest", "Stage", "Segments", "Region", "Source", "WhatsApp allowed since", "WhatsApp opted out", "Email allowed since", "Email opted out", "Permission evidence", "Signed up", "Added"];
  const rows = leads.map((l) => [l.name, l.company, l.phone ? `+${l.phone}` : "", l.email, l.interest, l.stage, l.tags, l.region, l.source, l.whatsappConsentAt, l.whatsappOptedOutAt, l.consentAt, l.optedOutAt, l.consentEvidence, l.signedUpAt, l.createdAt].map(cell).join(","));
  await audit(ctx, { action: "lead.exported", entityType: "MarketingLead", entityId: ctx.practiceId, reason: `${leads.length} contacts exported as CSV` }, user.name ?? undefined);
  return new NextResponse("﻿" + [head.join(","), ...rows].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="whatsapp-contacts-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
