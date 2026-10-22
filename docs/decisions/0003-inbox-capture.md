# 0003 — Inbox capture without paid AI

Date: 2026-10-22 · Status: accepted

## Context

Phase 2 needs inbound invoices read automatically. The practice can't pay for an AI API now, and free AI tiers (e.g. Gemini) may use submitted data for training, which is not acceptable for client invoices under POPIA. The Vercel Hobby plan only allows daily cron jobs.

## Decision

- **Scheduling:** Supabase `pg_cron` + `pg_net` POST to `/api/cron/poll-inbox` every 5 minutes with `Authorization: Bearer CRON_SECRET`. The route answers at once and polls in `after()` (max 300 s). Staff also have a "Check inbox now" button.
- **Fetching:** IMAP via imapflow, per mailbox `uidValidity` + `lastUid`; first sync looks back 3 days; messages are read with BODY.PEEK so they stay unread. Raw `.eml` and each attachment are stored as originals (Supabase Storage); max 15 messages per mailbox per run.
- **Reading (no AI):** `@aah/extraction` gets text from the PDF text layer (unpdf) or OCR for images (tesseract.js, max 2 per email). Scanned PDFs are queued for manual capture. `@aah/core` parses with labelled-field rules and SA patterns, scoring each field.
- **Learning:** when staff file or correct a capture, the labels printed next to the right values are stored per supplier (`SupplierProfile`, keyed by VAT number or sender domain) and every correction is logged (`CaptureCorrection`). Sender address → client assignments are stored as `SenderRule` (exact address only; a supplier's domain serves many clients).
- **Matching:** sender rules, client contact emails, client email domains (not free mail), client VAT/registration number or name in the document. More than one plausible client → ask.
- **Gate:** ≥ 90% with a matched client, all amounts, number and date found, and no validation issues → filed automatically. Otherwise queued: `NEEDS_CLIENT`, `SUGGESTED` (60–90%, one-click confirm) or `NEEDS_REVIEW`.
- **Analiva:** `@aah/connectors` defines `AccountingConnector`, a mock implementation, and a CSV import file (`/invoices/export`). TODO(confirm) the real Analiva import layout.

## Consequences

- The first invoice from each supplier needs a one-click confirmation; later ones from the same supplier are usually auto-filed.
- OCR is slow and weaker on phone photos; those mostly land in review.
- Swapping in an AI reader later means replacing `parseInvoiceText` behind the same capture flow.
