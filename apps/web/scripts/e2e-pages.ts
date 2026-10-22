// Live smoke test: signs in as the DEMO practice owner (password + TOTP, both reset for
// the run) and loads every page, failing on any non-200 or server-error page.
// Usage (from apps/web):
//   npx tsx --env-file=../../.env --conditions=react-server --tsconfig tsconfig.json scripts/e2e-pages.ts [baseUrl]
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const { rootDb } = await import("@aah/db");
const BASE = process.argv[2] ?? "https://analiva-automation-hub.vercel.app";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ref = new URL(URL_).hostname.split(".")[0];
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const db = rootDb();

function totp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "")) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

async function sessionCookie(email: string): Promise<string> {
  const user = await db.user.findFirstOrThrow({ where: { email } });
  const password = crypto.randomBytes(18).toString("base64url");
  await admin.auth.admin.updateUserById(user.authUserId, { password });
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.authUserId });
  for (const f of factors?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: user.authUserId, id: f.id });
  const sb = createClient(URL_, ANON, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email, password });
  const { data: enrolled } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "smoke" });
  await sb.auth.mfa.challengeAndVerify({ factorId: enrolled!.id, code: totp(enrolled!.totp.secret) });
  const { data } = await sb.auth.getSession();
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const name = `sb-${ref}-auth-token`;
  return value.length <= 3180 ? `${name}=${value}` : value.match(/.{1,3180}/g)!.map((p, i) => `${name}.${i}=${p}`).join("; ");
}

const practice = await db.practice.findUniqueOrThrow({ where: { slug: "demo" } });
const client = await db.client.findFirstOrThrow({ where: { practiceId: practice.id }, orderBy: { code: "asc" } });
const invoice = await db.invoice.findFirst({ where: { practiceId: practice.id } });
const capture = await db.capture.findFirst({ where: { practiceId: practice.id } });
const mail = await db.mailAccount.findFirst({ where: { practiceId: practice.id } });

const routes = [
  "/", "/review", "/review?show=recent", "/inbox", "/compliance", "/clients", "/clients/new", `/clients/${client.id}`, `/clients/${client.id}/edit`,
  "/lookup", "/lookup?q=Mokoena", "/invoices", "/invoices/new", "/documents", "/books", `/books/${client.id}`, `/books/${client.id}/bank`,
  `/books/${client.id}/journals`, `/books/${client.id}/accounts`,
  ...["is", "bs", "cf", "tb", "gl", "vat", "aged"].map((r) => `/books/${client.id}/reports?r=${r}`),
  `/books/${client.id}/reports?r=gl&account=7000`,
  "/audit", "/team", "/settings", "/settings/email", "/settings/email/new",
  "/enquiries", "/enquiries?view=RESOLVED", `/clients/${client.id}/email`,
  ...(invoice ? [`/invoices/${invoice.id}/send`] : []),
  ...(invoice ? [`/invoices/${invoice.id}`] : []),
  ...(capture ? [`/review/${capture.id}`] : []),
  ...(mail ? [`/settings/email/${mail.id}`] : []),
  ...(process.env.EXTRA_ROUTES ?? "").split(",").filter(Boolean).map((r) => r.replace("{client}", client.id).replace("{invoice}", invoice?.id ?? "")),
];

const cookie = await sessionCookie("demo-owner@example.com");
let failures = 0;
for (const path of routes) {
  const res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const broken = res.status !== 200 || /This page couldn.t load|Application error|digest/i.test(body);
  console.log(`${broken ? "FAIL" : "ok  "}  ${res.status}  ${path}${res.status >= 300 && res.status < 400 ? ` -> ${res.headers.get("location")}` : ""}`);
  if (broken) failures++;
}
for (const exp of [`/books/${client.id}/export?format=xlsx&p=fy`, `/books/${client.id}/export?format=analiva&p=fy`, "/invoices/export"]) {
  const res = await fetch(BASE + exp, { headers: { cookie }, redirect: "manual" });
  const ok = res.status === 200 && /spreadsheet|csv/.test(res.headers.get("content-type") ?? "");
  console.log(`${ok ? "ok  " : "FAIL"}  ${res.status}  ${exp}  ${res.headers.get("content-type")}`);
  if (!ok) failures++;
}
// Client portal, as the demo client login.
const clientCookie = await sessionCookie("demo-client@example.com");
for (const path of ["/portal", "/portal/reports", "/portal/reports?r=bs", "/portal/reports?r=cf", "/portal/invoices", "/portal/invoices?d=sales", "/portal/documents", "/portal/deadlines", "/portal/enquiries", "/portal/enquiries/new"]) {
  const res = await fetch(BASE + path, { headers: { cookie: clientCookie }, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const broken = res.status !== 200 || /This page couldn.t load|Application error|digest/i.test(body);
  console.log(`${broken ? "FAIL" : "ok  "}  ${res.status}  [client] ${path}`);
  if (broken) failures++;
}
// Client logins must be kept out of practice pages.
for (const path of ["/", "/clients", "/books", "/enquiries", "/settings"]) {
  const res = await fetch(BASE + path, { headers: { cookie: clientCookie }, redirect: "manual" });
  // Redirects inside streamed pages come back as 200 + a redirect instruction for the browser;
  // what matters is that no practice data is in the response.
  const body = res.status === 200 ? await res.text() : "";
  const redirected = (res.status === 307 && (res.headers.get("location") ?? "").endsWith("/portal")) || /NEXT_REDIRECT[^"]*\/portal|http-equiv="refresh"[^>]*\/portal/.test(body);
  const leaked = /Mokoena|Ubuntu Bakery|Naidoo|Karoo Craft|Ndlovu Consulting/.test(body.replace(/Mokoena Plumbing/g, ""));
  if (process.env.DEBUG_BLOCK) console.log(body.slice(0, 1500));
  const ok = redirected && !leaked;
  console.log(`${ok ? "ok  " : "FAIL"}  ${res.status}  [client blocked] ${path} redirected=${redirected} leaked=${leaked}`);
  if (!ok) failures++;
}
console.log(failures ? `${failures} FAILED` : "ALL PAGES OK");
await db.$disconnect();
process.exit(failures ? 1 : 0);
