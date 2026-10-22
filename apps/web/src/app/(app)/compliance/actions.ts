"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@aah/db";
import { requireStaff } from "@/lib/session";

/** Mark a calculated deadline as filed (or undo). */
export async function setFiled(clientId: string, periodKey: string, filed: boolean) {
  const s = await requireStaff();
  const client = await s.db.client.findFirst({ where: { id: clientId }, select: { id: true } });
  if (!client || !/^[A-Z0-9_]+:[\w-]+$/.test(periodKey)) return;
  if (filed) {
    await s.db.complianceFiling.upsert({
      where: { clientId_periodKey: { clientId, periodKey } },
      create: { practiceId: s.ctx.practiceId, clientId, periodKey, completedByUserId: s.ctx.userId },
      update: {},
    });
    await audit(s.ctx, { action: "compliance.filed", entityType: "Client", entityId: clientId, clientId, metadata: { periodKey } }, s.user.name);
  } else {
    await s.db.complianceFiling.deleteMany({ where: { clientId, periodKey } });
  }
  revalidatePath("/compliance");
  revalidatePath("/");
}
