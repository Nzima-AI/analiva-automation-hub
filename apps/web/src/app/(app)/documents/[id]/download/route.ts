import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@aah/db";
import { serverEnv } from "@/lib/env";
import { requireSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Hand out a 60-second signed link to the original file, after a scoped lookup. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const doc = await session.db.document.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const inline = request.nextUrl.searchParams.get("view") === "1";
  const { data, error } = await supabaseAdmin()
    .storage.from(serverEnv().documentsBucket)
    .createSignedUrl(doc.storagePath, 60, inline ? undefined : { download: doc.filename });
  if (error || !data) {
    console.error("signed download url failed", { documentId: doc.id, reason: error?.message });
    return new NextResponse("Storage unavailable", { status: 502 });
  }

  await audit(session.ctx, { action: "document.downloaded", entityType: "Document", entityId: doc.id, clientId: doc.clientId }, session.user.name);
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
