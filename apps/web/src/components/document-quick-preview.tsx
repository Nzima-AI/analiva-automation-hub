"use client";

import { ArrowUpRight, File, FilePdf } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { documentPreviewKind, MAX_INLINE_PREVIEW_BYTES } from "@/lib/documents";

interface PreviewDocument {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export function DocumentQuickPreview({ document }: { document: PreviewDocument }) {
  const { id, filename, mimeType, sizeBytes } = document;
  const kind = documentPreviewKind(mimeType);
  const canPreview = Boolean(kind && sizeBytes <= MAX_INLINE_PREVIEW_BYTES);
  const surface = useRef<HTMLAnchorElement>(null);
  const [image, setImage] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const target = surface.current;
    if (!target || !canPreview) return;
    const controller = new AbortController();
    let url: string | undefined;

    async function load() {
      try {
        const response = await fetch(`/documents/${id}/download?preview=1`, {
          signal: controller.signal,
          redirect: "error",
        });
        if (!response.ok) throw new Error("Preview unavailable");
        let blob = await response.blob();
        if (kind === "pdf") {
          const { getResolvedPDFJS, renderPageAsImage } = await import("unpdf");
          if (controller.signal.aborted) return;
          const { getDocument } = await getResolvedPDFJS();
          const task = getDocument({
            data: new Uint8Array(await blob.arrayBuffer()),
            maxImageSize: 16_000_000,
            useSystemFonts: true,
          });
          try {
            const pdf = await task.promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1 });
            const size = viewport.width > viewport.height ? { width: 720 } : { height: 840 };
            if (controller.signal.aborted) return;
            blob = new Blob([await renderPageAsImage(pdf, 1, size)], { type: "image/png" });
          } finally {
            await task.destroy();
          }
        }
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setImage(url);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      void load();
    }, { rootMargin: "160px" });
    observer.observe(target);
    return () => {
      observer.disconnect();
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [canPreview, id, kind]);

  const showing = Boolean(image && !failed);
  const label = showing ? (kind === "pdf" ? "Page 1 preview" : "Image preview") : failed || !canPreview ? "Preview unavailable" : "Loading preview";
  const FileIcon = kind === "pdf" ? FilePdf : File;

  return (
    <a
      ref={surface}
      href={`/documents/${id}/download?view=1`}
      target="_blank"
      rel="noopener"
      className="document-quick-preview"
      aria-label={`View document: ${filename} (opens in a new tab)`}
    >
      <div className="document-preview-stage">
        <span className="document-preview-label"><FileIcon size={14} aria-hidden />{label}</span>
        {showing ? (
          // The image is an on-device object URL created from the authenticated preview response.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="document-preview-paper" src={image} alt="" onError={() => setFailed(true)} />
        ) : (
          <div className="document-preview-placeholder" aria-hidden><FileIcon size={38} weight="duotone" /></div>
        )}
        <span className="document-preview-action">View document <ArrowUpRight size={15} aria-hidden /></span>
      </div>
      <span className="document-preview-filename" title={filename}>{filename}</span>
    </a>
  );
}
