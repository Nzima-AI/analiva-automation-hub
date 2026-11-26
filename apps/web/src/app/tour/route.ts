import { NextResponse, type NextRequest } from "next/server";
import { signInAsDemo } from "@/lib/demo-login";
import { loadSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The link to share for a first look: opens the guided tour. Someone already signed in gets the tour
 * in their own workspace; anyone else is signed in to the Demo Practice first.
 */
export async function GET(request: NextRequest) {
  const current = await loadSession();
  if (current.status !== "ok") {
    const error = await signInAsDemo("Tour link");
    if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.nextUrl), { status: 303 });
  }
  return NextResponse.redirect(new URL("/?tour=1", request.nextUrl), { status: 303 });
}
