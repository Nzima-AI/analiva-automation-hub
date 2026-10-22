import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isPracticeRole, type TenantContext } from "@aah/core";
import { rootDb, tenantDb } from "@aah/db";
import { serverEnv } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export interface Session {
  ctx: TenantContext;
  user: { id: string; name: string; email: string; role: TenantContext["role"] };
  practice: { id: string; name: string };
  db: ReturnType<typeof tenantDb>;
}

type SessionResult =
  | { status: "signed-out" }
  | { status: "no-profile"; email: string | undefined }
  | { status: "disabled" }
  | { status: "mfa-required"; hasFactor: boolean }
  | { status: "ok"; session: Session };

/** Resolve the request's Supabase user to a platform user and tenant context. */
export const loadSession = cache(async (): Promise<SessionResult> => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { status: "signed-out" };

  const profile = await rootDb().user.findUnique({
    where: { authUserId: data.user.id },
    include: { practice: { select: { id: true, name: true } } },
  });
  if (!profile) return { status: "no-profile", email: data.user.email };
  if (profile.disabledAt) return { status: "disabled" };

  if (serverEnv().requireMfa) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      return { status: "mfa-required", hasFactor: aal?.nextLevel === "aal2" };
    }
  }

  const ctx: TenantContext = {
    practiceId: profile.practiceId,
    userId: profile.id,
    role: profile.role,
    clientId: profile.clientId,
  };
  return {
    status: "ok",
    session: {
      ctx,
      user: { id: profile.id, name: profile.name, email: profile.email, role: profile.role },
      practice: profile.practice,
      db: tenantDb(ctx),
    },
  };
});

/** For pages and actions: a signed-in, two-step-verified user, or a redirect. */
export async function requireSession(): Promise<Session> {
  const result = await loadSession();
  switch (result.status) {
    case "ok":
      return result.session;
    case "mfa-required":
      redirect("/mfa");
    case "no-profile":
    case "disabled":
      redirect("/login?error=" + encodeURIComponent("This login has no access to the platform. Ask the practice to invite you."));
    case "signed-out":
      redirect("/login");
  }
}

/** Practice owners and staff only. Client logins are sent to their own workspace. */
export async function requireStaff(): Promise<Session> {
  const session = await requireSession();
  if (!isPracticeRole(session.ctx.role)) redirect("/portal");
  return session;
}

/** Client logins only (CLIENT / CLIENT_STAFF). Staff are sent to the practice dashboard. */
export async function requireClient(): Promise<Session & { clientId: string }> {
  const session = await requireSession();
  if (isPracticeRole(session.ctx.role) || !session.ctx.clientId) redirect("/");
  return { ...session, clientId: session.ctx.clientId };
}
