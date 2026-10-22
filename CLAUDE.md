# CLAUDE.md

Project memory for Claude Code. Read this fully at the start of every session. Update it when decisions change.

---

## 1. Project summary

**Name:** Analiva Automation Hub (repo `analiva-automation-hub`)

A multi-client platform for a South African accountant who also does CIPC work, branding, websites and full business start-ups. She receives thousands of emails and cannot get through them. The system must:

1. **Monitor her inbox**, find invoices, extract every field, and capture them in the CRM and in the accounting software (**Analiva**) with almost no typing.
2. **Match vague inbound emails** to the right client and category using the CRM.
3. **Send emails and documents on behalf of clients**, in the client's own branding (white label).
4. **Run each client's whole journey**: accounting, payroll, CIPC, branding, website, launch, and ongoing success tracking.
5. **Onboard clients in minutes** through templates, a client portal and an admin interface, then scale through **email automation**.
6. **Expose an API and webhooks** so Analiva and other platforms can pull data and receive events.
7. **Find any record instantly**, for example an invoice from 3 years ago while a client is on the phone.

The product should eventually be white-labellable and sellable to other accounting practices.

Full design spec lives in the shared doc "Accounting Automation System – Design Spec". If this file and the spec disagree, ask the user.

---

## 2. Domain glossary

| Term | Meaning |
| --- | --- |
| Practice | The accounting firm that owns the platform (the accountant) |
| Client | A business the practice serves; each has its own workspace, branding and data |
| Workspace | Per-client space containing enabled services, stages, documents and portal |
| Service | accounting, payroll, cipc, branding, website, launch |
| Mandate | Signed authority allowing the practice to send emails in the client's name |
| Capture | Turning an inbound invoice into a validated record in the CRM and Analiva |
| Exception | An item the AI is not confident about, sent to the human review queue |
| CIPC | Companies and Intellectual Property Commission (South Africa) |
| Analiva | The accounting software the practice uses (integration method still to be confirmed) |
| Stage | A step in a client's launch journey or workflow, with owner, due date and sign-off |

---

## 3. Tech stack (proposed defaults, change only with the user's approval)

| Area | Choice |
| --- | --- |
| Language | TypeScript everywhere (strict mode) |
| Web app and portal | Next.js (App Router) with React |
| UI | Tailwind CSS and a component library such as shadcn/ui |
| API | Next.js route handlers or a separate Node service (Fastify); REST with OpenAPI spec |
| Database | PostgreSQL with Prisma ORM; Row Level Security or strict tenant scoping |
| Background jobs | Redis with BullMQ (email polling, extraction, posting, webhooks) |
| File storage | S3-compatible object storage (encrypted) |
| Auth | Auth.js or a hosted provider; roles: owner, staff, client, client_staff |
| Email in | Microsoft Graph (Outlook) and Gmail API; IMAP only as fallback |
| Email out | Postmark, Resend or Amazon SES with per-client domain setup |
| AI extraction | Claude API for classification, matching and invoice field extraction, with OCR for scans |
| Hosting | Start simple (Vercel plus managed Postgres, or a single VPS); keep deployable with Docker |
| Testing | Vitest, Playwright for end-to-end, fixtures for sample invoices |

**Decided 2026-10-22 (ADR 0001):** the platform runs on Supabase (Postgres, Auth with TOTP two-step login, Storage), GitHub and Vercel. No Docker. Prisma 7 with the `pg` adapter, Next.js 16, Tailwind 4. Background jobs are deferred to Phase 2 (Vercel Cron + job table, or a Render worker). Tenant scoping: ADR 0002.

---

## 4. Repository layout (target)

```
/
├─ CLAUDE.md
├─ docs/                  # spec, decisions (ADRs), API docs
├─ apps/
│  ├─ web/                # admin interface and client portal
│  └─ worker/             # background jobs
├─ packages/
│  ├─ db/                 # Prisma schema, migrations, seed
│  ├─ core/               # domain logic (matching, validation, rules)
│  ├─ extraction/         # OCR and AI invoice extraction
│  ├─ connectors/         # analiva/, outlook/, gmail/, whatsapp/, email-out/
│  ├─ templates/          # white-label email and document templates
│  └─ api-client/         # generated client from OpenAPI
├─ fixtures/              # sample invoices, emails (anonymised only)
└─ scripts/
```

Keep business logic in `packages/core`. Apps and workers are thin.

---

## 5. Core modules

