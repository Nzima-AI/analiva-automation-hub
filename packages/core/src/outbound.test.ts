import { describe, expect, it } from "vitest";
import { activeMandate, checkMandate, renderMessage, renderReminder, resolveSender } from "./outbound";

const now = new Date("2026-10-23T12:00:00Z");
const valid = { scope: "Email and documents", signedAt: new Date("2026-01-01"), expiresAt: new Date("2027-01-01"), revokedAt: null };

describe("mandates", () => {
  it("accepts a current mandate covering email", () => {
    expect(checkMandate(valid, now)).toEqual({ valid: true });
  });
  it("rejects missing, expired, revoked, future or out-of-scope mandates", () => {
    expect(checkMandate(null, now).valid).toBe(false);
    expect(checkMandate({ ...valid, expiresAt: new Date("2026-06-01") }, now)).toMatchObject({ valid: false, reason: expect.stringMatching(/expired/) });
    expect(checkMandate({ ...valid, revokedAt: new Date("2026-05-01") }, now)).toMatchObject({ valid: false, reason: expect.stringMatching(/revoked/) });
    expect(checkMandate({ ...valid, signedAt: new Date("2027-01-01"), expiresAt: null }, now).valid).toBe(false);
    expect(checkMandate({ ...valid, scope: "Payroll only" }, now).valid).toBe(false);
  });
  it("picks the newest valid one", () => {
    const old = { ...valid, signedAt: new Date("2025-01-01"), expiresAt: null };
    const expired = { ...valid, signedAt: new Date("2026-02-01"), expiresAt: new Date("2026-03-01") };
    expect(activeMandate([old, expired, valid], now)).toBe(valid);
    expect(activeMandate([expired], now)).toBeNull();
  });
});

describe("resolveSender", () => {
  const base = {
    practice: { name: "Analiva", email: "dalene@taccspro.co.za" },
    client: { name: "Mokoena Plumbing (Pty) Ltd", tradingName: "Mokoena Plumbing", email: "accounts@mokoena.example" },
    mailbox: { emailAddress: "taccspro@nzimasolutions.co.za", displayName: "Analiva Accounting" },
    now,
  };
  it("sends as the practice", () => {
    const s = resolveSender({ ...base, sendAs: "PRACTICE", mandate: null });
    expect(s).toMatchObject({ ok: true, fromName: "Analiva Accounting", fromAddress: "taccspro@nzimasolutions.co.za", replyTo: "dalene@taccspro.co.za", footer: "Sent by Analiva." });
  });
  it("sends as the client: client's name, practice mailbox, client reply-to, disclosed footer", () => {
    const s = resolveSender({ ...base, sendAs: "CLIENT", mandate: valid });
    expect(s).toMatchObject({ ok: true, fromName: "Mokoena Plumbing", fromAddress: "taccspro@nzimasolutions.co.za", replyTo: "accounts@mokoena.example" });
    if (s.ok) expect(s.footer).toBe("Sent on behalf of Mokoena Plumbing by Analiva.");
  });
  it("refuses to send as the client without a valid mandate", () => {
    expect(resolveSender({ ...base, sendAs: "CLIENT", mandate: null })).toMatchObject({ ok: false });
  });
});

describe("templates", () => {
  const inv = { invoiceNumber: "INV-<9>", issueDate: new Date("2026-09-01"), dueDate: new Date("2026-09-30"), totalCents: 115000n, outstandingCents: 115000n, currency: "ZAR" };
  it("renders a reminder with escaped HTML and plain text", () => {
    const r = renderReminder({ recipientName: "Thandi", signature: "Mokoena Plumbing", footer: "Sent on behalf of Mokoena Plumbing by Analiva.", brandName: "Mokoena Plumbing", brandColour: "#0F6B57", invoice: inv });
    expect(r.subject).toMatch(/^Overdue: invoice INV-<9> \(R 1 150,00\)$/);
    expect(r.html).toContain("INV-&lt;9&gt;");
    expect(r.html).not.toContain("INV-<9>");
    expect(r.text).toContain("Amount outstanding: R 1 150,00");
    expect(r.text).toContain("Sent on behalf of Mokoena Plumbing by Analiva.");
  });
  it("falls back to the brand colour when given junk", () => {
    const r = renderMessage({ subject: "Hi", body: "Line 1\n\nLine 2", signature: "Analiva", footer: "Sent by Analiva.", brandName: "Analiva", brandColour: "red;background:url(x)" });
    expect(r.html).toContain("#00AEEF");
    expect(r.html).not.toContain("url(x)");
  });
});
