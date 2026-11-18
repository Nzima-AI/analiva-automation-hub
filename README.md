# Analiva Automation Hub

Practice platform for a South African accounting firm: client CRM, invoice capture, original-document vault, instant phone-call lookup, and (in later phases) inbox capture, white-label outbound email, client journeys, API and webhooks.

Documentation:
- [User guide](docs/USER_GUIDE.md): how the practice and clients use the hub (also in the app under **Help**).
- [Design language](docs/DESIGN.md): the "Ledger" visual system, tokens, motion rules.
- [Decisions](docs/decisions): architecture decision records.
- [CLAUDE.md](CLAUDE.md): product brief and build phases.

## Stack

Next.js 16 on Vercel · Supabase (Postgres, Auth with two-step login, Storage) · Prisma 7 · Tailwind 4 · pnpm workspaces.

```
apps/web          admin interface and client portal
packages/core     pure domain logic: tenancy, money, VAT, validation, lookup parsing (unit tested)
packages/db       Prisma schema, migrations, tenant-scoped client, seed and setup scripts
docs/decisions    ADRs
```

## Getting started

```bash
pnpm install
cp .env.example .env            # fill in Supabase values
pnpm db:migrate                 # apply migrations (uses DIRECT_URL)
pnpm setup:storage              # create the private documents bucket
pnpm create-owner -- --practice "Practice Name" --slug practice --email you@example.com --name "Your Name"
pnpm dev
```

Optional demo data (fake businesses) into a separate "demo" practice: `pnpm db:seed`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the web app locally |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm lint` | Type-check every package |
| `pnpm build` | Production build of the web app |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:migrate:dev` | Create a new migration from schema changes (dev DB only) |
| `pnpm db:seed` | Seed demo data |
| `pnpm setup:storage` | Create/lock down the documents bucket |
| `pnpm create-owner` | Bootstrap a practice and its owner login |

Live checks (from `apps/web`, against the demo practice; prefix each with `npx tsx --env-file=../../.env --conditions=react-server --tsconfig tsconfig.json`):

| Script | What it checks |
| --- | --- |
| `scripts/e2e-books.ts` | Ledger posting, bank import and matching, statements, VAT, reversals, tenant isolation |
| `scripts/e2e-pages.ts` | Every page and export loads for staff and client logins; clients can't reach practice pages |
| `scripts/screenshots.ts <dir>` | Light, dark and mobile screenshots of key screens for design review |
| `scripts/export-guide.ts` | Regenerates docs/USER_GUIDE.md from the in-app guide |

## Deploying

Vercel project root directory is `apps/web`; it installs from the repo root. Required env vars are listed in `.env.example`. Migrations are applied from a developer machine or CI with `pnpm db:migrate`, never during the Vercel build.

## Live

- App: https://analiva-automation-hub.vercel.app (Vercel team `ndumiso1`, project `analiva-automation-hub`, root `apps/web`)
- Database/Auth/Storage: Supabase project `lwelafxhrxrchyoljswc` (eu-west-1)
- Deploy from a git-less copy (`vercel deploy --prod`), see ADR 0001. A "demo" practice holds fake seed data for testing.