1. **Inbox monitor:** connects mailboxes, fetches new mail, stores raw message and attachments, queues processing.
2. **Classifier and matcher:** labels each email (invoice, CIPC, branding, client query, statement, spam, other) and matches sender to a client using email, domain, name, company name and reference numbers. Returns a confidence score.
3. **Invoice extraction:** OCR plus AI to pull supplier, VAT number, invoice number, dates, line items, VAT, totals, currency, bank details.
4. **Validation:** totals add up, VAT logic, VAT number format, duplicate detection, unusual amount checks.
5. **CRM:** clients, contacts, invoices, suppliers, documents, cases, projects, emails, mandates.
6. **Analiva connector:** post suppliers and invoices, reconcile nightly. Interface-driven so routes can be swapped (see section 8).
7. **Outbound email service:** send on behalf of clients using branded templates, only with a valid mandate.
8. **Template and white-label engine:** per-client logo, colours, fonts, footer; several designs per service category (Sage, CIPC, bureau, salaries, payroll, invoice).
9. **Client onboarding and workspaces:** templates, service switches, intake forms, invites.
10. **Launch and projects:** stages, tasks, approvals, brand asset library, website and domain tracking.
11. **Automation engine:** trigger, audience, template, delay; sequences for onboarding, chasing, deadlines, invoices, payroll, reports.
12. **Search:** fast search by name, number, invoice, date range and amount across all years.
13. **Public API and webhooks:** see section 9.
14. **Review queue:** exceptions with source document and extracted fields side by side.
15. **Audit log:** every capture, change, email and API call.

---

## 6. Data model (starting point)

Entities: `Practice`, `User`, `Client`, `Contact`, `Mandate`, `Workspace`, `Service`, `EmailMessage`, `Attachment`, `Invoice`, `InvoiceLine`, `Supplier`, `Document`, `CipcCase`, `Project`, `Stage`, `Task`, `Template`, `BrandAsset`, `Automation`, `AutomationRun`, `Integration`, `ApiKey`, `WebhookEndpoint`, `WebhookDelivery`, `AuditLog`.

Rules:

- Every tenant-owned table has `practice_id`, and client-owned tables also have `client_id`. All queries are scoped.
- Money stored as integer minor units (cents) with a `currency` field. Never floats.
- Keep the **original document** and the **extracted data** separate, with a link between them and a record of who or what extracted it.
- Soft delete where records matter legally. Invoices are retained for at least 5 years.
- Timestamps in UTC; display in `Africa/Johannesburg`.

---

## 7. Behaviour rules the AI must respect

- **Confidence gate:** at 90% or above, auto-file and action; 60 to 90%, suggest for one-click confirmation; below 60%, review queue.
- **Never post** an invoice to Analiva if validation fails, it is a suspected duplicate, or confidence is below the gate.
- **Never send** an email in a client's name without a valid, unexpired mandate.
- If a sender matches more than one client, ask, never guess.
- Every correction by the user is stored and used to improve matching and coding rules.
- Every automated action writes an audit entry with who, what, when and why.

---

## 8. Analiva integration

Public documentation for Analiva integration has not been found. **Do not assume an API exists.** Build behind an interface:

```
interface AccountingConnector {
  upsertSupplier(supplier): Promise<Result>
  postInvoice(invoice): Promise<Result>
  fetchPostedInvoices(since): Promise<Invoice[]>
  reconcile(period): Promise<ReconciliationReport>
}
```

Implementations in order of preference:

