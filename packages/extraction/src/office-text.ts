import { fromBuffer, type Entry, type ZipFile } from "yauzl";

const MAX_XML_BYTES = 512_000;
const MAX_ARCHIVE_ENTRIES = 5000;
const MAX_TEXT = 24_000;
const CONTENT_PART = /^(word\/document\.xml|xl\/(?:sharedStrings|workbook|worksheets\/sheet[1-3])\.xml|ppt\/slides\/slide[1-6]\.xml|content\.xml)$/;
const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function textFromXml(xml: string): string {
  const withoutTags = xml
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<\/(?:w:p|a:p|text:[ph]|row)>/g, "\n")
    .replace(/<\/(?:w:t|a:t|t|v|c|si)>/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => XML_ENTITIES[name] ?? "");
  return withoutTags.replace(/[\t ]+/g, " ").replace(/\n\s*\n/g, "\n").trim();
}

function readXml(zip: ZipFile, entry: Entry): Promise<string> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) return reject(error ?? new Error("Could not open document content"));
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("error", reject);
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_XML_BYTES) {
          stream.destroy(new Error("Document content exceeds the extraction limit"));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => resolve(textFromXml(Buffer.concat(chunks).toString("utf8"))));
    });
  });
}

export function readOfficeText(data: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error("Could not open document"));
      if (zip.entryCount > MAX_ARCHIVE_ENTRIES) {
        zip.close();
        return resolve("");
      }
      let text = "";
      zip.on("error", reject);
      zip.on("end", () => resolve(text));
      zip.on("entry", (entry: Entry) => {
        if (!CONTENT_PART.test(entry.fileName) || entry.uncompressedSize > MAX_XML_BYTES) {
          zip.readEntry();
          return;
        }
        void readXml(zip, entry).then((part) => {
          text = `${text}\n${part}`.trim().slice(0, MAX_TEXT);
          if (text.length >= MAX_TEXT) {
            zip.close();
            resolve(text);
          } else {
            zip.readEntry();
          }
        }).catch((reason: unknown) => {
          zip.close();
          reject(reason);
        });
      });
      zip.readEntry();
    });
  });
}
