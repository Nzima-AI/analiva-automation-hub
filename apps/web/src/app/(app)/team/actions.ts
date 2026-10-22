"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isPracticeRole } from "@aah/core";
import { audit } from "@aah/db";
import { appUrl } from "@/lib/app-url";
import { requireSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type InviteState = { status: "idle" } | { status: "error"; message: string } | { status: "ok"; email: string; link: string };

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(200),
  role: z.enum(["STAFF", "CLIENT", "CLIENT_STAFF"]),
  clientId: z.string().optional(),
});

/**
 * Create a login and return a one-time invite link for the owner to send.
 * We don't email it ourselves: outbound mail arrives in Phase 3.
 */
export async function inviteUser(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const session = await requireSession();
  if (session.ctx.role !== "OWNER") return { status: "error", message: "Only the practice owner can invite people." };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;

  let clientId: string | null = null;
  if (!isPracticeRole(input.role)) {
    if (!input.clientId) return { status: "error", message: "Choose which client this login belongs to." };
    const client = await session.db.client.findFirst({ where: { id: input.clientId, deletedAt: null }, select: { id: true } });
    if (!client) return { status: "error", message: "Client not found." };
    clientId = client.id;
  }

  const existing = await session.db.user.findFirst({ where: { email: input.email } });
  if (existing) return { status: "error", message: "That email already has a login." };

  const { data, error } = await supabaseAdmin().auth.admin.generateLink({
    type: "invite",
    email: input.email,
  });
  if (error || !data.user) {
    console.error("invite failed", { reason: error?.message });
    return { status: "error", message: error?.message ?? "Could not create the invite." };
  }

  const user = await session.db.user.create({
    data: {
      practiceId: session.ctx.practiceId,
      authUserId: data.user.id,
      email: input.email,
      name: input.name,
      role: input.role,
      clientId,
    },
  });
  await audit(session.ctx, { action: "user.invited", entityType: "User", entityId: user.id, clientId, metadata: { role: input.role } }, session.user.name);
  revalidatePath("/team");
  // Our own callback verifies the hashed token server-side (Supabase's action_link would
  // return the session in a URL fragment the server cannot read).
  const link = `${await appUrl()}/auth/callback?token_hash=${data.properties.hashed_token}&type=invite&next=/account/password`;
  return { status: "ok", email: input.email, link };
}

export async function setUserDisabled(userId: string, disabled: boolean): Promise<void> {
  const session = await requireSession();
  if (session.ctx.role !== "OWNER" || userId === session.ctx.userId) return;
  await session.db.user.updateMany({ where: { id: userId }, data: { disabledAt: disabled ? new Date() : null } });
  revalidatePath("/team");
}
