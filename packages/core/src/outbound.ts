import { formatCents } from "./money";

/**
 * Outbound email identity and templates. The practice often writes on behalf of a
 * client (white label). That needs a valid, unexpired mandate (CLAUDE.md §7), and the
 * mail still leaves through the practice's own mailbox: we never forge the client's
 * domain (SPF/DMARC would reject it). The client's name is the display name and their
 * address is the Reply-To, so answers go straight to them.
 */

export type SendAs = "PRACTICE" | "CLIENT";

export interface MandateInfo {
  scope: string;
  signedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export type MandateCheck = { valid: true } | { valid: false; reason: string };

export function checkMandate(m: MandateInfo | null, now: Date = new Date()): MandateCheck {
  if (!m) return { valid: false, reason: "No signed mandate on record for this client." };
  if (m.revokedAt && m.revokedAt <= now) return { valid: false, reason: "The client's mandate was revoked." };
  if (m.signedAt > now) return { valid: false, reason: "The mandate isn't in effect yet." };
  if (m.expiresAt && m.expiresAt <= now) return { valid: false, reason: "The client's mandate has expired." };
  if (!/email|all/i.test(m.scope)) return { valid: false, reason: "The mandate doesn't cover sending email." };
  return { valid: true };
}

/** The newest mandate that is currently valid, if any. */
export function activeMandate<T extends MandateInfo>(mandates: T[], now: Date = new Date()): T | null {
  return [...mandates].sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime()).find((m) => checkMandate(m, now).valid) ?? null;
}

export interface SenderInput {
  sendAs: SendAs;
  practice: { name: string; email: string | null };
  client: { name: string; tradingName: string | null; email: string | null };
  mailbox: { emailAddress: string; displayName: string | null };
  mandate: MandateInfo | null;
  now?: Date;
}

export type Sender =
  | { ok: true; fromName: string; fromAddress: string; replyTo: string | null; signature: string; footer: string }
  | { ok: false; reason: string };

export function resolveSender(i: SenderInput): Sender {
  const clientName = i.client.tradingName || i.client.name;
  if (i.sendAs === "CLIENT") {
    const m = checkMandate(i.mandate, i.now);
    if (!m.valid) return { ok: false, reason: m.reason };
    return {
      ok: true,
      fromName: clientName,
      fromAddress: i.mailbox.emailAddress,
      replyTo: i.client.email,
      signature: clientName,
      footer: `Sent on behalf of ${clientName} by ${i.practice.name}.`,
    };
  }
  return {
    ok: true,
    fromName: i.mailbox.displayName || i.practice.name,
    fromAddress: i.mailbox.emailAddress,
    replyTo: i.practice.email && i.practice.email !== i.mailbox.emailAddress ? i.practice.email : null,
    signature: i.mailbox.displayName || i.practice.name,
    footer: `Sent by ${i.practice.name}.`,
  };
}

// ------------------------------------------------------------------ templates

export interface ReminderInvoice {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  totalCents: bigint;
  outstandingCents: bigint;
  currency: string;
}

export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const day = (d: Date) => new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);

function shell(o: { brandName: string; brandColour: string; bodyHtml: string; footer: string }): string {
  const colour = /^#[0-9a-f]{6}$/i.test(o.brandColour) ? o.brandColour : "#00AEEF";
  return `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Segoe UI,Arial,sans-serif;color:#101828">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eaecf0">
<tr><td style="background:${colour};padding:18px 24px;color:#ffffff;font-size:17px;font-weight:600">${esc(o.brandName)}</td></tr>
<tr><td style="padding:24px;font-size:14px;line-height:1.6">${o.bodyHtml}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #eaecf0;font-size:12px;color:#6b7585">${esc(o.footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Payment reminder for one invoice. */
export function renderReminder(o: {
  recipientName: string | null;
  signature: string;
  footer: string;
  brandName: string;
  brandColour: string;
  invoice: ReminderInvoice;
  message?: string | null;
  paymentDetails?: string | null;
}): Rendered {
  const inv = o.invoice;
  const overdue = inv.dueDate && inv.dueDate.getTime() < Date.now();
  const subject = `${overdue ? "Overdue: " : "Reminder: "}invoice ${inv.invoiceNumber} (${formatCents(inv.outstandingCents, inv.currency)})`;
  const intro =
    o.message?.trim() ||
    `This is a friendly reminder that invoice ${inv.invoiceNumber} dated ${day(inv.issueDate)} has ${formatCents(inv.outstandingCents, inv.currency)} outstanding${
      inv.dueDate ? `, ${overdue ? "which was due" : "due"} on ${day(inv.dueDate)}` : ""
    }.`;
  const text = [
    `Dear ${o.recipientName || "Sir/Madam"},`,
    intro,
    `Invoice: ${inv.invoiceNumber}\nInvoice date: ${day(inv.issueDate)}${inv.dueDate ? `\nDue date: ${day(inv.dueDate)}` : ""}\nInvoice total: ${formatCents(inv.totalCents, inv.currency)}\nAmount outstanding: ${formatCents(inv.outstandingCents, inv.currency)}`,
    o.paymentDetails ? `Payment details:\n${o.paymentDetails}` : "",
    "If you've already paid, please ignore this message, and thank you.",
    `Kind regards\n${o.signature}`,
    o.footer,
  ]
    .filter(Boolean)
    .join("\n\n");
  const table = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 16px;border:1px solid #eaecf0;border-radius:8px">
${[
  ["Invoice", inv.invoiceNumber],
  ["Invoice date", day(inv.issueDate)],
  ...(inv.dueDate ? [["Due date", day(inv.dueDate)]] : []),
  ["Invoice total", formatCents(inv.totalCents, inv.currency)],
  ["Amount outstanding", formatCents(inv.outstandingCents, inv.currency)],
]
  .map(([k, v], i, a) => `<tr><td style="padding:8px 12px;color:#556070;${i < a.length - 1 ? "border-bottom:1px solid #eaecf0;" : ""}">${esc(k!)}</td><td style="padding:8px 12px;text-align:right;font-weight:${k === "Amount outstanding" ? 700 : 400};${i < a.length - 1 ? "border-bottom:1px solid #eaecf0;" : ""}">${esc(v!)}</td></tr>`)
  .join("")}
</table>`;
  const html = shell({
    brandName: o.brandName,
    brandColour: o.brandColour,
    footer: o.footer,
    bodyHtml: `${paragraphs(`Dear ${o.recipientName || "Sir/Madam"},`)}${paragraphs(intro)}${table}${o.paymentDetails ? `<p style="margin:0 0 4px;font-weight:600">Payment details</p>${paragraphs(o.paymentDetails)}` : ""}${paragraphs("If you've already paid, please ignore this message, and thank you.")}${paragraphs(`Kind regards\n${o.signature}`)}`,
  });
  return { subject, text, html };
}

/** A plain message (to a client, or anyone) in the chosen identity's branding. */
export function renderMessage(o: { subject: string; body: string; signature: string; footer: string; brandName: string; brandColour: string }): Rendered {
  const text = `${o.body.trim()}\n\nKind regards\n${o.signature}\n\n${o.footer}`;
  return {
    subject: o.subject,
    text,
    html: shell({ brandName: o.brandName, brandColour: o.brandColour, footer: o.footer, bodyHtml: `${paragraphs(o.body.trim())}${paragraphs(`Kind regards\n${o.signature}`)}` }),
  };
}
