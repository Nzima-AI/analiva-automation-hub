import { NextResponse, type NextRequest } from "next/server";
import { isOptOutReply, matchKeyword, normalizePhone, saParts, tagReply } from "@aah/core";
import { decryptSecret } from "@aah/core/secrets";
import { rootDb, tenantDb } from "@aah/db";
import { secretsKey } from "@/lib/env";
import { marketingSettings, systemCtx, trackedLink } from "@/lib/marketing/engine";
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

interface WaMessage {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { type?: string; button_reply?: { title?: string }; nfm_reply?: { response_json?: string; body?: string } };
}

interface WaWebhook {
  entry?: Array<{ changes?: Array<{ value?: {
    metadata?: { phone_number_id?: string };
    contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
    messages?: WaMessage[];
    statuses?: Array<{ id: string; status: "sent" | "delivered" | "read" | "failed"; timestamp?: string; errors?: Array<{ title?: string; message?: string }> }>;
  } }> }>;
}

const STATUS_RANK = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4, SKIPPED: 4 } as const;

/** What a quick-reply button means, from its wording. */
function buttonAction(text: string): "SEND_LINK" | "CALLBACK" | "NOT_NOW" | "STOP" | null {
  const t = text.toLowerCase();
  if (/stop|unsubscribe|opt out/.test(t)) return "STOP";
  if (/call/.test(t)) return "CALLBACK";
  if (/not now|later|no thanks|maybe/.test(t)) return "NOT_NOW";
  if (/sign|yes|interested|start|join|send|link|count me/.test(t)) return "SEND_LINK";
  return null;
}

