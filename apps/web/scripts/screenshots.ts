// Screenshots of key screens (demo practice) in light and dark, for design review.
// Usage (from apps/web):
//   npx tsx --env-file=../../.env --conditions=react-server --tsconfig tsconfig.json scripts/screenshots.ts <outDir> [baseUrl]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { rootDb } = await import("@aah/db");
const OUT = process.argv[2] ?? "screenshots";
const BASE = process.argv[3] ?? "https://analiva-automation-hub.vercel.app";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ref = new URL(URL_).hostname.split(".")[0]!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const db = rootDb();
fs.mkdirSync(OUT, { recursive: true });

function totp(secret: string): string {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "")) bits += a.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

async function cookiesFor(email: string) {
  const user = await db.user.findFirstOrThrow({ where: { email } });
  const password = crypto.randomBytes(18).toString("base64url");
  await admin.auth.admin.updateUserById(user.authUserId, { password });
  const { data: f } = await admin.auth.admin.mfa.listFactors({ userId: user.authUserId });
  for (const x of f?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: user.authUserId, id: x.id });
  const sb = createClient(URL_, ANON, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email, password });
  const { data: en } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "shots" });
  await sb.auth.mfa.challengeAndVerify({ factorId: en!.id, code: totp(en!.totp.secret) });
  const { data } = await sb.auth.getSession();
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const name = `sb-${ref}-auth-token`;
  const url = new URL(BASE);
  const chunks = value.length <= 3180 ? [[name, value]] : value.match(/.{1,3180}/g)!.map((p, i) => [`${name}.${i}`, p]);
  return chunks.map(([n, v]) => ({ name: n!, value: v!, domain: url.hostname, path: "/", httpOnly: false, secure: url.protocol === "https:", sameSite: "Lax" as const }));
}

const practice = await db.practice.findUniqueOrThrow({ where: { slug: "demo" } });
const client = await db.client.findFirstOrThrow({ where: { practiceId: practice.id }, orderBy: { code: "asc" } });
const invoice = await db.invoice.findFirst({ where: { practiceId: practice.id } });

const staffShots: Array<[string, string]> = [
  ["dashboard", "/"],
  ["records-clients", "/lookup"],
  ["records-invoices", "/lookup?tab=invoices"],
  ["client", `/clients/${client.id}`],
  ["books", `/books/${client.id}`],
  ["bank", `/books/${client.id}/bank`],
  ["report-is", `/books/${client.id}/reports?r=is`],
  ["review", "/review"],
  ["compliance", "/compliance"],
  ...(invoice ? ([["invoice", `/invoices/${invoice.id}`]] as Array<[string, string]>) : []),
];
const clientShots: Array<[string, string]> = [
  ["portal", "/portal"],
  ["portal-enquiries", "/portal/enquiries"],
];

const browser = await chromium.launch();
for (const scheme of ["light", "dark"] as const) {
  for (const [who, shots] of [
    ["demo-owner@example.com", staffShots],
    ["demo-client@example.com", clientShots],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
    await ctx.addCookies(await cookiesFor(who));
    const page = await ctx.newPage();
    for (const [name, route] of shots) {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(OUT, `${name}-${scheme}.png`), fullPage: false });
      console.log("shot", name, scheme);
    }
    await ctx.close();
  }
  if (scheme === "light") {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(BASE + "/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "login-light.png") });
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, deviceScaleFactor: 2 });
    await mobile.addCookies(await cookiesFor("demo-owner@example.com"));
    const m = await mobile.newPage();
    await m.goto(BASE + "/", { waitUntil: "networkidle" });
    await m.waitForTimeout(1800);
    await m.screenshot({ path: path.join(OUT, "dashboard-mobile.png") });
    await ctx.close();
    await mobile.close();
  }
}
await browser.close();
await db.$disconnect();
console.log("done");
