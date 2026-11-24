/**
 * Marketing helpers: contact import (CSV and phone .vcf), phone numbers, tags,
 * merge fields, opt-out replies and follow-up audiences. Pure functions, no I/O.
 */

/**
 * A phone number as WhatsApp wants it: country code and digits, no "+".
 * Local South African numbers (0821234567) become 27821234567. Null when it can't be a mobile number.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountry = "27"): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = defaultCountry + digits.slice(1);
  } else if (digits.length <= 10 && !digits.startsWith(defaultCountry)) {
    digits = defaultCountry + digits;
  }
  if (digits.startsWith("270")) digits = "27" + digits.slice(3); // +27 (0)82 ...
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.startsWith("27") && digits.length !== 11) return null;
  return digits;
}

/** Tags typed as "past client, payroll; Joburg" become ["past client", "payroll", "joburg"]. */
export function parseTags(input: string | string[] | null | undefined): string[] {
  const parts = (Array.isArray(input) ? input : [input ?? ""]).flatMap((value) => value.split(/[,;|]|:::/));
  const tags = parts.map((tag) => tag.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean);
  return [...new Set(tags)].slice(0, 20);
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export interface MergeContact {
  name: string;
  company: string;
}

/** Fills {{firstName}}, {{name}}, {{company}} and {{link}}. Unknown fields are left as typed. */
export function renderMerge(text: string, contact: MergeContact, link: string | null): string {
  const values: Record<string, string> = {
    firstname: firstNameOf(contact.name) || "there",
    name: contact.name,
    company: contact.company,
    link: link ?? "",
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key.toLowerCase()] ?? match);
}

/** The merge fields a WhatsApp template's {{1}}, {{2}}... can be filled from. */
export const TEMPLATE_FIELDS = { firstName: "First name", name: "Full name", company: "Company", link: "Tracked link" } as const;
export type TemplateField = keyof typeof TEMPLATE_FIELDS;

export function templateValues(fields: readonly string[], contact: MergeContact, link: string | null): string[] {
  return fields.map((field) => renderMerge(`{{${field}}}`, contact, link) || "-");
}

/** A reply that means "stop sending me marketing". */
export function isOptOutReply(text: string | null | undefined): boolean {
  if (!text) return false;
  return /^\s*(stop|stop all|stop promotions|unsubscribe|opt[\s-]?out|remove me|cancel|uitteken|stop asseblief)\s*[.!]*\s*$/i.test(text);
}

export type FollowUpRuleName = "NOT_CLICKED" | "CLICKED_NOT_SIGNED_UP" | "SIGNED_UP";

/** Whether a recipient of the first campaign should get the follow-up. */
export function followUpMatches(
  rule: FollowUpRuleName,
  send: { status: string; clickedAt: Date | null; signedUpAt: Date | null },
): boolean {
  if (send.status === "FAILED" || send.status === "SKIPPED" || send.status === "QUEUED") return false;
  if (rule === "NOT_CLICKED") return !send.clickedAt && !send.signedUpAt;
  if (rule === "CLICKED_NOT_SIGNED_UP") return Boolean(send.clickedAt) && !send.signedUpAt;
  return Boolean(send.signedUpAt);
}

