import "server-only";
import { resolveMx } from "node:dns/promises";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { presetForDomain, type MailServerPreset } from "@aah/core";

export interface MailConnection {
  emailAddress: string;
  displayName: string | null;
  username: string;
  password: string;
  imapHost: string | null;
  imapPort: number | null;
  imapSecure: boolean;
  imapFolder: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
}

export interface ConnectionResult {
  ok: boolean;
  detail: string;
}

const TIMEOUT_MS = 15_000;

export async function detectPreset(email: string): Promise<MailServerPreset | null> {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;
  let mx: string[] = [];
  try {
    mx = (await resolveMx(domain)).sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
  } catch (e) {
    console.warn("mx lookup failed", { domain, reason: e instanceof Error ? e.message : String(e) });
  }
  return presetForDomain(domain, mx);
}

/** Log in to IMAP and open the folder. Reports message count; reads nothing else. */
export async function testImap(c: MailConnection): Promise<ConnectionResult> {
  if (!c.imapHost || !c.imapPort) return { ok: false, detail: "IMAP server not set" };
  const client = new ImapFlow({
    host: c.imapHost,
    port: c.imapPort,
    secure: c.imapSecure,
    auth: { user: c.username, pass: c.password },
    logger: false,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  try {
    await client.connect();
    const status = await client.status(c.imapFolder, { messages: true, unseen: true });
    return { ok: true, detail: `Inbox OK: ${status.messages ?? 0} messages, ${status.unseen ?? 0} unread in ${c.imapFolder}` };
  } catch (e) {
    return { ok: false, detail: `Inbox: ${describe(e)}` };
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export async function testSmtp(c: MailConnection, sendTo?: string): Promise<ConnectionResult> {
  if (!c.smtpHost || !c.smtpPort) return { ok: false, detail: "SMTP server not set" };
  const transport = nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpSecure,
    requireTLS: !c.smtpSecure,
    auth: { user: c.username, pass: c.password },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  try {
    await transport.verify();
    if (sendTo) {
      await transport.sendMail({
        from: c.displayName ? { name: c.displayName, address: c.emailAddress } : c.emailAddress,
        to: sendTo,
        subject: "Analiva Automation Hub: test email",
        text: `This is a test from Analiva Automation Hub. Sending from ${c.emailAddress} works.`,
      });
      return { ok: true, detail: `Sending OK: test email sent to ${sendTo}` };
    }
    return { ok: true, detail: "Sending OK: SMTP login accepted" };
  } catch (e) {
    return { ok: false, detail: `Sending: ${describe(e)}` };
  } finally {
    transport.close();
  }
}

function describe(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const err = e as Error & { code?: string; responseText?: string; authenticationFailed?: boolean };
  if (err.authenticationFailed || /auth/i.test(err.code ?? "") || /AUTHENTICATIONFAILED|535|Invalid login/i.test(err.message + (err.responseText ?? ""))) {
    return "the server rejected the username or password";
  }
  if (err.code === "ENOTFOUND") return "server name not found";
  if (err.code === "ETIMEDOUT" || err.code === "ETIMEOUT" || /timed? ?out/i.test(err.message)) return "connection timed out (check server and port)";
  if (err.code === "ECONNREFUSED") return "connection refused (check port)";
  return (err.responseText ?? err.message).slice(0, 200);
}
