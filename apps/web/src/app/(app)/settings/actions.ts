"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidSaVatNumber, normaliseCipcRegistration, normaliseSaPhone, type MailServerPreset } from "@aah/core";
import { decryptSecret, encryptSecret } from "@aah/core/secrets";
import { audit } from "@aah/db";
import { secretsKey } from "@/lib/env";
import { blankToNull, fail, parseForm } from "@/lib/forms";
import { detectPreset, testImap, testSmtp, type ConnectionResult } from "@/lib/mail";
import { requireSession, requireStaff } from "@/lib/session";

async function requireOwner() {
  const session = await requireStaff();
  if (session.ctx.role !== "OWNER") fail("/settings", "Only the practice owner can change these settings.");
  return session;
}

const optional = z.preprocess(blankToNull, z.string().max(300).nullable());

// ---------------------------------------------------------------- practice

const practiceSchema = z.object({
  name: z.string().trim().min(2).max(200),
  registrationNumber: optional,
  vatNumber: optional,
  email: z.preprocess(blankToNull, z.string().email().max(200).nullable()),
  phone: optional,
  website: optional,
  physicalAddress: z.preprocess(blankToNull, z.string().max(1000).nullable()),
});

export async function updatePractice(formData: FormData) {
  const session = await requireOwner();
  const input = parseForm(practiceSchema, formData, "/settings");
  const registrationNumber = input.registrationNumber ? normaliseCipcRegistration(input.registrationNumber) : null;
  if (input.registrationNumber && !registrationNumber) fail("/settings", "CIPC registration should look like 2019/123456/07.");
  const vatNumber = input.vatNumber?.replace(/\s/g, "") ?? null;
  if (vatNumber && !isValidSaVatNumber(vatNumber)) fail("/settings", "VAT number must be 10 digits starting with 4.");

  await session.db.practice.updateMany({
    where: { id: session.ctx.practiceId },
    data: {
      ...input,
      registrationNumber,
      vatNumber,
      email: input.email?.toLowerCase() ?? null,
      phone: input.phone ? (normaliseSaPhone(input.phone) ?? input.phone) : null,
    },
  });
  await audit(session.ctx, { action: "practice.updated", entityType: "Practice", entityId: session.ctx.practiceId }, session.user.name);
  revalidatePath("/", "layout");
  redirect("/settings?saved=practice");
}

// ---------------------------------------------------------------- profile

export async function updateProfile(formData: FormData) {
  const session = await requireSession();
  const name = z.string().trim().min(2).max(200).safeParse(formData.get("name"));
  if (!name.success) fail("/settings", "Enter your name.");
  await session.db.user.updateMany({ where: { id: session.ctx.userId }, data: { name: name.data } });
  await audit(session.ctx, { action: "user.updated", entityType: "User", entityId: session.ctx.userId }, name.data);
  revalidatePath("/", "layout");
  redirect("/settings?saved=profile");
}

// ---------------------------------------------------------------- mail accounts

const port = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(65535).nullable());
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());

const mailSchema = z.object({
  label: z.string().trim().min(1).max(100),
  emailAddress: z.string().trim().toLowerCase().email(),
  displayName: optional,
  provider: z.enum(["IMAP_SMTP", "MICROSOFT_365", "GMAIL"]),
  purpose: z.enum(["INBOUND", "OUTBOUND", "BOTH"]),
  username: z.string().trim().min(1).max(200),
  password: z.preprocess(blankToNull, z.string().max(500).nullable()),
  imapHost: optional,
  imapPort: port,
  imapSecure: checkbox,
  imapFolder: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : "INBOX"), z.string().max(200)),
  smtpHost: optional,
  smtpPort: port,
  smtpSecure: checkbox,
  isDefaultSender: checkbox,
  enabled: checkbox,
});

