import { NextResponse, type NextRequest } from "next/server";
import { audit, rootDb } from "@aah/db";
import { serverEnv } from "@/lib/env";
import { isDemoVisitor } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * "Explore the demo" on the sign-in page: signs in as the shared demo login, a staff user in the
 * Demo Practice (sample data only; staff can't connect a mailbox or WhatsApp, so nothing real is sent).
 * A one-time sign-in link is made and used on the server, so no email goes out.
 */
export async function POST(request: NextRequest) {
  const back = (error: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.nextUrl), { status: 303 });
  const email = serverEnv().demoLoginEmail;
  if (!email) return back("The demo isn't available right now.");

  const profile = await rootDb().user.findFirst({ where: { email, disabledAt: null }, include: { practice: { select: { slug: true } } } });
  if (!profile || !isDemoVisitor(profile.email, profile.practice.slug, profile.role)) return back("The demo isn't available right now.");

  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    console.error("demo sign-in link failed", error?.message);
    return back("The demo couldn't start. Please try again.");
  }
  const supabase = await supabaseServer();
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (verifyError) {
    console.error("demo sign-in failed", verifyError.message);
    return back("The demo couldn't start. Please try again.");
  }
  await audit({ practiceId: profile.practiceId, userId: profile.id, role: profile.role, clientId: null }, { action: "auth.signed_in", entityType: "User", entityId: profile.id, reason: "Explore the demo" }, profile.name);
  return NextResponse.redirect(new URL("/marketing", request.nextUrl), { status: 303 });
}
