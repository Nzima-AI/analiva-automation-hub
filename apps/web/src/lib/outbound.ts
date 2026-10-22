import "server-only";
import nodemailer from "nodemailer";
import { activeMandate, renderMessage, renderReminder, resolveSender, type Rendered, type SendAs, type TenantContext } from "@aah/core";
import { decryptSecret } from "@aah/core/secrets";
import { audit, type TenantDb } from "@aah/db";
import { secretsKey, serverEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

type Compose =
  | { kind: "REMINDER"; invoiceId: string; message: string | null; paymentDetails: string | null; recipientName: string | null; attachOriginal: boolean }
  | { kind: "MESSAGE"; subject: string; body: string };

/** Who's sending (preview without sending). */
export async function senderFor(db: TenantDb, clientId: string, sendAs: SendAs) {
  const [practice, client, mailbox, mandates] = await Promise.all([
    db.practice.findFirst({ select: { name: true, email: true } }),
    db.client.findFirst({ where: { id: clientId }, select: { name: true, tradingName: true, email: true, workspace: { select: { brandPrimary: true } } } }),
    db.mailAccount.findFirst({
      where: { enabled: true, purpose: { in: ["OUTBOUND", "BOTH"] }, secretEncrypted: { not: null } },
      orderBy: [{ isDefaultSender: "desc" }, { createdAt: "asc" }],
    }),
    db.mandate.findMany({ where: { clientId } }),
  ]);
  if (!practice || !client) return { error: "Client not found." } as const;
  if (!mailbox) return { error: "No sending mailbox is set up. Add one under Settings → Email accounts." } as const;
  const mandate = activeMandate(mandates);
  const sender = resolveSender({ sendAs, practice, client, mailbox, mandate });
  return { practice, client, mailbox, mandate, sender } as const;
}

export async function sendEmail(
  db: TenantDb,
  ctx: TenantContext,
  actorName: string,
  o: { clientId: string; sendAs: SendAs; to: string; cc: string | null; compose: Compose },
): Promise<SendResult> {
  const who = await senderFor(db, o.clientId, o.sendAs);
  if ("error" in who) return { ok: false, error: who.error! };
  const { sender, mailbox, client, practice, mandate } = who;
  if (!sender.ok) return { ok: false, error: sender.reason };

  const brandName = o.sendAs === "CLIENT" ? client.tradingName || client.name : practice.name;
  const brandColour = (o.sendAs === "CLIENT" ? client.workspace?.brandPrimary : null) ?? "#00AEEF";

  let rendered: Rendered;
  let invoiceId: string | null = null;
  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  if (o.compose.kind === "REMINDER") {
    const inv = await db.invoice.findFirst({ where: { id: o.compose.invoiceId, clientId: o.clientId, deletedAt: null }, include: { sourceDocument: true } });
    if (!inv) return { ok: false, error: "Invoice not found." };
    invoiceId = inv.id;
    rendered = renderReminder({
      recipientName: o.compose.recipientName,
      signature: sender.signature,
      footer: sender.footer,
      brandName,
      brandColour,
      message: o.compose.message,
      paymentDetails: o.compose.paymentDetails,
      invoice: { invoiceNumber: inv.invoiceNumber, issueDate: inv.issueDate, dueDate: inv.dueDate, totalCents: inv.totalCents, outstandingCents: inv.totalCents - inv.amountPaidCents, currency: inv.currency },
    });
    if (o.compose.attachOriginal && inv.sourceDocument) {
      const { data, error } = await supabaseAdmin().storage.from(serverEnv().documentsBucket).download(inv.sourceDocument.storagePath);
      if (error || !data) return { ok: false, error: "Couldn't attach the original invoice from storage." };
      attachments.push({ filename: inv.sourceDocument.filename, content: Buffer.from(await data.arrayBuffer()), contentType: inv.sourceDocument.mimeType });
    }
  } else {
    rendered = renderMessage({ subject: o.compose.subject, body: o.compose.body, signature: sender.signature, footer: sender.footer, brandName, brandColour });
  }

  let messageId: string | null = null;
  let error: string | null = null;
  try {
    const transport = nodemailer.createTransport({
      host: mailbox.smtpHost!,
      port: mailbox.smtpPort ?? 465,
      secure: mailbox.smtpSecure,
      requireTLS: !mailbox.smtpSecure,
      auth: { user: mailbox.username, pass: decryptSecret(mailbox.secretEncrypted!, secretsKey()) },
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    });
    const info = await transport.sendMail({
      from: { name: sender.fromName, address: sender.fromAddress },
      replyTo: sender.replyTo ?? undefined,
      to: o.to,
      cc: o.cc ?? undefined,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      attachments,
    });
    messageId = info.messageId ?? null;
    transport.close();
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 300) : String(e);
    console.error("outbound email failed", { clientId: o.clientId, reason: error });
  }

  const record = await db.outboundEmail.create({
    data: {
      practiceId: ctx.practiceId,
      clientId: o.clientId,
      invoiceId,
      sendAs: o.sendAs,
      mandateId: o.sendAs === "CLIENT" ? ((mandate as { id?: string } | null)?.id ?? null) : null,
      mailAccountId: mailbox.id,
      kind: o.compose.kind,
      fromName: sender.fromName,
      fromAddress: sender.fromAddress,
      replyTo: sender.replyTo,
      toAddress: o.to,
      cc: o.cc,
      subject: rendered.subject,
      bodyText: rendered.text,
      status: error ? "FAILED" : "SENT",
      error,
      messageId,
      sentByUserId: ctx.userId,
    },
  });
  await audit(
    ctx,
    {
      action: error ? "email.failed" : "email.sent",
      entityType: invoiceId ? "Invoice" : "Client",
      entityId: invoiceId ?? o.clientId,
      clientId: o.clientId,
      reason: `${o.compose.kind === "REMINDER" ? "Payment reminder" : "Message"} to ${o.to} as ${o.sendAs === "CLIENT" ? `the client (${sender.fromName})` : "the practice"}`,
      metadata: { outboundId: record.id, sendAs: o.sendAs },
    },
    actorName,
  );
  return error ? { ok: false, error } : { ok: true, id: record.id };
}
