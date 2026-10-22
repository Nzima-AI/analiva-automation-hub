import { applyTenantScope, type AuditEntryInput, type TenantContext } from "@aah/core";
import { rootDb } from "./client";

/**
 * A Prisma client confined to one tenant. Every model operation is rewritten by
 * applyTenantScope (packages/core/src/tenancy.ts), so a query can only touch rows
 * of ctx.practiceId and, for client roles, ctx.clientId.
 *
 * Nested writes (create: { invoices: { create: ... } }) are not rewritten: write
 * child rows with their own top-level call so they are stamped too.
 */
export function tenantDb(ctx: TenantContext) {
  return rootDb().$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          // args is a per-model union; the scope function works on the plain object shape.
          const scoped = applyTenantScope(model, operation, args as Record<string, unknown>, ctx);
          return query(scoped as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;

/** Write an audit entry for an action taken by the context's user. */
export async function audit(ctx: TenantContext, entry: AuditEntryInput, actorLabel?: string): Promise<void> {
  await tenantDb(ctx).auditLog.create({
    data: {
      practiceId: ctx.practiceId,
      clientId: entry.clientId ?? null,
      actorType: "USER",
      actorId: ctx.userId,
      actorLabel: actorLabel ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? undefined,
    },
  });
}
