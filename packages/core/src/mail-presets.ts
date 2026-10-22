/**
 * Server settings for common mail hosts, chosen from a domain's MX records.
 */
export type MailProviderKind = "IMAP_SMTP" | "MICROSOFT_365" | "GMAIL";

export interface MailServerPreset {
  provider: MailProviderKind;
  label: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  /** true = implicit TLS (465); false = STARTTLS (587) */
  smtpSecure: boolean;
  note: string | null;
}

export function presetForDomain(domain: string, mxHosts: string[]): MailServerPreset {
  const d = domain.toLowerCase();
  const mx = mxHosts.map((h) => h.toLowerCase().replace(/\.$/, ""));

  if (mx.some((h) => h.endsWith(".mail.protection.outlook.com"))) {
    return {
      provider: "MICROSOFT_365",
      label: "Microsoft 365 / Outlook",
      imapHost: "outlook.office365.com",
      imapPort: 993,
      imapSecure: true,
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      smtpSecure: false,
      note: "Microsoft 365 usually blocks password logins for IMAP. Inbox capture will use a Microsoft sign-in instead (Phase 2).",
    };
  }
  if (mx.some((h) => h.endsWith("google.com") || h.endsWith("googlemail.com")) || d === "gmail.com") {
    return {
      provider: "GMAIL",
      label: "Google Workspace / Gmail",
      imapHost: "imap.gmail.com",
      imapPort: 993,
      imapSecure: true,
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: true,
      note: "Use a Google app password (Google Account → Security → App passwords), not the normal password.",
    };
  }
  if (mx.some((h) => h.endsWith("rdsa-mail.com"))) {
    return {
      provider: "IMAP_SMTP",
      label: "Domains.co.za mail (RDSA)",
      imapHost: `mail.${d}`,
      imapPort: 993,
      imapSecure: true,
      smtpHost: `mail.${d}`,
      smtpPort: 465,
      smtpSecure: true,
      note: "If the connection test fails, check the exact server names in your hosting control panel's email settings.",
    };
  }
  return {
    provider: "IMAP_SMTP",
    label: mx[0] ? `Hosted mail (${mx[0]})` : "Hosted mail",
    imapHost: mx[0] && mx[0].endsWith(d) ? mx[0] : `mail.${d}`,
    imapPort: 993,
    imapSecure: true,
    smtpHost: mx[0] && mx[0].endsWith(d) ? mx[0] : `mail.${d}`,
    smtpPort: 465,
    smtpSecure: true,
    note: "Typical cPanel settings. Confirm in the hosting control panel if the test fails.",
  };
}
