export { DOCUMENT_KINDS, type DocumentKindValue } from "@aah/core";

export const MAX_INLINE_PREVIEW_BYTES = 12 * 1024 * 1024;

export function documentPreviewKind(mimeType: string): "pdf" | "image" | null {
  if (mimeType.toLowerCase() === "application/pdf") return "pdf";
  return /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(mimeType) ? "image" : null;
}
