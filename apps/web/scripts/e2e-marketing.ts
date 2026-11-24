// End-to-end check of WhatsApp/email campaigns against a LOCAL throwaway Postgres, with Meta faked.
// Refuses to run against anything but localhost.
// Usage (from apps/web, with a Postgres on localhost:55432 that has every migration applied):
//   DATABASE_URL=postgresql://postgres:test@localhost:55432/postgres \
//   npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/e2e-marketing.ts
import { createHmac, randomBytes } from "node:crypto";
import assert from "node:assert/strict";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1):/.test(url)) throw new Error("e2e-marketing only runs against a local database.");
process.env.DIRECT_URL = url;
process.env.SECRETS_KEY = randomBytes(32).toString("base64");
process.env.NEXT_PUBLIC_APP_URL = "https://hub.example";
process.env.MARKETING_CONVERSION_SECRET = "conv-secret";

const { encryptSecret } = await import("@aah/core/secrets");
const { rootDb, tenantDb } = await import("@aah/db");
const { NextRequest } = await import("next/server");
const engine = await import("../src/lib/marketing/engine");
const webhook = await import("../src/app/api/webhooks/whatsapp/route");
const click = await import("../src/app/r/[token]/route");
const unsubscribe = await import("../src/app/u/[token]/route");
const conversions = await import("../src/app/api/marketing/conversions/route");

// Fake Meta: records every call, answers like the Cloud API.
const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
let failNext = 0;
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  calls.push({ url: String(input), body });
  if (failNext > 0) {
    failNext--;
    return new Response(JSON.stringify({ error: { message: "(#131026) Message undeliverable" } }), { status: 400 });
  }
  return new Response(JSON.stringify({ messages: [{ id: `wamid.${calls.length}` }] }), { status: 200 });
}) as typeof fetch;

const db = rootDb();
const practice = await db.practice.create({ data: { name: "Test Practice", slug: `t-${Date.now()}` } });
const ctx = { practiceId: practice.id, userId: "u-owner", role: "OWNER" as const, clientId: null };
const tdb = tenantDb(ctx);
const now = new Date();
const base = { practiceId: practice.id, ownerId: "u-owner", source: "IMPORT" as const, interest: "PAYROLL" as const, company: "Co" };
const [allowed, allowed2, noConsent, optedOut, otherTag] = await Promise.all([
  tdb.marketingLead.create({ data: { ...base, name: "Thandi Nkosi", phone: "27821110001", tags: ["past client"], whatsappConsentAt: now } }),
  tdb.marketingLead.create({ data: { ...base, name: "Sipho Dube", phone: "27821110002", tags: ["past client", "vip"], whatsappConsentAt: now } }),
  tdb.marketingLead.create({ data: { ...base, name: "No Permission", phone: "27821110003", tags: ["past client"] } }),
  tdb.marketingLead.create({ data: { ...base, name: "Opted Out", phone: "27821110004", tags: ["past client"], whatsappConsentAt: now, whatsappOptedOutAt: now } }),
  tdb.marketingLead.create({ data: { ...base, name: "Other Segment", phone: "27821110005", tags: ["prospect"], whatsappConsentAt: now } }),
]);
// A second practice's contact must never be reached.
const other = await db.practice.create({ data: { name: "Other", slug: `o-${Date.now()}` } });
await tenantDb({ ...ctx, practiceId: other.id }).marketingLead.create({ data: { ...base, practiceId: other.id, name: "Foreign", phone: "27821119999", tags: ["past client"], whatsappConsentAt: now } });

const appSecret = "meta-app-secret-123456";
await tdb.whatsAppSetting.create({
  data: { practiceId: practice.id, phoneNumberId: `${Date.now()}`, businessAccountId: "999", accessTokenEncrypted: encryptSecret("token-abc", process.env.SECRETS_KEY!), appSecretEncrypted: encryptSecret(appSecret, process.env.SECRETS_KEY!), batchSize: 1 },
});
const setting = (await tdb.whatsAppSetting.findFirst())!;

// 1. Audience: consent, opt-out, segment and tenant rules.
const campaign = await tdb.marketingCampaign.create({
  data: { practiceId: practice.id, name: "Launch", channel: "WHATSAPP", subject: "launch", body: "", tags: ["past client"], ctaUrl: "https://analiva.example/signup", whatsappTemplate: "analiva_launch", templateLanguage: "en", templateParams: ["firstName", "link"], createdById: "u-owner" },
});
assert.deepEqual("error" in (await engine.queueCampaign(tdb, ctx, campaign.id, "t")), true, "a draft can't be sent");
await tdb.marketingCampaign.updateMany({ where: { id: campaign.id }, data: { status: "APPROVED", approvedAt: now } });
const queued = await engine.queueCampaign(tdb, ctx, campaign.id, "Tester");
assert.deepEqual(queued, { queued: 2 }, "only the two permitted past clients are queued");

// 2. Batches: batchSize 1 sends one per run; a hard failure is recorded, not retried.
failNext = 1;
await engine.processQueue({ deadline: Date.now() + 10_000 });
await engine.processQueue({ deadline: Date.now() + 10_000 });
const sends = await tdb.marketingSend.findMany({ where: { campaignId: campaign.id }, include: { lead: true }, orderBy: { createdAt: "asc" } });
assert.equal(sends.filter((s) => s.status === "FAILED").length, 1);
const ok = sends.find((s) => s.status === "SENT")!;
assert.ok(ok?.providerId?.startsWith("wamid."));
const sentCall = calls.at(-1)!;
assert.match(sentCall.url, /\/messages$/);
const params = ((sentCall.body.template as { components: Array<{ parameters: Array<{ text: string }> }> }).components[0]!.parameters).map((p) => p.text);
assert.equal(params[0], ok.lead.name.split(" ")[0]);
assert.equal(params[1], `https://hub.example/r/${ok.token}`, "the link is the personal tracked link");
assert.equal((await tdb.marketingCampaign.findFirst({ where: { id: campaign.id } }))!.status, "SENT");

