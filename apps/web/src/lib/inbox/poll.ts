import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser, type Attachment, type ParsedMail } from "mailparser";
import {
  classifyEmail,
  confidenceGate,
  isDocumentAttachment,
  matchClient,
  parseInvoiceText,
  type TenantContext,
} from "@aah/core";
import { decryptSecret } from "@aah/core/secrets";
import { extractText, type ExtractionResult } from "@aah/extraction";
import { audit, rootDb, tenantDb, type TenantDb } from "@aah/db";
import { secretsKey, serverEnv } from "@/lib/env";
import { checkInvoice, createInvoice } from "@/lib/invoice-service";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toExtractedJson } from "./extracted";
import { hintsFor, rememberSupplier, supplierKeys } from "./learning";

const MAX_MESSAGES_PER_ACCOUNT = 15;
const MAX_OCR_PER_MESSAGE = 2;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MIN_IMAGE_BYTES = 8 * 1024; // smaller images are signature logos
const FIRST_SYNC_LOOKBACK_DAYS = 3;
const TIME_BUDGET_MS = 240_000;
const SYSTEM_LABEL = "Inbox capture";

export interface PollSummary {
  account: string;
  fetched: number;
  filed: number;
  queued: number;
  error: string | null;
}

function systemCtx(practiceId: string): TenantContext {
  return { practiceId, userId: "system", role: "OWNER", clientId: null };
}

/** Poll every enabled inbound mailbox (optionally for one practice). */
export async function pollInboxes(opts: { practiceId?: string; deadline?: number } = {}): Promise<PollSummary[]> {
  const deadline = opts.deadline ?? Date.now() + TIME_BUDGET_MS;
  const accounts = await rootDb().mailAccount.findMany({
    where: { enabled: true, purpose: { in: ["INBOUND", "BOTH"] }, secretEncrypted: { not: null }, ...(opts.practiceId ? { practiceId: opts.practiceId } : {}) },
    orderBy: { lastPolledAt: { sort: "asc", nulls: "first" } },
  });
  const results: PollSummary[] = [];
  for (const account of accounts) {
    if (Date.now() > deadline) break;
    results.push(await pollAccount(account.id, deadline));
  }
  return results;
}

async function pollAccount(accountId: string, deadline: number): Promise<PollSummary> {
  const account = await rootDb().mailAccount.findUniqueOrThrow({ where: { id: accountId } });
  const ctx = systemCtx(account.practiceId);
  const db = tenantDb(ctx);
  const summary: PollSummary = { account: account.emailAddress, fetched: 0, filed: 0, queued: 0, error: null };

  let client: ImapFlow | null = null;
  try {
    const password = decryptSecret(account.secretEncrypted!, secretsKey());
    client = new ImapFlow({
      host: account.imapHost!,
      port: account.imapPort ?? 993,
      secure: account.imapSecure,
      auth: { user: account.username, pass: password },
      logger: false,
      connectionTimeout: 15_000,
      socketTimeout: 60_000,
    });
    await client.connect();
    const lock = await client.getMailboxLock(account.imapFolder);
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error(`Folder ${account.imapFolder} not available`);
      const uidValidity = String(mailbox.uidValidity);
      let lastUid = account.uidValidity === uidValidity ? account.lastUid : null;

      let uids: number[];
      if (lastUid === null) {
        const since = new Date(account.createdAt.getTime() - FIRST_SYNC_LOOKBACK_DAYS * 86_400_000);
        uids = (await client.search({ since }, { uid: true })) || [];
        if (uids.length === 0) lastUid = Math.max(0, Number(mailbox.uidNext) - 1);
      } else {
        const floor = lastUid;
        uids = ((await client.search({ uid: `${floor + 1}:*` }, { uid: true })) || []).filter((u) => u > floor);
      }
      uids.sort((a, b) => a - b);

      for (const uid of uids.slice(0, MAX_MESSAGES_PER_ACCOUNT)) {
        if (Date.now() > deadline) break;
        // source fetch uses BODY.PEEK, so messages stay unread in the mailbox
        const msg = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
        if (msg && msg.source) {
          const outcome = await processMessage(db, ctx, account, uid, uidValidity, msg.source, msg.internalDate ? new Date(msg.internalDate) : new Date());
          summary.fetched += outcome.stored ? 1 : 0;
          summary.filed += outcome.filed;
          summary.queued += outcome.queued;
        }
        lastUid = uid;
        await db.mailAccount.updateMany({ where: { id: account.id }, data: { lastUid, uidValidity } });
      }
      await db.mailAccount.updateMany({
        where: { id: account.id },
        data: { lastUid, uidValidity, lastPolledAt: new Date(), lastPollError: null },
      });
    } finally {
      lock.release();
    }
  } catch (e) {
    summary.error = e instanceof Error ? e.message.slice(0, 300) : String(e);
    console.error("inbox poll failed", { accountId, reason: summary.error });
    await db.mailAccount.updateMany({ where: { id: account.id }, data: { lastPolledAt: new Date(), lastPollError: summary.error } });
  } finally {
    if (client) await client.logout().catch(() => client?.close());
  }
  return summary;
}

