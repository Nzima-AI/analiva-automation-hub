"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

type DesktopPicker = (options: {
  startIn: "desktop";
  mode: "readwrite";
}) => Promise<FileSystemDirectoryHandle>;

export function SaveInvoiceToDesktop({ documentId, filename }: { documentId: string; filename: string }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const downloadUrl = `/documents/${documentId}/download`;

  async function save() {
    const browser = window as Window & { showDirectoryPicker?: DesktopPicker };
    if (!browser.showDirectoryPicker) {
      setMessage("Use Chrome or Edge to save directly to the Desktop folder, or use Download original.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const desktop = await browser.showDirectoryPicker({ startIn: "desktop", mode: "readwrite" });
      const response = await fetch(`${downloadUrl}?desktop=1`, { redirect: "error" });
      if (!response.ok || !response.body) throw new Error("Invoice download failed");

      const folder = await desktop.getDirectoryHandle("Analiva Invoices", { create: true });
      const safeName = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
      const dot = safeName.lastIndexOf(".");
      const extension = dot > 0 ? safeName.slice(dot) : "";
      const basename = dot > 0 ? safeName.slice(0, dot) : safeName;
      const savedName = `${basename} - ${documentId}${extension}`;
      const file = await folder.getFileHandle(savedName, { create: true });
      await response.body.pipeTo(await file.createWritable());
      setMessage(`Saved in ${desktop.name}/${folder.name}.`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage("Couldn’t save the invoice. Check folder permissions or use Download original.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save to Desktop"}
        </Button>
        <a href={downloadUrl} className="text-sm text-brand hover:underline">Download original</a>
      </div>
      <p role="status" className="text-sm text-muted">{message || "Select Desktop when the folder picker opens."}</p>
    </div>
  );
}
