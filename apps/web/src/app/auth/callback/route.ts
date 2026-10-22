import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Landing point for Supabase email links: password resets and invites. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const nextParam = url.searchParams.get("next") ?? "/";
  // Only allow same-site relative redirects.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  const supabase = await supabaseServer();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let error: string | null = null;
  if (code) {
    const res = await supabase.auth.exchangeCodeForSession(code);
    error = res.error?.message ?? null;
  } else if (tokenHash && type) {
    const res = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    error = res.error?.message ?? null;
  } else {
    error = "missing code";
  }

  if (error) {
    console.warn("auth callback failed", { reason: error });
    return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("That link has expired. Request a new one."), url));
  }
  return NextResponse.redirect(new URL(next, url));
}
