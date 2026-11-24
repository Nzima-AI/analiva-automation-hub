"use server";

import { revalidatePath } from "next/cache";
import { fail } from "@/lib/forms";
import { UPGRADE_TIER } from "@/lib/plan";
import { requireStaff } from "@/lib/session";

const path = "/plans";

export async function requestUpgrade() {
  const { ctx, db, practice, user } = await requireStaff();
  if (ctx.role !== "OWNER") fail(path, "Only a workspace owner can record an upgrade request.");

  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Practice" WHERE id = ${practice.id} FOR UPDATE`;
    const existing = await tx.auditLog.findFirst({
      where: { action: "workspace.upgrade_requested", entityType: "Practice", entityId: practice.id },
      select: { id: true },
    });
    if (existing) return;

    await tx.auditLog.create({
      data: {
        practiceId: practice.id,
        actorId: user.id,
        actorLabel: user.name,
        actorType: "USER",
        action: "workspace.upgrade_requested",
        entityType: "Practice",
        entityId: practice.id,
        metadata: { requestedTier: UPGRADE_TIER },
      },
    });
  });
  revalidatePath(path);
}
