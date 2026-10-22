"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isPracticeRole } from "@aah/core";
import { audit } from "@aah/db";
import { serverEnv } from "@/lib/env";
import { DOCUMENT_KINDS } from "@/lib/documents";
import { requireSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";


const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_TYPES = /^(application\/pdf|image\/(png|jpeg|webp|heic|tiff)|text\/(csv|plain)|application\/(zip|vnd\.openxmlformats-officedocument\..+|vnd\.ms-excel|msword|vnd\.oasis\.opendocument\..+)|message\/rfc822)$/;

const startSchema = z.object({
  clientId: z.string().min(1).nullable(),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().max(200),
  sizeBytes: z.number().int().positive().max(MAX_BYTES, "Files are limited to 50 MB."),
});

export type UploadResult = { ok: true; documentId?: string; duplicateOf?: string } | { ok: false; error: string };
export type StartUploadResult = { ok: true; path: string; token: string } | { ok: false; error: string };

function safeName(filename: string): string {
  return filename.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120);
}

async function resolveClientId(clientId: string | null): Promise<{ ok: true; clientId: string | null } | { ok: false; error: string }> {
  const session = await requireSession();
  // Client logins always upload into their own client.
  if (!isPracticeRole(session.ctx.role)) return { ok: true, clientId: session.ctx.clientId };
  if (!clientId) return { ok: true, clientId: null };
  const client = await session.db.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } });
  return client ? { ok: true, clientId: client.id } : { ok: false, error: "Client not found." };
}

/** Step 1: hand the browser a one-time signed URL so large files go straight to storage. */
export async function startUpload(input: z.input<typeof startSchema>): Promise<StartUploadResult> {
  const session = await requireSession();
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid file." };
  if (!ALLOWED_TYPES.test(parsed.data.mimeType)) return { ok: false, error: `Files of type ${parsed.data.mimeType || "unknown"} are not accepted.` };

  const resolved = await resolveClientId(parsed.data.clientId);
  if (!resolved.ok) return resolved;

  const year = new Date().getUTCFullYear();
  const path = `${session.ctx.practiceId}/${resolved.clientId ?? "practice"}/${year}/${randomUUID()}-${safeName(parsed.data.filename)}`;
  const { data, error } = await supabaseAdmin().storage.from(serverEnv().documentsBucket).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("signed upload url failed", { practiceId: session.ctx.practiceId, reason: error?.message });
    return { ok: false, error: "Storage is unavailable. Try again shortly." };
  }
  return { ok: true, path: data.path, token: data.token };
}

const finishSchema = z.object({
  path: z.string().min(1).max(500),
  clientId: z.string().min(1).nullable(),
  kind: z.enum(DOCUMENT_KINDS),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Step 2: after the browser uploaded, record the original document. */
export async function finishUpload(input: z.input<typeof finishSchema>): Promise<UploadResult> {
  const session = await requireSession();
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload." };
  const { path, kind, filename, mimeType, sha256 } = parsed.data;

  const resolved = await resolveClientId(parsed.data.clientId);
  if (!resolved.ok) return resolved;
  const clientId = resolved.clientId;

  const expectedPrefix = `${session.ctx.practiceId}/${clientId ?? "practice"}/`;
  if (!path.startsWith(expectedPrefix) || path.includes("..")) return { ok: false, error: "Upload path does not match." };

  // Confirm the object really landed and read its size from storage, not the browser.
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const storage = supabaseAdmin().storage.from(serverEnv().documentsBucket);
  const { data: listed, error: listError } = await storage.list(folder, { search: name, limit: 1 });
  const object = listed?.find((o) => o.name === name);
  if (listError || !object) {
    console.error("uploaded object missing", { path, reason: listError?.message });
    return { ok: false, error: "Upload did not complete. Try again." };
  }
  const sizeBytes = Number((object.metadata as { size?: number } | null)?.size ?? 0);

  const duplicate = await session.db.document.findFirst({
    where: { sha256, clientId, deletedAt: null },
    select: { id: true },
  });

  const doc = await session.db.document.create({
    data: {
      practiceId: session.ctx.practiceId,
      clientId,
      kind,
      source: isPracticeRole(session.ctx.role) ? "UPLOAD" : "PORTAL",
      filename,
      mimeType,
      sizeBytes,
      storagePath: path,
      sha256,
      uploadedByUserId: session.ctx.userId,
    },
  });
  await audit(
    session.ctx,
    { action: "document.uploaded", entityType: "Document", entityId: doc.id, clientId, metadata: { kind, sizeBytes, duplicateOf: duplicate?.id ?? null } },
    session.user.name,
  );

  revalidatePath("/documents");
  if (clientId) revalidatePath(`/clients/${clientId}`);
  return { ok: true, documentId: doc.id, duplicateOf: duplicate?.id };
}

export async function deleteDocument(documentId: string): Promise<void> {
  const session = await requireSession();
  if (!isPracticeRole(session.ctx.role)) return;
  const doc = await session.db.document.findFirst({ where: { id: documentId, deletedAt: null }, select: { id: true, clientId: true } });
  if (!doc) return;
  // Soft delete: the original stays in storage for the retention period.
  await session.db.document.updateMany({ where: { id: doc.id }, data: { deletedAt: new Date() } });
  await audit(session.ctx, { action: "document.deleted", entityType: "Document", entityId: doc.id, clientId: doc.clientId }, session.user.name);
  revalidatePath("/documents");
  if (doc.clientId) revalidatePath(`/clients/${doc.clientId}`);
}
