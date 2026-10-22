"use client";

import { useState, useTransition } from "react";
import { Button, ButtonLink, Field, Input, Notice, Select } from "@/components/ui";
import { detectMailSettings } from "../actions";
import type { MailFormValues } from "./mail-defaults";

export function MailForm({
  action,
  initial,
  hasPassword,
}: {
  action: (formData: FormData) => Promise<void>;
  initial: MailFormValues;
  hasPassword: boolean;
}) {
  const [v, setV] = useState<MailFormValues>(initial);
  const [note, setNote] = useState<string | null>(null);
  const [detecting, startDetect] = useTransition();
  const set = <K extends keyof MailFormValues>(key: K, value: MailFormValues[K]) => setV((prev) => ({ ...prev, [key]: value }));

  function detect() {
    startDetect(async () => {
      const preset = await detectMailSettings(v.emailAddress);
      if (!preset) {
        setNote("Enter a valid email address first.");
        return;
      }
      setV((prev) => ({
        ...prev,
        provider: preset.provider,
        imapHost: preset.imapHost,
        imapPort: String(preset.imapPort),
        imapSecure: preset.imapSecure,
        smtpHost: preset.smtpHost,
        smtpPort: String(preset.smtpPort),
        smtpSecure: preset.smtpSecure,
        username: prev.username || prev.emailAddress,
        label: prev.label || prev.emailAddress,
      }));
      setNote(`Detected: ${preset.label}.${preset.note ? " " + preset.note : ""}`);
    });
  }

  const showImap = v.purpose !== "OUTBOUND";
  const showSmtp = v.purpose !== "INBOUND";

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email address" className="sm:col-span-2">
          <div className="flex gap-2">
            <Input
              name="emailAddress"
              type="email"
              required
              value={v.emailAddress}
              onChange={(e) => set("emailAddress", e.target.value)}
              autoComplete="off"
            />
            <Button type="button" variant="secondary" onClick={detect} disabled={detecting || !v.emailAddress}>
              {detecting ? "Detecting…" : "Detect settings"}
            </Button>
          </div>
        </Field>
        {note ? (
          <div className="sm:col-span-2">
            <Notice tone="brand">{note}</Notice>
          </div>
        ) : null}
        <Field label="Name for this account" hint="e.g. Dalene's inbox">
          <Input name="label" required value={v.label} onChange={(e) => set("label", e.target.value)} />
        </Field>
        <Field label="Sender name" hint="Shown to recipients, e.g. Dalene Dyson | Analiva">
          <Input name="displayName" value={v.displayName} onChange={(e) => set("displayName", e.target.value)} />
        </Field>
        <Field label="Used for">
          <Select name="purpose" value={v.purpose} onChange={(e) => set("purpose", e.target.value as MailFormValues["purpose"])}>
            <option value="BOTH">Reading invoices and sending</option>
            <option value="INBOUND">Reading invoices only</option>
            <option value="OUTBOUND">Sending only</option>
          </Select>
        </Field>
        <Field label="Provider">
          <Select name="provider" value={v.provider} onChange={(e) => set("provider", e.target.value as MailFormValues["provider"])}>
            <option value="IMAP_SMTP">Hosted mail (cPanel, Domains.co.za, Afrihost …)</option>
            <option value="MICROSOFT_365">Microsoft 365 / Outlook</option>
            <option value="GMAIL">Google Workspace / Gmail</option>
          </Select>
        </Field>
        <Field label="Username" hint="Usually the full email address.">
          <Input name="username" required value={v.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Password" hint={hasPassword ? "Leave blank to keep the saved password." : "For Gmail, use an app password."}>
          <Input name="password" type="password" required={!hasPassword} autoComplete="new-password" placeholder={hasPassword ? "••••••••  (saved)" : ""} />
        </Field>
      </div>

      {showImap ? (
        <fieldset className="rounded-lg border border-line p-4">
          <legend className="px-1 text-sm font-medium">Incoming mail (IMAP)</legend>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Server" className="sm:col-span-2">
              <Input name="imapHost" value={v.imapHost} onChange={(e) => set("imapHost", e.target.value)} placeholder="mail.example.co.za" />
            </Field>
            <Field label="Port">
              <Input name="imapPort" inputMode="numeric" value={v.imapPort} onChange={(e) => set("imapPort", e.target.value)} />
            </Field>
            <Field label="Folder">
              <Input name="imapFolder" value={v.imapFolder} onChange={(e) => set("imapFolder", e.target.value)} />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" name="imapSecure" checked={v.imapSecure} onChange={(e) => set("imapSecure", e.target.checked)} className="accent-brand" />
            SSL/TLS (port 993)
          </label>
        </fieldset>
      ) : null}

      {showSmtp ? (
        <fieldset className="rounded-lg border border-line p-4">
          <legend className="px-1 text-sm font-medium">Outgoing mail (SMTP)</legend>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Server" className="sm:col-span-3">
              <Input name="smtpHost" value={v.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} placeholder="mail.example.co.za" />
            </Field>
            <Field label="Port">
              <Input name="smtpPort" inputMode="numeric" value={v.smtpPort} onChange={(e) => set("smtpPort", e.target.value)} />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" name="smtpSecure" checked={v.smtpSecure} onChange={(e) => set("smtpSecure", e.target.checked)} className="accent-brand" />
            SSL/TLS (port 465). Untick for STARTTLS on port 587.
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="isDefaultSender" checked={v.isDefaultSender} onChange={(e) => set("isDefaultSender", e.target.checked)} className="accent-brand" />
            Default account for sending
          </label>
        </fieldset>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" checked={v.enabled} onChange={(e) => set("enabled", e.target.checked)} className="accent-brand" />
        Enabled
      </label>

      <div className="flex gap-2">
        <Button type="submit">Save account</Button>
        <ButtonLink href="/settings/email" variant="secondary">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
