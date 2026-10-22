export interface MailFormValues {
  label: string;
  emailAddress: string;
  displayName: string;
  provider: "IMAP_SMTP" | "MICROSOFT_365" | "GMAIL";
  purpose: "INBOUND" | "OUTBOUND" | "BOTH";
  username: string;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapFolder: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  isDefaultSender: boolean;
  enabled: boolean;
}

export const EMPTY_MAIL_FORM: MailFormValues = {
  label: "",
  emailAddress: "",
  displayName: "",
  provider: "IMAP_SMTP",
  purpose: "BOTH",
  username: "",
  imapHost: "",
  imapPort: "993",
  imapSecure: true,
  imapFolder: "INBOX",
  smtpHost: "",
  smtpPort: "465",
  smtpSecure: true,
  isDefaultSender: false,
  enabled: true,
};
