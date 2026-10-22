/**
 * Email classification and client matching, rule-based.
 */

export type EmailKind = "INVOICE" | "STATEMENT" | "CIPC" | "QUERY" | "OTHER";

export interface EmailForClassification {
  subject: string;
  text: string;
  attachments: Array<{ filename: string; mimeType: string }>;
}

const DOC_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp|tiff|heic))$/i;
const INVOICE_WORDS = /\b(?:tax\s*invoice|invoice|bill|account\s*(?:due|statement)?|payment\s*due|amount\s*due|remittance|receipt)\b|\binv[\s#_-]?\d/i;
const STATEMENT_WORDS = /\bstatement\b/i;
const CIPC_WORDS = /\b(cipc|annual\s*return|beneficial\s*ownership|company\s*registration|b-?bbee|cor\s*\d{2})\b/i;

export function isDocumentAttachment(a: { mimeType: string; filename: string }): boolean {
  return DOC_TYPES.test(a.mimeType) || /\.(pdf|png|jpe?g|webp|tiff?|heic)$/i.test(a.filename);
}

export function classifyEmail(e: EmailForClassification): { kind: EmailKind; reason: string } {
  const docs = e.attachments.filter(isDocumentAttachment);
  const haystack = `${e.subject}\n${docs.map((d) => d.filename).join("\n")}\n${e.text.slice(0, 4000)}`;
  if (CIPC_WORDS.test(haystack)) return { kind: "CIPC", reason: "mentions CIPC" };
  if (docs.length > 0 && STATEMENT_WORDS.test(`${e.subject} ${docs.map((d) => d.filename).join(" ")}`) && !/invoice/i.test(e.subject)) {
    return { kind: "STATEMENT", reason: "statement attached" };
  }
  if (docs.length > 0 && INVOICE_WORDS.test(haystack)) return { kind: "INVOICE", reason: "invoice words with a document attached" };
  if (docs.length > 0) return { kind: "OTHER", reason: "document attached, no invoice words" };
  if (/\?/.test(e.text.slice(0, 2000)) || /\b(please|query|question|help|assist)\b/i.test(e.subject)) return { kind: "QUERY", reason: "looks like a question" };
  return { kind: "OTHER", reason: "no document" };
}

export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com",
  "webmail.co.za", "mweb.co.za", "telkomsa.net", "vodamail.co.za", "iafrica.com", "absamail.co.za", "lantic.net", "afrihost.co.za",
]);

export interface MatchableClient {
  id: string;
  name: string;
  tradingName: string | null;
  email: string | null;
  emailDomains: string[];
  vatNumber: string | null;
  registrationNumber: string | null;
  contactEmails: string[];
}

export interface SenderRuleInput {
  /** a full address or "@domain" */
  pattern: string;
  clientId: string;
}

export interface MatchInput {
  senderEmail: string;
  documentText: string;
  subject: string;
}

export interface MatchCandidate {
  clientId: string;
  score: number;
  reason: string;
}

export interface MatchResult {
  status: "MATCHED" | "AMBIGUOUS" | "UNMATCHED";
  clientId: string | null;
  confidence: number;
  candidates: MatchCandidate[];
}

const MATCH_THRESHOLD = 0.6;

function nameInText(name: string, text: string): boolean {
  const core = name
    .replace(/\((pty|proprietary)\)|\b(ltd|limited|cc|inc|npc|trust)\b\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (core.length < 4) return false;
  return new RegExp(`(^|[^a-z0-9])${core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}([^a-z0-9]|$)`, "i").test(text);
}

/**
 * Score every client against the email. More than one plausible client is
 * AMBIGUOUS: CLAUDE.md §7 says ask, never guess.
 */
export function matchClient(input: MatchInput, clients: MatchableClient[], rules: SenderRuleInput[] = []): MatchResult {
  const sender = input.senderEmail.trim().toLowerCase();
  const domain = sender.split("@")[1] ?? "";
  const text = `${input.subject}\n${input.documentText}`;
  const compactText = text.replace(/\s/g, "");

  const scored: MatchCandidate[] = [];
  for (const c of clients) {
    const signals: Array<[number, string]> = [];
    if (rules.some((r) => r.clientId === c.id && r.pattern.toLowerCase() === sender)) signals.push([0.97, "sender assigned to this client before"]);
    if (c.email?.toLowerCase() === sender || c.contactEmails.some((e) => e.toLowerCase() === sender)) signals.push([0.95, "sender is a client contact"]);
    if (domain && !FREE_MAIL_DOMAINS.has(domain)) {
      if (rules.some((r) => r.clientId === c.id && r.pattern.toLowerCase() === `@${domain}`)) signals.push([0.92, "sender domain assigned before"]);
      if (c.emailDomains.includes(domain)) signals.push([0.9, "sender domain belongs to client"]);
    }
    if (c.vatNumber && compactText.includes(c.vatNumber)) signals.push([0.9, "client VAT number on document"]);
    if (c.registrationNumber && text.includes(c.registrationNumber)) signals.push([0.85, "client registration number on document"]);
    if (nameInText(c.name, text) || (c.tradingName && nameInText(c.tradingName, text))) signals.push([0.7, "client name on document"]);
    if (signals.length === 0) continue;
    signals.sort((a, b) => b[0] - a[0]);
    // Two independent signals agreeing is stronger than either alone.
    const score = Math.min(0.99, signals[0]![0] + (signals.length > 1 ? 0.04 : 0));
    scored.push({ clientId: c.id, score: Math.round(score * 100) / 100, reason: signals.map((s) => s[1]).join("; ") });
  }

  scored.sort((a, b) => b.score - a.score);
  const plausible = scored.filter((s) => s.score >= MATCH_THRESHOLD);
  if (plausible.length === 0) return { status: "UNMATCHED", clientId: null, confidence: 0, candidates: scored.slice(0, 5) };
  if (plausible.length > 1) return { status: "AMBIGUOUS", clientId: null, confidence: 0, candidates: plausible.slice(0, 5) };
  return { status: "MATCHED", clientId: plausible[0]!.clientId, confidence: plausible[0]!.score, candidates: plausible };
}