export interface ImportedContact {
  name: string;
  phone: string | null;
  email: string | null;
  company: string;
  tags: string[];
  interest: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (value: string | undefined) => {
  const email = value?.trim().toLowerCase() ?? "";
  return EMAIL.test(email) ? email.slice(0, 200) : null;
};

const pick = (header: string[], ...names: RegExp[]) => {
  for (const name of names) {
    const index = header.findIndex((column) => name.test(column.trim()));
    if (index !== -1) return index;
  }
  return -1;
};

/**
 * Rows from a spreadsheet or a Google/Outlook contacts export. Column names are matched loosely:
 * name (or first + last name), phone/mobile, email, company/organisation, tags/labels/groups, interest.
 */
export function contactsFromCsv(rows: string[][]): { contacts: ImportedContact[]; problems: string[] } {
  const [header = [], ...body] = rows;
  const col = {
    name: pick(header, /^(full )?name$/i, /^display name$/i),
    first: pick(header, /^first name$/i, /^given name$/i),
    last: pick(header, /^last name$/i, /^(family name|surname)$/i),
    phone: pick(header, /^(mobile|cell|cellphone|whatsapp|phone)( number)?$/i, /^phone 1 - value$/i, /^mobile phone$/i, /phone/i),
    email: pick(header, /^e-?mail( address)?$/i, /^e-mail 1 - value$/i, /e-?mail/i),
    company: pick(header, /^(company|business|organi[sz]ation)( name)?$/i, /^organi[sz]ation 1 - name$/i),
    tags: pick(header, /^(tags?|labels?|groups?|segments?)$/i, /^group membership$/i),
    interest: pick(header, /^interest$/i, /^service$/i),
  };
  const problems: string[] = [];
  if (col.name === -1 && col.first === -1) problems.push("No name column (name, or first name and last name).");
  if (col.phone === -1 && col.email === -1) problems.push("No phone or email column.");
  if (problems.length) return { contacts: [], problems };

  const contacts: ImportedContact[] = [];
  body.forEach((row, index) => {
    const at = (i: number) => (i === -1 ? "" : (row[i] ?? "").trim());
    const name = (at(col.name) || [at(col.first), at(col.last)].filter(Boolean).join(" ")).slice(0, 200);
    // A contacts export can hold several numbers in one cell ("082 ... ::: 011 ...").
    const phone = at(col.phone).split(/:::|;|,|\//).map((part) => normalizePhone(part)).find(Boolean) ?? null;
    const email = cleanEmail(at(col.email).split(/:::|;|,/)[0]);
    if (!name && !phone && !email) return; // blank line
    if (!phone && !email) {
      problems.push(`Row ${index + 2}: ${name || "unnamed"} has no usable phone number or email.`);
      return;
    }
    contacts.push({
      name: name || email || phone!,
      phone,
      email,
      company: at(col.company).slice(0, 200),
      tags: parseTags(at(col.tags).replace(/\* ?myContacts/gi, "")),
      interest: at(col.interest).toUpperCase() || null,
    });
  });
  return { contacts, problems };
}

/** Contacts from a phone's "Export contacts" .vcf file (vCard 2.1, 3.0 or 4.0). */
export function contactsFromVcf(text: string): { contacts: ImportedContact[]; problems: string[] } {
  // Unfold continuation lines (RFC 6350 3.2), then split into cards.
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").replace(/=\n/g, "");
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1).map((card) => card.split(/END:VCARD/i)[0] ?? "");
  const contacts: ImportedContact[] = [];
  const problems: string[] = [];
  const decode = (value: string, params: string) =>
    /QUOTED-PRINTABLE/i.test(params)
      ? decodeURIComponent(value.replace(/=([0-9A-F]{2})/gi, "%$1").replace(/%(?![0-9A-F]{2})/gi, "%25"))
      : value.replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ");
  cards.forEach((card, index) => {
    let name = "";
    let structured = "";
    let company = "";
    const phones: string[] = [];
    const emails: string[] = [];
    let tags: string[] = [];
    for (const line of card.split("\n")) {
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const [property = "", ...rest] = line.slice(0, colon).split(";");
      const params = rest.join(";");
      const key = property.replace(/^item\d+\./i, "").toUpperCase();
      const value = decode(line.slice(colon + 1).trim(), params);
      if (key === "FN") name = value;
      else if (key === "N") structured = value.split(";").slice(0, 2).reverse().filter(Boolean).join(" ");
      else if (key === "TEL") phones.push(value);
      else if (key === "EMAIL") emails.push(value);
      else if (key === "ORG") company = value.split(";")[0] ?? "";
      else if (key === "CATEGORIES") tags = parseTags(value);
    }
    const phone = phones.map((raw) => normalizePhone(raw)).find(Boolean) ?? null;
    const email = emails.map(cleanEmail).find(Boolean) ?? null;
    const display = (name || structured).trim().slice(0, 200);
    if (!phone && !email) {
      if (display) problems.push(`Card ${index + 1}: ${display} has no usable phone number or email.`);
      return;
    }
    contacts.push({ name: display || email || phone!, phone, email, company: company.trim().slice(0, 200), tags, interest: null });
  });
  return { contacts, problems };
}

/** Merge duplicates inside one import file: same phone or same email is one person. */
export function dedupeContacts(contacts: ImportedContact[]): ImportedContact[] {
  const out: ImportedContact[] = [];
  const byKey = new Map<string, ImportedContact>();
  for (const contact of contacts) {
    const existing = (contact.phone && byKey.get(`p:${contact.phone}`)) || (contact.email && byKey.get(`e:${contact.email}`));
    if (existing) {
      existing.phone ??= contact.phone;
      existing.email ??= contact.email;
      existing.company ||= contact.company;
      existing.tags = parseTags([...existing.tags, ...contact.tags]);
      if (contact.phone) byKey.set(`p:${contact.phone}`, existing);
      if (contact.email) byKey.set(`e:${contact.email}`, existing);
      continue;
    }
    const copy = { ...contact, tags: [...contact.tags] };
    out.push(copy);
    if (copy.phone) byKey.set(`p:${copy.phone}`, copy);
    if (copy.email) byKey.set(`e:${copy.email}`, copy);
  }
  return out;
}