type Account = Awaited<ReturnType<ReturnType<typeof rootDb>["mailAccount"]["findUniqueOrThrow"]>>;

interface DocCandidate {
  att: Attachment;
  filename: string;
  mimeType: string;
  extraction: ExtractionResult | null;
}

function safeName(filename: string): string {
  return filename.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120) || "attachment";
}

function pickAttachments(parsed: ParsedMail): DocCandidate[] {
  return parsed.attachments
    .filter((a) => {
      const filename = a.filename ?? "";
      if (!isDocumentAttachment({ mimeType: a.contentType, filename })) return false;
      if (a.size > MAX_ATTACHMENT_BYTES) return false;
      const isImage = a.contentType.startsWith("image/");
      // Inline images are almost always logos and signatures.
      if (isImage && (a.related || a.size < MIN_IMAGE_BYTES)) return false;
      return true;
    })
    .map((a, i) => ({ att: a, filename: a.filename ?? `attachment-${i + 1}`, mimeType: a.contentType, extraction: null }));
}

async function processMessage(
  db: TenantDb,
  ctx: TenantContext,
  account: Account,
  uid: number,
  uidValidity: string,
  source: Buffer,
  internalDate: Date,
): Promise<{ stored: boolean; filed: number; queued: number }> {
  const parsed = await simpleParser(source);
  const messageId = (parsed.messageId ?? `uid-${uidValidity}-${uid}`).slice(0, 500);
  if (await db.emailMessage.findFirst({ where: { mailAccountId: account.id, messageId }, select: { id: true } })) {
    return { stored: false, filed: 0, queued: 0 };
  }

  const from = parsed.from?.value[0];
  const fromAddress = (from?.address ?? "unknown").toLowerCase();
  const fromName = from?.name || null;
  const subject = (parsed.subject ?? "(no subject)").slice(0, 500);
  const bodyText = (parsed.text ?? "").slice(0, 20_000);
  const fromSelf = fromAddress === account.emailAddress.toLowerCase();
  const year = internalDate.getUTCFullYear();
  const storage = supabaseAdmin().storage.from(serverEnv().documentsBucket);

  // Read every document first: matching uses what's inside them.
  const docs = fromSelf ? [] : pickAttachments(parsed);
  let ocrUsed = 0;
  for (const d of docs) {
    const isImage = d.mimeType.startsWith("image/");
    if (isImage && ocrUsed >= MAX_OCR_PER_MESSAGE) {
      d.extraction = { text: "", method: "unsupported", note: "Too many images in one email; capture manually." };
      continue;
    }
    if (isImage) ocrUsed++;
    d.extraction = await extractText(new Uint8Array(d.att.content), d.mimeType, d.filename);
  }

  const classification = classifyEmail({ subject, text: bodyText, attachments: docs.map((d) => ({ filename: d.filename, mimeType: d.mimeType })) });

  const [clients, rules, practice] = await Promise.all([
    db.client.findMany({ where: { deletedAt: null }, include: { contacts: { select: { email: true } } } }),
    db.senderRule.findMany({ select: { pattern: true, clientId: true } }),
    db.practice.findFirst({ select: { vatNumber: true } }),
  ]);
  const match = matchClient(
    { senderEmail: fromAddress, subject, documentText: [bodyText, ...docs.map((d) => d.extraction?.text ?? "")].join("\n") },
    clients.map((c) => ({
      id: c.id,
      name: c.name,
      tradingName: c.tradingName,
      email: c.email,
      emailDomains: c.emailDomains,
      vatNumber: c.vatNumber,
      registrationNumber: c.registrationNumber,
      contactEmails: c.contacts.map((x) => x.email).filter((x): x is string => !!x),
    })),
    rules,
  );
  const clientId = match.status === "MATCHED" ? match.clientId : null;
  const matchedClient = clients.find((c) => c.id === clientId);

  const rawPath = `${account.practiceId}/inbox/${year}/${randomUUID()}.eml`;
  const rawUpload = await storage.upload(rawPath, source, { contentType: "message/rfc822" });
  if (rawUpload.error) console.error("raw email upload failed", { reason: rawUpload.error.message });

  let email;
  try {
    email = await db.emailMessage.create({
      data: {
        practiceId: account.practiceId,
        clientId,
        mailAccountId: account.id,
        messageId,
        imapUid: uid,
        fromAddress,
        fromName,
        toAddresses: (parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : []).flatMap((t) => t.value.map((v) => v.address ?? "")).filter(Boolean),
        subject,
        receivedAt: parsed.date ?? internalDate,
        textPreview: bodyText.slice(0, 2000) || null,
        kind: classification.kind,
        kindReason: fromSelf ? "sent by this mailbox" : classification.reason,
        matchStatus: match.status,
        matchCandidates: match.candidates.map((c) => ({ ...c })),
        rawStoragePath: rawUpload.error ? null : rawPath,
      },
    });
  } catch (e) {
    // Another poll stored it first.
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002") return { stored: false, filed: 0, queued: 0 };
    throw e;
  }

  let filed = 0;
  let queued = 0;
  for (const d of docs) {
    const path = `${account.practiceId}/${clientId ?? "practice"}/${year}/${randomUUID()}-${safeName(d.filename)}`;
    const up = await storage.upload(path, d.att.content, { contentType: d.mimeType });
    if (up.error) {
      console.error("attachment upload failed", { emailId: email.id, reason: up.error.message });
      continue;
    }
    const text = d.extraction?.text ?? "";
    const firstPass = text ? parseInvoiceText(text, { excludeVatNumbers: [practice?.vatNumber, matchedClient?.vatNumber].filter((v): v is string => !!v) }) : null;
    const isCandidate =
      classification.kind !== "STATEMENT" && classification.kind !== "CIPC" && (classification.kind === "INVOICE" || !!firstPass?.looksLikeInvoice);

    const doc = await db.document.create({
      data: {
        practiceId: account.practiceId,
        clientId,
        kind: isCandidate ? "INVOICE" : classification.kind === "STATEMENT" ? "STATEMENT" : classification.kind === "CIPC" ? "CIPC" : "OTHER",
        source: "EMAIL",
        filename: d.filename.slice(0, 255),
        mimeType: d.mimeType,
        sizeBytes: d.att.size,
        storagePath: path,
        sha256: createHash("sha256").update(d.att.content).digest("hex"),
        emailMessageId: email.id,
      },
    });
    if (!isCandidate) continue;

    const outcome = await captureDocument(db, ctx, {
      clientId,
      emailId: email.id,
      documentId: doc.id,
      senderEmail: fromAddress,
      senderName: fromName ?? fromAddress.split("@")[1] ?? null,
      text,
      extraction: d.extraction,
      excludeVat: [practice?.vatNumber, matchedClient?.vatNumber].filter((v): v is string => !!v),
      matchStatus: match.status,
    });
    if (outcome === "FILED") filed++;
    else queued++;
  }

  await audit(
    ctx,
    {
      action: "email.received",
      entityType: "EmailMessage",
      entityId: email.id,
      clientId,
      metadata: { kind: classification.kind, match: match.status, attachments: docs.length, filed, queued },
    },
    SYSTEM_LABEL,
    "SYSTEM",
  );
  return { stored: true, filed, queued };
}