// 3. Webhook: unsigned calls are refused; signed receipts move forward only; STOP opts out.
const hook = (payload: unknown, secret = appSecret) => {
  const raw = JSON.stringify(payload);
  const sig = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  return webhook.POST(new NextRequest("https://hub.example/api/webhooks/whatsapp", { method: "POST", body: raw, headers: { "x-hub-signature-256": sig } }));
};
const value = (v: Record<string, unknown>) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: setting.phoneNumberId }, ...v } }] }] });
assert.equal((await hook(value({ statuses: [] }), "wrong-secret")).status, 401);
await hook(value({ statuses: [{ id: ok.providerId, status: "read", timestamp: String(Math.floor(Date.now() / 1000)) }] }));
await hook(value({ statuses: [{ id: ok.providerId, status: "delivered" }] }));
assert.equal((await tdb.marketingSend.findFirst({ where: { id: ok.id } }))!.status, "READ", "a late 'delivered' doesn't undo 'read'");
const stop = { messages: [{ id: "wamid.in1", from: ok.toAddress, type: "text", text: { body: "STOP" } }], contacts: [{ wa_id: ok.toAddress, profile: { name: "T" } }] };
await hook(value(stop));
await hook(value(stop)); // Meta can deliver twice
assert.equal(await tdb.whatsAppMessage.count(), 1, "duplicate webhook stored once");
const stopped = (await tdb.marketingLead.findFirst({ where: { id: ok.leadId } }))!;
assert.ok(stopped.whatsappOptedOutAt, "STOP opts the contact out");
assert.equal(calls.filter((c) => (c.body.text as { body?: string } | undefined)?.body?.includes("won't receive")).length, 1, "one confirmation reply");
await hook(value({ messages: [{ id: "wamid.in2", from: ok.toAddress, type: "text", text: { body: "start" } }] }));
assert.equal((await tdb.marketingLead.findFirst({ where: { id: ok.leadId } }))!.whatsappOptedOutAt, null, "START opts back in");
const verify = await webhook.GET(new NextRequest(`https://hub.example/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${setting.verifyToken}&hub.challenge=42`));
assert.equal(await verify.text(), "42");

// 4. Click, sign-up callback, follow-up audience.
const clicked = await click.GET(new NextRequest(`https://hub.example/r/${ok.token}`), { params: Promise.resolve({ token: ok.token }) });
assert.equal(clicked.status, 302);
assert.equal(clicked.headers.get("location"), `https://analiva.example/signup?ref=${ok.lead.token}`);
assert.ok((await tdb.marketingSend.findFirst({ where: { id: ok.id } }))!.clickedAt);
const convert = (body: unknown, auth = "Bearer conv-secret") => conversions.POST(new NextRequest("https://hub.example/api/marketing/conversions", { method: "POST", body: JSON.stringify(body), headers: { authorization: auth } }));
assert.equal((await convert({ ref: ok.lead.token }, "Bearer nope")).status, 401);
assert.deepEqual(await (await convert({ ref: ok.lead.token })).json(), { matched: true });
const won = (await tdb.marketingLead.findFirst({ where: { id: ok.leadId } }))!;
assert.equal(won.stage, "WON");
assert.ok(won.signedUpAt);

const followUp = await tdb.marketingCampaign.create({ data: { practiceId: practice.id, name: "FU", channel: "WHATSAPP", subject: "s", body: "", whatsappTemplate: "t", createdById: "u", parentId: campaign.id, followUpRule: "SIGNED_UP" } });
const fuIds = (await tdb.marketingLead.findMany({ where: await engine.audienceFor(tdb, followUp), select: { id: true } })).map((l) => l.id);
assert.deepEqual(fuIds, [ok.leadId], "follow-up 'signed up' targets exactly the sign-up");

const stats = await engine.campaignStats(tdb, campaign.id);
assert.deepEqual({ total: stats.total, sent: stats.sent, read: stats.read, failed: stats.failed, clicked: stats.clicked, signedUp: stats.signedUp, replied: stats.replied }, { total: 2, sent: 1, read: 1, failed: 1, clicked: 1, signedUp: 1, replied: 1 });

// 5. Email: unsubscribe page needs a POST (link scanners only GET), and the email carries the links.
const mail = engine.composeEmail({ subject: "Hi {{firstName}}", body: "Sign up: {{link}}", ctaUrl: "https://analiva.example/signup" }, allowed2, "Test Practice", "sendtoken");
assert.match(mail.text, /https:\/\/hub\.example\/r\/sendtoken/);
assert.match(mail.text, new RegExp(`Unsubscribe: https://hub.example/u/${allowed2.token}`));
const tokenParams = { params: Promise.resolve({ token: allowed2.token }) };
await unsubscribe.GET(new NextRequest(`https://hub.example/u/${allowed2.token}`), tokenParams);
assert.equal((await tdb.marketingLead.findFirst({ where: { id: allowed2.id } }))!.optedOutAt, null, "GET alone doesn't unsubscribe");
await unsubscribe.POST(new NextRequest(`https://hub.example/u/${allowed2.token}`, { method: "POST" }), { params: Promise.resolve({ token: allowed2.token }) });
assert.ok((await tdb.marketingLead.findFirst({ where: { id: allowed2.id } }))!.optedOutAt, "POST unsubscribes");

void noConsent; void optedOut; void otherTag; void allowed;
console.log("e2e-marketing: all checks passed");
process.exit(0);