1. Official API (if Analiva provides one)
2. Import file generator (CSV or Excel in Analiva's import format)
3. Screen automation (last resort)

Start with a **mock connector** and the import-file route so the rest of the system can be built and tested.

---

## 9. Public API and webhooks

- REST, versioned (`/v1`), OpenAPI spec kept in `docs/openapi.yaml`.
- Resources: clients, contacts, invoices, suppliers, documents, cipc-cases, projects, emails, reports.
- Lists support filtering, paging and `changed_since`.
- Auth: per-integration API keys with scopes; OAuth 2.0 for third-party apps.
- Webhook events: `invoice.captured`, `invoice.approved`, `invoice.posted`, `client.created`, `client.updated`, `document.received`, `cipc.case.updated`, `payroll.run.approved`, `project.stage.completed`, `email.bounced`, `email.replied`.
- Webhooks are **signed (HMAC)**, retried with backoff, logged, and idempotent.
- A key for one client must never read another client's data. Add a test for this.

---

## 10. Security and compliance

- POPIA: record consent, minimise personal data, allow export and deletion, document where data is stored.
- Encrypt data in transit and at rest; encrypt secrets and tokens; never log full documents or tokens.
- Role-based access and an activity log visible to the practice.
- Two-step login for staff and clients.
- Secrets only in environment variables or a secrets manager, never in the repo.
- Use anonymised or fake data in `fixtures/`. Never commit real client data.

---

## 11. Coding standards

- TypeScript strict; no `any` without a comment explaining why.
- Small, pure functions in `packages/core` with unit tests.
- Validate all external input (zod or similar) at the boundary.
- Errors are explicit and logged with context; no silent catches.
- Database changes only through migrations.
- Every new endpoint gets: validation, auth and scope check, tenant scoping, test, and an OpenAPI entry.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`). Small, focused commits.
- Prefer boring, well-known libraries over clever ones.

---

## 12. Commands

```
pnpm install          # install dependencies (also generates the Prisma client)
pnpm dev              # run the web app locally
pnpm test             # unit tests (Vitest)
pnpm test:e2e         # placeholder until Phase 2
pnpm lint             # type-check every package
pnpm build            # production build of apps/web
pnpm db:migrate       # apply migrations (DIRECT_URL)
pnpm db:migrate:dev   # create a migration from schema changes (dev DB only)
pnpm db:seed          # seed fake demo data into the "demo" practice
pnpm setup:storage    # create the private documents bucket
pnpm create-owner -- --practice "Name" --slug slug --email x --name "Y"
```

---

## 13. Build phases

Work through these in order. Finish and test each phase before the next.

**Phase 0: Foundation** — done 2026-10-22
- Scaffold the repo, tooling, CI, environment config.
- Database schema for practice, users, clients, contacts, invoices, suppliers, documents, audit log.
- Auth and roles; tenant scoping with tests.

**Phase 1: CRM and instant lookup** — done 2026-10-22
- Client and invoice records, document upload, search across all years.
- Phone-call lookup screen: search by name, number, invoice, amount, date.

**Phase 2: Inbox to invoice capture** — built 2026-10-22, rule-based (no paid AI), see ADR 0003
- Connect a test mailbox, store messages and attachments.
- Classification, client matching, confidence scoring.
- Invoice extraction, validation, duplicate detection, review queue.
- Mock Analiva connector, then import-file connector.

**Phase 3: Outbound and white label** — send-as-practice/client with mandates built 2026-10-23 (per-client SMTP domains still to do)
- Mandates, branded template engine, category templates with multiple designs.
- Send on behalf of clients with per-client sender setup.

**Phase 4: Onboarding platform and automation** — client portal and enquiries built 2026-10-23; automation builder still to do
- Client workspace templates, service switches, intake forms, portal.
- Admin interface and visual automation builder; core email sequences.

**Phase 5: API and webhooks**
- Public API, keys, scopes, OpenAPI docs, signed webhooks, delivery log, developer portal.

**Phase 6: Launch journey and premium** — books, statements, VAT201, deadline calendar built early (2026-10-23)
- Launch stages, projects, brand asset library, deadline calendar, monthly snapshot, client success dashboard.
- WhatsApp capture, bank matching, concierge assistant, packages and feature switches.

---

## 14. How Claude should work in this repo

1. Before large changes, **write a short plan** and wait for approval.
2. Work in **small steps** and run tests and lint after each.
3. Ask before adding a new dependency or changing the stack.
4. Do not invent facts about Analiva or any external system; mark unknowns in code with `TODO(confirm)` and list them for the user.
5. Keep this file and `docs/` updated when a decision is made. Record big decisions as short ADRs in `docs/decisions/`.
6. Never touch real client data. Use fixtures.
7. When finishing a task, summarise what changed, what was tested, and what is next.

### Definition of done

- Code compiles, lints and passes tests.
- Tenant scoping and permissions tested for new data access.
- Audit log entries added for new actions.
- Docs and OpenAPI updated.
- No secrets or real data committed.

---

## 15. Open questions (confirm with the user)

- [ ] Does Analiva offer an API or a standard import format? Who at the vendor can confirm?
- [ ] Which email platform does the accountant use (Outlook or Gmail)?
- [ ] Which email sending service for outbound mail?
- [ ] Do clients already sign a mandate for emails in their name?
- [ ] What does "bureau" mean here (credit bureau, payroll bureau, or both)?
- [ ] Roughly how many clients and emails per day?
- [ ] Which permits and licences do her start-up clients typically need?
- [x] Hosting preference: Supabase + Vercel + GitHub on the Nzima Solutions accounts (2026-10-22)
- [ ] Is this for her practice only at first, or white-labelled to other firms from day one?
- [ ] What names does she use for "workspace" and "stage" today?

---

## 16. Next task for Claude

Live checks before every deploy (from apps/web): `scripts/e2e-books.ts` and `scripts/e2e-pages.ts` (demo practice only). Open items: Phase 5 public API and webhooks; automation sequences (Phase 4); per-client sending domains; scanned-PDF OCR; Analiva confirming the ledger CSV import.
