/**
 * One-off setup for "Explore the demo" on the sign-in page (safe to run again).
 * Creates the shared demo login, a STAFF user in the Demo Practice (slug "demo"), and loads the
 * WhatsApp demo data. Set DEMO_LOGIN_EMAIL to the same address on Vercel to show the button.
 *
 *   npx tsx --env-file=../../.env --conditions=react-server --tsconfig tsconfig.json scripts/setup-demo-login.ts demo-visitor@example.com
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { rootDb } from "@aah/db";
import { resetDemoPractice } from "../src/lib/marketing/automation";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^@\s]+@example\.com$/.test(email)) throw new Error("Pass the demo login email (an @example.com address).");
const db = rootDb();
const practice = await db.practice.findUnique({ where: { slug: "demo" }, select: { id: true } });
if (!practice) throw new Error("No Demo Practice (slug demo). Run pnpm db:seed first.");
if (await db.mailAccount.count({ where: { practiceId: practice.id } })) throw new Error("The Demo Practice has a mail account: remove it before opening a public demo.");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let user = await db.user.findFirst({ where: { practiceId: practice.id, email } });
if (!user) {
  // A random password nobody keeps: the demo signs in through a one-time link made on the server.
  const { data, error } = await admin.auth.admin.createUser({ email, password: randomBytes(24).toString("base64url"), email_confirm: true });
  if (error || !data.user) throw new Error(`Auth user: ${error?.message}`);
  user = await db.user.create({ data: { practiceId: practice.id, authUserId: data.user.id, email, name: "Demo visitor", role: "STAFF" } });
  console.log("demo login created", user.id);
} else {
  if (user.role !== "STAFF") throw new Error("The demo login must be a STAFF user.");
  console.log("demo login exists", user.id);
}
console.log("demo data", JSON.stringify(await resetDemoPractice()));
process.exit(0);
