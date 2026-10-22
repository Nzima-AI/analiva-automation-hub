import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for stored credentials (mailbox passwords, later API tokens).
 * Format: "v1:<iv b64url>:<tag b64url>:<ciphertext b64url>". The key is 32 bytes,
 * supplied base64-encoded via SECRETS_KEY. Never log plaintext or ciphertext.
 */
const VERSION = "v1";

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("SECRETS_KEY must be 32 bytes, base64 encoded");
  return key;
}

export function encryptSecret(plaintext: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptSecret(payload: string, base64Key: string): string {
  const [version, iv, tag, ciphertext] = payload.split(":");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(base64Key), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
