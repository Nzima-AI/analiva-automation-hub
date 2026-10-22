import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { presetForDomain } from "./mail-presets";
import { decryptSecret, encryptSecret } from "./secrets";
import { applyTenantScope } from "./tenancy";

const key = randomBytes(32).toString("base64");

describe("secrets", () => {
  it("round-trips and never contains the plaintext", () => {
    const enc = encryptSecret("p@ss word!", key);
    expect(enc).not.toContain("p@ss");
    expect(decryptSecret(enc, key)).toBe("p@ss word!");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("x", key)).not.toBe(encryptSecret("x", key));
  });

  it("rejects tampering and wrong keys", () => {
    const enc = encryptSecret("secret", key);
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow();
  });

  it("rejects short keys", () => {
    expect(() => encryptSecret("x", randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("presetForDomain", () => {
  it("detects Microsoft 365", () => {
    expect(presetForDomain("acme.co.za", ["acme-co-za.mail.protection.outlook.com"]).provider).toBe("MICROSOFT_365");
  });
  it("detects Google", () => {
    expect(presetForDomain("acme.co.za", ["aspmx.l.google.com"]).smtpHost).toBe("smtp.gmail.com");
  });
  it("uses the domain's own mail server for cPanel hosts", () => {
    const p = presetForDomain("taccspro.co.za", ["mail.taccspro.co.za"]);
    expect(p).toMatchObject({ provider: "IMAP_SMTP", imapHost: "mail.taccspro.co.za", smtpPort: 465 });
  });
  it("handles RDSA-hosted domains", () => {
    expect(presetForDomain("nzimasolutions.co.za", ["mx1.rdsa-mail.com"]).imapHost).toBe("mail.nzimasolutions.co.za");
  });
});

describe("MailAccount scoping", () => {
  it("is practice-only: client roles are refused", () => {
    expect(() =>
      applyTenantScope("MailAccount", "findMany", {}, { practiceId: "p1", userId: "u", role: "CLIENT", clientId: "c" }),
    ).toThrow();
    const out = applyTenantScope("MailAccount", "findMany", {}, { practiceId: "p1", userId: "u", role: "OWNER", clientId: null });
    expect(out.where).toEqual({ AND: [{ practiceId: "p1" }] });
  });
});