/** Delivery receipts, replies, button taps and WhatsApp form answers. Answers 200 once the signature checks out, so Meta doesn't retry forever. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  let payload: WaWebhook;
  try {
    payload = JSON.parse(raw) as WaWebhook;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  const root = rootDb();
  for (const change of payload.entry?.flatMap((entry) => entry.changes ?? []) ?? []) {
    const value = change.value;
    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!value || !phoneNumberId) continue;
    const setting = await root.whatsAppSetting.findUnique({ where: { phoneNumberId } });
    if (!setting) continue;
    if (!validSignature(raw, request.headers.get("x-hub-signature-256"), decryptSecret(setting.appSecretEncrypted, secretsKey()))) {
      console.error("whatsapp webhook: bad signature", { phoneNumberId });
      return new NextResponse("Bad signature", { status: 401 });
    }
    const db = tenantDb(systemCtx(setting.practiceId));

    for (const status of value.statuses ?? []) {
      const send = await db.marketingSend.findFirst({ where: { providerId: status.id }, select: { id: true, status: true } });
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
          ...(next === "FAILED" ? { error: (status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? "Failed").slice(0, 300), costCents: 0 } : {}),
        },
      });
    }

    for (const message of value.messages ?? []) {
      const flow = message.interactive?.nfm_reply;
      const buttonText = message.button?.text ?? message.interactive?.button_reply?.title ?? null;
      const text = flow ? "[Form submitted]" : (message.text?.body ?? buttonText ?? `[${message.type}]`);
      const phone = normalizePhone(`+${message.from}`) ?? message.from;
      const lead = await db.marketingLead.findFirst({ where: { phone }, select: { id: true, name: true, whatsappOptedOutAt: true, tags: true } });
      const action = buttonText ? buttonAction(buttonText) : null;
      const optOut = action === "STOP" || isOptOutReply(text);
      const tag = optOut ? "STOP" : action === "CALLBACK" ? "CALLBACK" : action === "SEND_LINK" || flow ? "INTERESTED" : tagReply(text);
      const created = await db.whatsAppMessage.createMany({
        data: { practiceId: setting.practiceId, leadId: lead?.id ?? null, fromPhone: phone, fromName: value.contacts?.find((c) => c.wa_id === message.from)?.profile?.name ?? null, body: text.slice(0, 4000), providerId: message.id, optOut, tag },
        skipDuplicates: true, // Meta may deliver the same message twice
      });
      if (!created.count) continue;
      const now = new Date();
      const latest = lead ? await db.marketingSend.findFirst({ where: { leadId: lead.id, channel: "WHATSAPP", sentAt: { not: null } }, orderBy: { sentAt: "desc" } }) : null;
      if (lead) {
        await db.marketingLead.updateMany({ where: { id: lead.id }, data: { lastRepliedAt: now, ...(optOut && !lead.whatsappOptedOutAt ? { whatsappOptedOutAt: now } : {}) } });
        if (latest && !latest.repliedAt) await db.marketingSend.updateMany({ where: { id: latest.id }, data: { repliedAt: now, ...(buttonText ? { buttonReply: buttonText } : {}) } });
      }
      const reply = async (body: string) => {
        const r = await sendText(setting, message.from, body);
        if (r.ok) await db.whatsAppMessage.create({ data: { practiceId: setting.practiceId, leadId: lead?.id ?? null, fromPhone: phone, direction: "OUT", body, providerId: r.id, handledAt: new Date() } });
      };

      if (optOut && lead && !lead.whatsappOptedOutAt) {
        await db.auditLog.create({ data: { practiceId: setting.practiceId, actorType: "SYSTEM", actorLabel: "WhatsApp reply", action: "lead.opted_out", entityType: "MarketingLead", entityId: lead.id, metadata: { channel: "WHATSAPP" } } });
        // A reply inside the 24-hour window is free; confirm so the person knows it worked.
        await reply("You won't receive marketing messages from us on WhatsApp again. Reply START if you change your mind.");
        continue;
      }
      if (/^\s*start\s*$/i.test(text) && lead?.whatsappOptedOutAt) {
        await db.marketingLead.updateMany({ where: { id: lead.id }, data: { whatsappOptedOutAt: null, whatsappConsentAt: now } });
        await db.auditLog.create({ data: { practiceId: setting.practiceId, actorType: "SYSTEM", actorLabel: "WhatsApp reply", action: "lead.opted_in", entityType: "MarketingLead", entityId: lead.id, metadata: { channel: "WHATSAPP", evidence: `Replied START on ${now.toISOString()}` } } });
        await reply("Welcome back! You'll hear from us again.");
        continue;
      }
      const keyword = !action && !flow ? matchKeyword(text, await db.marketingKeyword.findMany({ where: { active: true } })) : null;
      if (lead && action === "SEND_LINK" && latest) {
        await reply(`Great! Here's your personal link: ${trackedLink(latest.token)}`);
      } else if (lead && action === "CALLBACK") {
        await db.marketingTask.create({ data: { practiceId: setting.practiceId, leadId: lead.id, kind: "CALLBACK", note: buttonText ?? text } });
        await reply("Thanks! We'll call you soon.");
      } else if (lead && action === "NOT_NOW") {
        await db.marketingLead.updateMany({ where: { id: lead.id }, data: { snoozedUntil: new Date(Date.now() + 30 * 86_400_000) } });
        await reply("No problem, we won't follow up for a while. Reply anytime if you change your mind.");
      } else if (flow && lead) {
        // A WhatsApp form (Flow): store the answers on the contact and treat it as a sign-up request.
        let answers: Record<string, unknown> = {};
        try { answers = JSON.parse(flow.response_json ?? "{}") as Record<string, unknown>; } catch {}
        await db.marketingLead.updateMany({
          where: { id: lead.id },
          data: {
            ...(typeof answers.company === "string" ? { company: answers.company.slice(0, 200) } : {}),
            ...(typeof answers.email === "string" && answers.email.includes("@") ? { email: answers.email.toLowerCase().slice(0, 200) } : {}),
            followUp: `Form answers: ${JSON.stringify(answers).slice(0, 900)}`,
            stage: "QUALIFIED",
          },
        });
        await db.marketingTask.create({ data: { practiceId: setting.practiceId, leadId: lead.id, kind: "FORM", note: "Filled in the WhatsApp sign-up form" } });
      } else if (keyword) {
        // A keyword auto-reply (e.g. PRICE, VAT): answered at once, free inside the 24-hour window.
        await reply(keyword.reply);
        await db.marketingKeyword.updateMany({ where: { id: keyword.id }, data: { hits: { increment: 1 } } });
        await db.whatsAppMessage.updateMany({ where: { providerId: message.id }, data: { handledAt: now } });
        if (lead && keyword.tag && !lead.tags.includes(keyword.tag)) await db.marketingLead.updateMany({ where: { id: lead.id }, data: { tags: { push: keyword.tag } } });
        await db.auditLog.create({ data: { practiceId: setting.practiceId, actorType: "SYSTEM", actorLabel: "Keyword auto-reply", action: "keyword.replied", entityType: "MarketingKeyword", entityId: keyword.id, metadata: { keyword: keyword.keyword } } });
      } else {
        const settings = await marketingSettings(db);
        const { hour } = saParts(now);
        const quiet = settings.quietStart > settings.quietEnd ? hour >= settings.quietStart || hour < settings.quietEnd : hour >= settings.quietStart && hour < settings.quietEnd;
        if (settings.autoReplyText && quiet) {
          const sentToday = await db.whatsAppMessage.count({ where: { fromPhone: phone, direction: "OUT", body: settings.autoReplyText, receivedAt: { gte: new Date(Date.now() - 86_400_000) } } });
          if (!sentToday) await reply(settings.autoReplyText);
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}
