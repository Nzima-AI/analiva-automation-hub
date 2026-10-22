/**
 * Get readable text out of an attachment, for the rule-based invoice reader.
 * - PDFs: the embedded text layer (most emailed invoices are generated, not scanned).
 * - Images: OCR with Tesseract (slow; English only).
 * - Scanned PDFs (no text layer): reported as such for manual capture.
 *   TODO(confirm): render scanned PDF pages to images for OCR if this is common.
 */

export type ExtractionMethod = "pdf-text" | "ocr" | "pdf-no-text" | "unsupported" | "failed";

export interface ExtractionResult {
  text: string;
  method: ExtractionMethod;
  note: string | null;
}

const MIN_TEXT_CHARS = 30;
const OCR_TIMEOUT_MS = 60_000;

export async function extractText(data: Uint8Array, mimeType: string, filename: string): Promise<ExtractionResult> {
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(filename);
  const isImage = /^image\/(png|jpe?g|webp|tiff|bmp)$/i.test(mimeType) || /\.(png|jpe?g|webp|tiff?|bmp)$/i.test(filename);

  try {
    if (isPdf) {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { text } = await pdfText(pdf, { mergePages: true });
      const clean = text.trim();
      if (clean.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
        return { text: "", method: "pdf-no-text", note: "Scanned PDF with no text layer; capture manually." };
      }
      return { text: clean, method: "pdf-text", note: null };
    }
    if (isImage) {
      return await ocr(data);
    }
    return { text: "", method: "unsupported", note: `Can't read ${mimeType || filename}` };
  } catch (e) {
    return { text: "", method: "failed", note: `Could not read the file: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}` };
  }
}

async function ocr(data: Uint8Array): Promise<ExtractionResult> {
  const { createWorker } = await import("tesseract.js");
  // Language data is downloaded once per cold start and cached in /tmp.
  const worker = await createWorker("eng", 1, { cachePath: "/tmp/tesseract-cache" });
  try {
    const result = await Promise.race([
      worker.recognize(Buffer.from(data)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("OCR timed out")), OCR_TIMEOUT_MS)),
    ]);
    const text = result.data.text.trim();
    if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
      return { text, method: "ocr", note: "OCR found very little text; check the image quality." };
    }
    return { text, method: "ocr", note: "Read with OCR; double-check the numbers." };
  } finally {
    await worker.terminate();
  }
}
