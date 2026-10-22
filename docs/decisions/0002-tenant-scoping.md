# 0002 — Tenant scoping

Date: 2026-10-22 · Status: accepted

## Decision

Two layers:

1. **Application layer (primary).** All data access in the app goes through `tenantDb(ctx)` (`packages/db/src/tenant.ts`), a Prisma client extension that passes every operation through `applyTenantScope` (`packages/core/src/tenancy.ts`):
   - reads, updates and deletes get `AND: [{ practiceId }]`, plus `clientId` for client roles (or `id` on the `Client` table);
   - creates have `practiceId` (and `clientId` for client roles) stamped and refuse conflicting values;
   - updates may not change `practiceId`, and client roles may not change `clientId`;
   - client roles cannot read the audit log; nobody can update or delete it;
   - any model not registered in `MODEL_OWNERSHIP`, and any raw operation, is refused.
   `rootDb()` (unscoped) is only used to resolve the signed-in user, and in scripts and seed.

2. **Database layer (backstop).** RLS is enabled on every table with no policies, and grants to `anon`/`authenticated` are revoked, so Supabase's public API exposes nothing. A trigger makes `AuditLog` append-only.

## Known limits

- Nested writes (`create: { child: { create } }`) are not rewritten. Write child rows with their own top-level call.
- Foreign keys are not composite, so code must look up a referenced row through `tenantDb` before linking to it (done in every action today).
- When the public API arrives (Phase 5), API keys resolve to the same `TenantContext`, so the same scoping applies; add an HTTP-level test that a key for client A cannot read client B.

## Tests

`packages/core/src/tenancy.test.ts` covers cross-client reads, OR-escapes, stamping, moving rows across tenants, audit immutability and unregistered models.
