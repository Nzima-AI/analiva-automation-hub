# 0001 — Stack: Supabase + Vercel + GitHub

Date: 2026-10-22 · Status: accepted

## Context

CLAUDE.md §3 proposes Postgres + Prisma, Auth.js, S3, Redis/BullMQ and Vercel or a VPS. The owner asked for the platform to run on the Nzima Solutions accounts: **Supabase, GitHub and Vercel**, with no Docker host.

## Decision

| Area | Choice |
| --- | --- |
| Database | Supabase Postgres (eu-west-1, Ireland; project ref lwelafxhrxrchyoljswc), Prisma 7 with the `pg` driver adapter (no Rust engine binary on Vercel) |
| Auth | Supabase Auth: email + password, TOTP two-step login enforced for every role (`REQUIRE_MFA`) |
| Roles | Our own `User` table (OWNER, STAFF, CLIENT, CLIENT_STAFF) linked by `authUserId` |
| File storage | Supabase Storage, private `documents` bucket; browser uploads via one-time signed URLs, downloads via 60-second signed URLs |
| Web | Next.js 16 App Router on Vercel, Tailwind 4, hand-rolled UI primitives (no shadcn CLI) |
| Background jobs | Deferred to Phase 2. Vercel cannot host a long-running BullMQ worker; options are Vercel Cron + a Postgres job table, or a small worker on Render as VoiceHub does. Decide when inbox polling starts. |
| CI | GitHub Actions: type-check, unit tests, build |

## Consequences

- Supabase exposes every table over its REST API. All tables have RLS on with no policies so the anon/authenticated keys can read nothing; the app connects as the table owner. See 0002.
- Data is stored in Ireland (no South African Supabase region). Record this in the POPIA register as a cross-border transfer to a country with adequate protection (GDPR).
- Vercel request bodies are capped at 4.5 MB, which is why uploads go browser → Storage directly.
