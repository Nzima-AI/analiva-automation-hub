# 0004: Marketing campaigns by email and WhatsApp

Date: 2026-11-24 · Status: accepted

## Context

The practice wants to invite about 3,000 past clients to Analiva. Most are WhatsApp contacts. She won't pay a monthly fee for a marketing tool. Bulk sending from her own WhatsApp number breaks WhatsApp's terms and gets numbers banned.

## Decision

- **WhatsApp goes through Meta's Cloud API directly** (`apps/web/src/lib/whatsapp.ts`, plain `fetch`, no new dependency). There's no reseller, so no monthly fee; Meta bills per delivered template message. Outside a 24-hour reply window, only Meta-approved templates can be sent. Free-form replies within 24 hours are free.
- **Email goes through the practice's own mailbox** (Settings → Email accounts), paced to `MARKETING_EMAILS_PER_RUN` (default 8) per minute, because cPanel mailboxes block more than a few hundred messages an hour.
- **Consent is per channel** (`consentAt`/`optedOutAt` for email, `whatsappConsentAt`/`whatsappOptedOutAt` for WhatsApp) and is checked when a campaign is queued and again just before each message. On import, "these are existing or past clients" records POPIA section 69(3) as the basis, with the date, the user and the file name as evidence. Every email has an unsubscribe link and `List-Unsubscribe` headers, and STOP, UNSUBSCRIBE or OPT OUT on WhatsApp opts the contact out and sends a confirmation. START opts them back in.
- **Sending is a queue.** Sending a campaign writes one `MarketingSend` row per recipient. The minute cron sends the next batch of each running campaign. Rate limits (429) and Meta outages leave the rest queued; hard failures are recorded per recipient.
- **Tracking:** each recipient gets a personal link `/r/<token>` that records the click and redirects to the campaign's link with `?ref=<contact token>`. Meta delivery receipts (sent, delivered, read, failed) and replies arrive at `/api/webhooks/whatsapp`, signed with the app secret (`X-Hub-Signature-256`) and checked. Receipts never move a status backwards.
- **Sign-up attribution:** `POST /api/marketing/conversions` with `Authorization: Bearer MARKETING_CONVERSION_SECRET` and either `{ "ref": "<value of ?ref>" }` or `{ "practice": "<slug>", "email": "...", "phone": "..." }`. It marks the contact Won. Analiva doesn't call it yet (TODO(confirm) with the Analiva team). Until then staff use "Mark as signed up".
- **Follow-ups** are new drafts aimed at an earlier campaign's recipients who didn't click, clicked but didn't sign up, or signed up.
- Campaigns still need the practice owner's approval before they can be sent.

## Setup

1. Apply the migration `20261124120000_marketing_campaigns` (`pnpm db:migrate`).
2. Set `MARKETING_CONVERSION_SECRET` in Vercel (only needed once Analiva calls back).
3. Schedule the sender in Supabase, using the same secret in Vault as the inbox poll:

```sql
select cron.schedule('aah-marketing-send', '* * * * *', $$
  select net.http_post(
    url := 'https://analiva-automation-hub.vercel.app/api/cron/marketing-send',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aah_cron_secret')),
    timeout_milliseconds := 5000
  );
$$);
```

4. In the Hub, under Marketing → WhatsApp, the owner pastes the phone number ID, the WhatsApp Business Account ID, a permanent system-user token and the app secret. Then they copy the callback URL and the verify token into the Meta app's webhook settings and subscribe to `messages`.

## Testing

`apps/web/scripts/e2e-marketing.ts` runs the whole flow against a local Postgres with Meta faked. It covers audience rules (consent, opt-out, segments, other practices), batching, failures, signed and unsigned webhooks, out-of-order receipts, duplicate deliveries, STOP and START, clicks, the conversion callback, follow-up audiences and unsubscribe. It refuses to run against anything but localhost.
