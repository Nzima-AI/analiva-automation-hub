import "server-only";
import { audit, rootDb } from "@aah/db";
import { serverEnv } from "@/lib/env";
import { isDemoVisitor } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Signs in as the shared demo login (a staff user in the Demo Practice) through a one-time link
 * made and used on the server, so no email goes out. Returns an error message, or null when signed in.
 */
export async function signInAsDemo(reason: string): Promise<string | null> {
  const email = serverEnv().demoLoginEmail;
  if (!email) return "The demo isn't available right now.";
  const profile = await rootDb().user.findFirst({ where: { email, disabledAt: null }, include: { practice: { select: { slug: true } } } });
  if (!profile || !isDemoVisitor(profile.email, profile.practice.slug, profile.role)) return "The demo isn't available right now.";
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    console.error("demo sign-in link failed", error?.message);
    return "The demo couldn't start. Please try again.";
  }
  const { error: verifyError } = await (await supabaseServer()).auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (verifyError) {
    console.error("demo sign-in failed", verifyError.message);
    return "The demo couldn't start. Please try again.";
  }
  await audit({ practiceId: profile.practiceId, userId: profile.id, role: profile.role, clientId: null }, { action: "auth.signed_in", entityType: "User", entityId: profile.id, reason }, profile.name);
  return null;
}
