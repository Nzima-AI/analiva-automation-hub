# Analiva Automation Hub

Practice platform for a South African accounting firm: client CRM, invoice capture, original-document vault, instant phone-call lookup, and (in later phases) inbox capture, white-label outbound email, client journeys, API and webhooks.

See [CLAUDE.md](CLAUDE.md) for the product brief and build phases, and [docs/decisions](docs/decisions) for the decisions made so far.

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

## Deploying

Vercel project root directory is `apps/web`; it installs from the repo root. Required env vars are listed in `.env.example`. Migrations are applied from a developer machine or CI with `pnpm db:migrate`, never during the Vercel build.
