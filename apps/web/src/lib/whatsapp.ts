import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptSecret } from "@aah/core/secrets";
import type { WhatsAppSetting } from "@aah/db";
import { secretsKey } from "@/lib/env";

/**
 * Meta WhatsApp Business Platform (Cloud API), called directly: no reseller and no monthly fee,
 * Meta bills per delivered template message. Docs: developers.facebook.com/docs/whatsapp/cloud-api
 */
const GRAPH = "https://graph.facebook.com/v23.0";

export type WaResult = { ok: true; id: string } | { ok: false; error: string; retry: boolean };

export interface WaTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  /** How many {{n}} placeholders the body has. */
  bodyParams: number;
  bodyText: string;
}

function token(setting: Pick<WhatsAppSetting, "accessTokenEncrypted">) {
  return decryptSecret(setting.accessTokenEncrypted, secretsKey());
}

async function graph(setting: Pick<WhatsAppSetting, "accessTokenEncrypted">, path: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token(setting)}`, "content-type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & Record<string, unknown>;
  return { res, body };
}

/** Sends an approved template (the only kind of message Meta allows outside a 24-hour reply window). */
export async function sendTemplate(
  setting: Pick<WhatsAppSetting, "accessTokenEncrypted" | "phoneNumberId">,
  o: { to: string; template: string; language: string; params: string[] },
): Promise<WaResult> {
  try {
    const { res, body } = await graph(setting, `${setting.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: o.to,
        type: "template",
        template: {
          name: o.template,
          language: { code: o.language },
          ...(o.params.length ? { components: [{ type: "body", parameters: o.params.map((text) => ({ type: "text", text: text.slice(0, 1000) })) }] } : {}),
        },
      }),
    });
    const id = (body.messages as Array<{ id?: string }> | undefined)?.[0]?.id;
    if (res.ok && id) return { ok: true, id };
    // 429 and 5xx are worth another try; 4xx (bad number, template not approved) are not.
    return { ok: false, error: body.error?.message?.slice(0, 300) ?? `Meta returned ${res.status}`, retry: res.status === 429 || res.status >= 500 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e), retry: true };
  }
}

/** A free-form text reply, allowed within 24 hours of the contact's last message. */
export async function sendText(setting: Pick<WhatsAppSetting, "accessTokenEncrypted" | "phoneNumberId">, to: string, text: string): Promise<WaResult> {
  try {
    const { res, body } = await graph(setting, `${setting.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4096) } }),
    });
    const id = (body.messages as Array<{ id?: string }> | undefined)?.[0]?.id;
    return res.ok && id ? { ok: true, id } : { ok: false, error: body.error?.message?.slice(0, 300) ?? `Meta returned ${res.status}`, retry: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e), retry: true };
  }
}

/** The practice's message templates, so staff pick an approved one instead of typing its name. */
export async function listTemplates(setting: Pick<WhatsAppSetting, "accessTokenEncrypted" | "businessAccountId">): Promise<{ templates: WaTemplate[]; error: string | null }> {
  try {
    const { res, body } = await graph(setting, `${setting.businessAccountId}/message_templates?limit=100&fields=name,language,status,category,components`);
    if (!res.ok) return { templates: [], error: body.error?.message ?? `Meta returned ${res.status}` };
    const data = (body.data ?? []) as Array<{ name: string; language: string; status: string; category: string; components?: Array<{ type: string; text?: string }> }>;
    return {
      error: null,
      templates: data.map((t) => {
        const text = t.components?.find((c) => c.type === "BODY")?.text ?? "";
        return { name: t.name, language: t.language, status: t.status, category: t.category, bodyText: text, bodyParams: new Set(text.match(/\{\{\d+\}\}/g) ?? []).size };
      }),
    };
  } catch (e) {
    return { templates: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Checks the connection details by reading the phone number they point at. */
export async function checkConnection(setting: Pick<WhatsAppSetting, "accessTokenEncrypted" | "phoneNumberId">) {
  try {
    const { res, body } = await graph(setting, `${setting.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`);
    if (!res.ok) return { ok: false as const, error: body.error?.message ?? `Meta returned ${res.status}` };
    return { ok: true as const, displayNumber: String(body.display_phone_number ?? ""), name: String(body.verified_name ?? ""), quality: String(body.quality_rating ?? "") };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Meta signs every webhook with the app secret (X-Hub-Signature-256: sha256=<hex>). */
export function validSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return got.length === expected.length && timingSafeEqual(got, expected);
}
