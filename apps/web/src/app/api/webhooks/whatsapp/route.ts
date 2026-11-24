import { NextResponse, type NextRequest } from "next/server";
import { isOptOutReply, normalizePhone } from "@aah/core";
import { decryptSecret } from "@aah/core/secrets";
import { rootDb } from "@aah/db";
import { secretsKey } from "@/lib/env";
import { sendText, validSignature } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/** Meta's one-off check when the webhook URL is saved in the Meta app (hub.verify_token must match ours). */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const token = q.get("hub.verify_token");
  if (q.get("hub.mode") !== "subscribe" || !token) return new NextResponse("Forbidden", { status: 403 });
  const setting = await rootDb().whatsAppSetting.findFirst({ where: { verifyToken: token }, select: { id: true } });
  return setting ? new NextResponse(q.get("hub.challenge") ?? "", { status: 200 }) : new NextResponse("Forbidden", { status: 403 });
}

interface WaWebhook {
  entry?: Array<{ changes?: Array<{ value?: {
    metadata?: { phone_number_id?: string };
    contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
    messages?: Array<{ id: string; from: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string } } }>;
    statuses?: Array<{ id: string; status: "sent" | "delivered" | "read" | "failed"; timestamp?: string; errors?: Array<{ title?: string; message?: string }> }>;
  } }> }>;
}

const STATUS_RANK = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4, SKIPPED: 4 } as const;

/** Delivery receipts and replies. Always answers 200 once the signature checks out, so Meta doesn't retry forever. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  let payload: WaWebhook;
  try {
    payload = JSON.parse(raw) as WaWebhook;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  const db = rootDb();
  for (const change of payload.entry?.flatMap((entry) => entry.changes ?? []) ?? []) {
    const value = change.value;
    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!value || !phoneNumberId) continue;
    const setting = await db.whatsAppSetting.findUnique({ where: { phoneNumberId } });
    if (!setting) continue;
    if (!validSignature(raw, request.headers.get("x-hub-signature-256"), decryptSecret(setting.appSecretEncrypted, secretsKey()))) {
      console.error("whatsapp webhook: bad signature", { phoneNumberId });
      return new NextResponse("Bad signature", { status: 401 });
    }

    for (const status of value.statuses ?? []) {
      const send = await db.marketingSend.findUnique({ where: { providerId: status.id }, select: { id: true, status: true } });
      if (!send) continue;
      const next = status.status === "failed" ? "FAILED" : (status.status.toUpperCase() as "SENT" | "DELIVERED" | "READ");
      // Receipts can arrive out of order: never move "read" back to "delivered".
      if (next !== "FAILED" && STATUS_RANK[next] <= STATUS_RANK[send.status]) continue;
      const at = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
      await db.marketingSend.updateMany({
        where: { id: send.id },
        data: {
          status: next,
          ...(next === "DELIVERED" ? { deliveredAt: at } : {}),
          ...(next === "READ" ? { readAt: at } : {}),
          ...(next === "FAILED" ? { error: (status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? "Failed").slice(0, 300) } : {}),
        },
      });
    }

    for (const message of value.messages ?? []) {
      const text = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title ?? `[${message.type}]`;
      const phone = normalizePhone(`+${message.from}`) ?? message.from;
      const lead = await db.marketingLead.findFirst({ where: { practiceId: setting.practiceId, phone }, select: { id: true, whatsappOptedOutAt: true } });
      const optOut = isOptOutReply(text);
      const created = await db.whatsAppMessage.createMany({
        data: { practiceId: setting.practiceId, leadId: lead?.id ?? null, fromPhone: phone, fromName: value.contacts?.find((c) => c.wa_id === message.from)?.profile?.name ?? null, body: text.slice(0, 4000), providerId: message.id, optOut },
        skipDuplicates: true, // Meta may deliver the same message twice
      });
      if (!created.count || !lead) continue;
      const now = new Date();
      await db.marketingLead.updateMany({ where: { id: lead.id }, data: { lastRepliedAt: now, ...(optOut && !lead.whatsappOptedOutAt ? { whatsappOptedOutAt: now } : {}) } });
      const latest = await db.marketingSend.findFirst({ where: { leadId: lead.id, channel: "WHATSAPP", repliedAt: null, sentAt: { not: null } }, orderBy: { sentAt: "desc" }, select: { id: true } });
      if (latest) await db.marketingSend.updateMany({ where: { id: latest.id }, data: { repliedAt: now } });
      if (optOut && !lead.whatsappOptedOutAt) {
        await db.auditLog.create({ data: { practiceId: setting.practiceId, actorType: "SYSTEM", actorLabel: "WhatsApp reply", action: "lead.opted_out", entityType: "MarketingLead", entityId: lead.id, metadata: { channel: "WHATSAPP" } } });
        // A reply inside the 24-hour window is free; confirm so the person knows it worked.
        await sendText(setting, message.from, "You won't receive marketing messages from us on WhatsApp again. Reply START if you change your mind.");
      } else if (/^\s*start\s*$/i.test(text) && lead.whatsappOptedOutAt) {
        await db.marketingLead.updateMany({ where: { id: lead.id }, data: { whatsappOptedOutAt: null, whatsappConsentAt: now } });
        await db.auditLog.create({ data: { practiceId: setting.practiceId, actorType: "SYSTEM", actorLabel: "WhatsApp reply", action: "lead.opted_in", entityType: "MarketingLead", entityId: lead.id, metadata: { channel: "WHATSAPP", evidence: `Replied START on ${now.toISOString()}` } } });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