async function captureDocument(
  db: TenantDb,
  ctx: TenantContext,
  a: {
    clientId: string | null;
    emailId: string;
    documentId: string;
    senderEmail: string;
    senderName: string | null;
    text: string;
    extraction: ExtractionResult | null;
    excludeVat: string[];
    matchStatus: string;
  },
): Promise<"FILED" | "QUEUED"> {
  const base = { practiceId: ctx.practiceId, clientId: a.clientId, emailMessageId: a.emailId, documentId: a.documentId };
  if (!a.text) {
    await db.capture.create({
      data: {
        ...base,
        status: a.clientId ? "NEEDS_REVIEW" : "NEEDS_CLIENT",
        confidence: 0,
        extracted: { fields: {}, arithmeticConsistent: false, looksLikeCreditNote: false, method: a.extraction?.method ?? "none", note: a.extraction?.note ?? null },
        note: a.extraction?.note ?? "No readable text",
      },
    });
    return "QUEUED";
  }

  // Parse once to find the supplier, then again with what we've learned about it.
  let parsed = parseInvoiceText(a.text, { excludeVatNumbers: a.excludeVat, senderName: a.senderName });
  const keys = supplierKeys(parsed.supplierVatNumber?.value ?? null, a.senderEmail);
  const hints = await hintsFor(db, keys);
  if (hints) parsed = parseInvoiceText(a.text, { ...hints, excludeVatNumbers: a.excludeVat, senderName: a.senderName });

  const extracted = toExtractedJson(parsed, a.extraction?.method ?? "unknown", a.extraction?.note ?? null);
  const gate = confidenceGate(parsed.confidence);
  const complete = !!(parsed.totalCents && parsed.invoiceNumber && parsed.issueDate && parsed.vatCents && parsed.subtotalCents);

  if (a.clientId && gate === "AUTO" && complete && !parsed.looksLikeCreditNote) {
    const input = {
      clientId: a.clientId,
      direction: "PAYABLE" as const,
      supplierName: parsed.supplierName?.value ?? null,
      supplierVatNumber: parsed.supplierVatNumber?.value ?? null,
      invoiceNumber: parsed.invoiceNumber!.value,
      issueDate: parsed.issueDate!.value,
      dueDate: parsed.dueDate?.value ?? null,
      subtotalCents: parsed.subtotalCents!.value,
      vatCents: parsed.vatCents!.value,
      totalCents: parsed.totalCents!.value,
      description: null,
      sourceDocumentId: a.documentId,
      captureSource: "EMAIL" as const,
      confidence: parsed.confidence,
      capturedByUserId: null,
    };
    const check = await checkInvoice(db, ctx, input);
    if (check.issues.length === 0) {
      const invoice = await createInvoice(db, ctx, input, check);
      const capture = await db.capture.create({
        data: { ...base, status: "FILED", confidence: parsed.confidence, extracted: extracted as object, documentText: a.text.slice(0, 50_000), invoiceId: invoice.id, decidedAt: new Date() },
      });
      if (input.supplierName) {
        await rememberSupplier(db, ctx, {
          keys,
          supplierName: input.supplierName,
          vatNumber: input.supplierVatNumber,
          documentText: a.text,
          workingSources: Object.fromEntries(Object.entries(extracted.fields).map(([k, v]) => [k, v!.source])),
          corrections: [],
          captureId: capture.id,
        });
      }
      await audit(
        ctx,
        {
          action: "invoice.captured",
          entityType: "Invoice",
          entityId: invoice.id,
          clientId: a.clientId,
          reason: `Auto-filed from email at ${Math.round(parsed.confidence * 100)}% confidence`,
          metadata: { captureId: capture.id },
        },
        SYSTEM_LABEL,
        "SYSTEM",
      );
      return "FILED";
    }
    await db.capture.create({
      data: { ...base, status: "NEEDS_REVIEW", confidence: parsed.confidence, extracted: extracted as object, documentText: a.text.slice(0, 50_000), issues: check.issues },
    });
    return "QUEUED";
  }

  const status = !a.clientId ? "NEEDS_CLIENT" : gate === "REVIEW" || !complete ? "NEEDS_REVIEW" : "SUGGESTED";
  await db.capture.create({
    data: {
      ...base,
      status,
      confidence: parsed.confidence,
      extracted: extracted as object,
      documentText: a.text.slice(0, 50_000),
      note: parsed.looksLikeCreditNote ? "Looks like a credit note" : a.matchStatus === "AMBIGUOUS" ? "Matches more than one client" : (a.extraction?.note ?? null),
    },
  });
  return "QUEUED";
}
