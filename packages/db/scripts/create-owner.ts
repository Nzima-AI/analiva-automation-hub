/**
 * Bootstrap a practice and its owner login.
 *
 * Usage:
 *   pnpm create-owner -- --practice "Practice Name" --slug practice-slug --email owner@example.com --name "Owner Name"
 *
 * Prints a one-time link the owner opens to choose a password. Idempotent on --slug and --email.
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });

const { values } = parseArgs({
  options: {
    practice: { type: "string" },
    slug: { type: "string" },
    email: { type: "string" },
    name: { type: "string" },
    "app-url": { type: "string" },
  },
});
const { practice, slug, email, name } = values;
if (!practice || !slug || !email || !name) {
  console.error('Required: --practice "Name" --slug slug --email you@example.com --name "Your Name"');
  process.exit(1);
}

const { rootDb } = await import("../src/index");
const db = rootDb();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const appUrl = (values["app-url"] ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

const p = await db.practice.upsert({ where: { slug }, create: { name: practice, slug }, update: {} });
console.log(`Practice: ${p.name} (${p.id})`);

const existing = await db.user.findUnique({ where: { practiceId_email: { practiceId: p.id, email: email.toLowerCase() } } });
if (existing) {
  console.log(`Owner already exists: ${existing.email}. Use "Forgot password" on the login page to reset.`);
  process.exit(0);
}

const { data, error } = await supabase.auth.admin.generateLink({
  type: "invite",
  email: email.toLowerCase(),
  options: { redirectTo: `${appUrl}/auth/callback?next=/account/password` },
});
if (error || !data.user) throw error ?? new Error("invite failed");

const owner = await db.user.create({
  data: { practiceId: p.id, authUserId: data.user.id, email: email.toLowerCase(), name, role: "OWNER" },
});
await db.auditLog.create({
  data: { practiceId: p.id, actorType: "SYSTEM", actorLabel: "create-owner script", action: "user.invited", entityType: "User", entityId: owner.id, metadata: { role: "OWNER" } },
});

console.log(`Owner created: ${owner.email}`);
console.log(`One-time link (open it to set a password, valid 24h):\n${data.properties.action_link}`);
await db.$disconnect();