export async function saveMailAccount(accountId: string | null, formData: FormData) {
  const session = await requireOwner();
  const backTo = accountId ? `/settings/email/${accountId}` : "/settings/email/new";
  const input = parseForm(mailSchema, formData, backTo);
  const { password, ...fields } = input;

  const needsImap = input.purpose !== "OUTBOUND";
  const needsSmtp = input.purpose !== "INBOUND";
  if (needsImap && (!input.imapHost || !input.imapPort)) fail(backTo, "Enter the incoming (IMAP) server and port.");
  if (needsSmtp && (!input.smtpHost || !input.smtpPort)) fail(backTo, "Enter the outgoing (SMTP) server and port.");
  if (!accountId && !password) fail(backTo, "Enter the mailbox password.");

  const data = {
    ...fields,
    ...(password ? { secretEncrypted: encryptSecret(password, secretsKey()) } : {}),
    status: "UNTESTED" as const,
    lastError: null,
  };

  if (input.isDefaultSender) {
    await session.db.mailAccount.updateMany({ where: { isDefaultSender: true }, data: { isDefaultSender: false } });
  }

  let id = accountId;
  try {
    if (accountId) {
      const { count } = await session.db.mailAccount.updateMany({ where: { id: accountId }, data });
      if (count === 0) fail("/settings/email", "Email account not found.");
    } else {
      const created = await session.db.mailAccount.create({ data: { ...data, practiceId: session.ctx.practiceId } });
      id = created.id;
    }
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002") fail(backTo, "That email address is already set up.");
    throw e;
  }

  await audit(
    session.ctx,
    {
      action: accountId ? "mail_account.updated" : "mail_account.created",
      entityType: "MailAccount",
      entityId: id!,
      metadata: { email: input.emailAddress, purpose: input.purpose, passwordChanged: !!password },
    },
    session.user.name,
  );
  revalidatePath("/settings/email");
  redirect(`/settings/email/${id}?saved=1`);
}

export async function deleteMailAccount(accountId: string) {
  const session = await requireOwner();
  const { count } = await session.db.mailAccount.deleteMany({ where: { id: accountId } });
  if (count > 0) {
    await audit(session.ctx, { action: "mail_account.deleted", entityType: "MailAccount", entityId: accountId }, session.user.name);
  }
  revalidatePath("/settings/email");
  redirect("/settings/email");
}

export type TestState = { status: "idle" } | { status: "done"; results: ConnectionResult[] };

/** Connect to the mailbox with the stored credentials. Optionally send a test email to the owner. */
export async function testMailAccount(accountId: string, _prev: TestState, formData: FormData): Promise<TestState> {
  const session = await requireOwner();
  const account = await session.db.mailAccount.findFirst({ where: { id: accountId } });
  if (!account || !account.secretEncrypted) return { status: "done", results: [{ ok: false, detail: "Save a password first." }] };

  let password: string;
  try {
    password = decryptSecret(account.secretEncrypted, secretsKey());
  } catch (e) {
    console.error("mail secret decrypt failed", { accountId, reason: e instanceof Error ? e.message : String(e) });
    return { status: "done", results: [{ ok: false, detail: "The stored password can't be read. Enter it again and save." }] };
  }

  const conn = { ...account, password };
  const results: ConnectionResult[] = [];
  if (account.purpose !== "OUTBOUND") results.push(await testImap(conn));
  if (account.purpose !== "INBOUND") {
    results.push(await testSmtp(conn, formData.get("sendTest") === "on" ? session.user.email : undefined));
  }
  const ok = results.every((r) => r.ok);

  await session.db.mailAccount.updateMany({
    where: { id: accountId },
    data: { status: ok ? "OK" : "ERROR", lastTestedAt: new Date(), lastError: ok ? null : results.filter((r) => !r.ok).map((r) => r.detail).join("; ") },
  });
  await audit(
    session.ctx,
    { action: "mail_account.tested", entityType: "MailAccount", entityId: accountId, metadata: { ok } },
    session.user.name,
  );
  revalidatePath(`/settings/email/${accountId}`);
  revalidatePath("/settings/email");
  return { status: "done", results };
}

/** Suggest server settings from the address's domain (MX lookup). */
export async function detectMailSettings(email: string): Promise<MailServerPreset | null> {
  await requireOwner();
  const parsed = z.string().email().safeParse(email.trim());
  if (!parsed.success) return null;
  return detectPreset(parsed.data);
}
