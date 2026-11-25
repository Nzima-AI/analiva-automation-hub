# 0005: WhatsApp growth suite

Date: 2026-11-25 · Status: accepted · Builds on ADR 0004

## Context

WhatsApp marketing becomes the centre of the Hub. The practice wants to see campaigns work live, know when clients respond, and run follow-ups without extra work, while keeping Meta's per-message cost under control and the number's quality rating safe.

## Decision

- **Navigation:** "WhatsApp marketing" is the second item in the sidebar with a replies badge, and the dashboard opens with a WhatsApp strip. Marketing has seven tabs: Overview (mission control), Campaigns, Inbox, Contacts, Automations, Analytics, Settings, plus a full-screen Live wall and a printable Report.
- **Sending engine** (`lib/marketing/engine.ts`): each message gets its own `sendAfter` time:
  - quiet hours, Sundays and SA public holidays (with Easter dates and Sunday-to-Monday moves) are skipped (`nextSendTime` in `packages/core/src/marketing-analytics.ts`);
  - optional best time per person (`bestHour`, learned from their reads, clicks and replies), falling back to the practice's best slot;
  - Meta's daily limit spreads large sends over days (tier read from Meta every 6 hours, else `dailyLimit`).
- **A/B tests:** `testPercent` of the audience is split between two templates; after `testHours` the variant with the better click rate (read rate breaks ties) goes to everyone else.
- **Money:** cost per message per category (marketing or utility, editable rates in Settings), a monthly budget that refuses or pauses campaigns, and spend and cost per sign-up everywhere.
- **Safety:** campaigns auto-pause when opt-outs pass `autoPausePct` after 50 sends; alerts for pauses, budget, A/B winners, finished campaigns and quality drops.
- **Replies:** quick-reply buttons act by wording ("Sign me up" sends the personal link, "Call me back" creates a task, "Not now" snoozes 30 days, STOP opts out); WhatsApp Flow answers update the contact; keyword tagging (Interested, Price, Call-back, Complaint, Stop) without paid AI; an out-of-hours auto-reply; a threaded inbox with saved replies, assignment and the 24-hour rule.
- **Automations:** sequences (new contact, campaign reached, signed up; up to 3 steps with delays and conditions), compliance reminders from each client's deadlines at the utility rate, referral links (`/j/<token>`, credited via the conversions callback with `ref=R-<token>`), and a WhatsApp link and QR code.
- **Analytics** (`lib/marketing/analytics.ts`): send-time heatmap, read hours, time-to-read, campaigns compared, segments, regions, services, engagement bands (Customer, Hot, Warm, Cold, Dormant, New), early forecast, return on spend, a weekly Monday email report.
- **Demo mode:** loads 180 demo contacts (tagged `demo`, numbers 27 82 000 xxxx) and 8 weeks of history; WhatsApp sends are simulated (`simulated = true`, Meta is never called) and the minute cron plays out receipts, replies and sign-ups. "Remove demo data" deletes it all and switches demo mode off.
- **Tour:** a spotlight tour (`components/tour/whatsapp-tour.tsx`) walks 10 steps across the pages using `data-tour` targets.

The QR code image comes from api.qrserver.com (it only contains the practice's public business number), so no QR library was added.

## Cron

The existing minute job `aah-marketing-send` now also runs the simulator and sequences every minute, the quality check every 15 minutes (each number at most every 6 hours), and reminders, best hours and the weekly report hourly. No new cron job is needed.

## Testing

- `packages/core/src/marketing-analytics.test.ts`: holidays, quiet hours, heatmap, best hour, time to read, engagement, forecast, A/B, reply tags, simulator.
- `apps/web/scripts/e2e-marketing.ts` (local Postgres only): additionally quiet-hour scheduling, reply buttons, budget refusal, demo mode with no Meta calls, the A/B split and winner, and demo history loading.
