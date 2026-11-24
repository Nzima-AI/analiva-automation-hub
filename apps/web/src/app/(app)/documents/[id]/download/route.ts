import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@aah/db";
import { documentPreviewKind, MAX_INLINE_PREVIEW_BYTES } from "@/lib/documents";
import { serverEnv } from "@/lib/env";
import { requireSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Serve the original file after a scoped lookup. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const doc = await session.db.document.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const preview = request.nextUrl.searchParams.get("preview") === "1";
  if (preview && (!documentPreviewKind(doc.mimeType) || doc.sizeBytes > MAX_INLINE_PREVIEW_BYTES)) {
    return new NextResponse("Preview unavailable", { status: 415, headers: { "Cache-Control": "private, no-store" } });
  }
  const previewable = /^(application\/pdf|image\/(png|jpe?g|webp|tiff|gif|bmp))$/i.test(doc.mimeType);
  const inline = request.nextUrl.searchParams.get("view") === "1" && previewable;
  const { data, error } = await supabaseAdmin()
    .storage.from(serverEnv().documentsBucket)
    .createSignedUrl(doc.storagePath, 60, inline || preview ? undefined : { download: doc.filename });
  if (error || !data) {
    console.error("signed download url failed", { documentId: doc.id, reason: error?.message });
    return new NextResponse("Storage unavailable", { status: 502 });
  }

  const desktop = request.nextUrl.searchParams.get("desktop") === "1";
  const original = desktop || preview ? await fetch(data.signedUrl, { cache: "no-store" }).catch(() => null) : null;
  if ((desktop || preview) && (!original?.ok || !original.body)) {
    return new NextResponse("Storage unavailable", { status: 502 });
  }

  if (preview && original?.body) {
    return new NextResponse(original.body, {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": "attachment",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  }

  await audit(session.ctx, { action: "document.downloaded", entityType: "Document", entityId: doc.id, clientId: doc.clientId }, session.user.name);
  if (original?.body) {
    return new NextResponse(original.body, {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" },
    });
  }
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
