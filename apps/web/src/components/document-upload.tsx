"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { finishUpload, startUpload } from "@/app/(app)/documents/actions";
import { Button, Notice, Select } from "@/components/ui";
import { DOCUMENT_KINDS } from "@/lib/documents";
import { humanise } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/browser";

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function DocumentUpload({
  bucket,
  clientId,
  clients,
}: {
  bucket: string;
  /** Fixed client (client page / client login). */
  clientId?: string | null;
  /** When no fixed client, let staff pick one. */
  clients?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<string>("INVOICE");
  const [pickedClient, setPickedClient] = useState<string>("");
  const [status, setStatus] = useState<{ tone: "danger" | "brand" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setStatus(null);
    const targetClient = clientId !== undefined ? clientId : pickedClient || null;
    const messages: string[] = [];
    let failed = false;

    for (const file of files) {
      const mimeType = file.type || "application/octet-stream";
      const start = await startUpload({ clientId: targetClient, filename: file.name, mimeType, sizeBytes: file.size });
      if (!start.ok) {
        messages.push(`${file.name}: ${start.error}`);
        failed = true;
        continue;
      }
      const { error } = await supabaseBrowser().storage.from(bucket).uploadToSignedUrl(start.path, start.token, file, { contentType: mimeType });
      if (error) {
        messages.push(`${file.name}: upload failed`);
        failed = true;
        continue;
      }
      const done = await finishUpload({
        path: start.path,
        clientId: targetClient,
        kind: kind as (typeof DOCUMENT_KINDS)[number],
        filename: file.name,
        mimeType,
        sha256: await sha256Hex(file),
      });
      if (!done.ok) {
        messages.push(`${file.name}: ${done.error}`);
        failed = true;
      } else if (done.duplicateOf) {
        messages.push(`${file.name}: saved, but an identical file was already on record.`);
      }
    }

    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    setStatus(
      messages.length
        ? { tone: failed ? "danger" : "warn", text: messages.join(" ") }
        : { tone: "brand", text: `${files.length} file${files.length === 1 ? "" : "s"} uploaded.` },
    );
    router.refresh();
  }

  return (
    <form onSubmit={upload} className="space-y-3">
      {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
      <div className="flex flex-wrap items-center gap-2">
        {clientId === undefined && clients ? (
          <Select value={pickedClient} onChange={(e) => setPickedClient(e.target.value)} className="max-w-[16rem]" aria-label="Client">
            <option value="">Practice (no client)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="max-w-[12rem]" aria-label="Document type">
          {DOCUMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {humanise(k)}
            </option>
          ))}
        </Select>
        <input ref={fileRef} type="file" multiple required className="text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-panel file:px-3 file:py-1.5 file:text-sm" />
        <Button type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </form>
  );
}
