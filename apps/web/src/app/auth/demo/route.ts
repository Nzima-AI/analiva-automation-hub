import { NextResponse, type NextRequest } from "next/server";
import { signInAsDemo } from "@/lib/demo-login";

/**
 * "Explore the demo" on the sign-in page: signs in as the shared demo login, a staff user in the
 * Demo Practice (sample data only; staff can't connect a mailbox or WhatsApp, so nothing real is sent).
 */
export async function POST(request: NextRequest) {
  const error = await signInAsDemo("Explore the demo");
  if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.nextUrl), { status: 303 });
  return NextResponse.redirect(new URL("/?tour=1", request.nextUrl), { status: 303 });
}
