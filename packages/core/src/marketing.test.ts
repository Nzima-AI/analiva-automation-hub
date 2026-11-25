import { describe, expect, it } from "vitest";
import {
  contactsFromCsv,
  contactsFromVcf,
  dedupeContacts,
  followUpMatches,
  isOptOutReply,
  normalizePhone,
  parseTags,
  renderMerge,
  templateValues,
} from "./marketing";

describe("normalizePhone", () => {
  it("turns South African numbers into WhatsApp format", () => {
    expect(normalizePhone("082 123 4567")).toBe("27821234567");
    expect(normalizePhone("+27 82 123 4567")).toBe("27821234567");
    expect(normalizePhone("+27 (0)82 123 4567")).toBe("27821234567");
    expect(normalizePhone("0027821234567")).toBe("27821234567");
    expect(normalizePhone("27821234567")).toBe("27821234567");
    expect(normalizePhone("821234567")).toBe("27821234567");
  });
  it("keeps foreign numbers and rejects junk", () => {
    expect(normalizePhone("+44 7700 900123")).toBe("447700900123");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+27 82 123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("tags and merge fields", () => {
  it("splits, trims, lowercases and dedupes tags", () => {
    expect(parseTags("Past client, Payroll; payroll | Joburg ::: VIP")).toEqual(["past client", "payroll", "joburg", "vip"]);
    expect(parseTags(["a, b", "B"])).toEqual(["a", "b"]);
  });
  it("fills merge fields and leaves unknown ones", () => {
    const text = "Hi {{firstName}}, {{company}} can sign up at {{ link }}. {{other}}";
    expect(renderMerge(text, { name: "Thandi Nkosi", company: "Nkosi Trading" }, "https://x.example/r/abc"))
      .toBe("Hi Thandi, Nkosi Trading can sign up at https://x.example/r/abc. {{other}}");
    expect(renderMerge("Hi {{firstName}}", { name: "", company: "" }, null)).toBe("Hi there");
  });
  it("builds WhatsApp template values, never blank", () => {
    expect(templateValues(["firstName", "company"], { name: "Sipho Dube", company: "" }, null)).toEqual(["Sipho", "-"]);
  });
});

describe("opt-out replies", () => {
  it("recognises stop words on their own", () => {
    for (const text of ["STOP", "stop.", " Unsubscribe ", "opt out", "Stop promotions", "remove me"]) expect(isOptOutReply(text)).toBe(true);
  });
  it("ignores normal replies that mention stop", () => {
    expect(isOptOutReply("Please don't stop, I'm interested")).toBe(false);
    expect(isOptOutReply("Yes please")).toBe(false);
  });
});

describe("follow-ups", () => {
  const sent = { status: "DELIVERED", clickedAt: null, signedUpAt: null };
  it("targets the right recipients", () => {
    expect(followUpMatches("NOT_CLICKED", sent)).toBe(true);
    expect(followUpMatches("NOT_CLICKED", { ...sent, clickedAt: new Date() })).toBe(false);
    expect(followUpMatches("CLICKED_NOT_SIGNED_UP", { ...sent, clickedAt: new Date() })).toBe(true);
    expect(followUpMatches("SIGNED_UP", { ...sent, signedUpAt: new Date() })).toBe(true);
    expect(followUpMatches("NOT_CLICKED", { ...sent, status: "FAILED" })).toBe(false);
  });
});

describe("contact import", () => {
  it("reads a plain spreadsheet", () => {
    const { contacts, problems } = contactsFromCsv([
      ["Name", "Mobile", "Email", "Company", "Tags"],
      ["Thandi Nkosi", "082 123 4567", "THANDI@nkosi.example", "Nkosi Trading", "past client, payroll"],
      ["No Contact", "", "", "", ""],
      ["", "", "", "", ""],
    ]);
    expect(contacts).toEqual([{ name: "Thandi Nkosi", phone: "27821234567", email: "thandi@nkosi.example", company: "Nkosi Trading", tags: ["past client", "payroll"], interest: null, region: null }]);
    expect(problems).toEqual(["Row 3: No Contact has no usable phone number or email."]);
  });
  it("reads a Google contacts export", () => {
    const { contacts } = contactsFromCsv([
      ["First Name", "Last Name", "Organization 1 - Name", "E-mail 1 - Value", "Phone 1 - Value", "Labels"],
      ["Sipho", "Dube", "Dube CC", "", "+27 71 555 0101 ::: 011 555 0000", "* myContacts ::: Clients"],
    ]);
    expect(contacts[0]).toMatchObject({ name: "Sipho Dube", phone: "27715550101", company: "Dube CC", tags: ["clients"] });
  });
  it("reads a region or province column", () => {
    const { contacts } = contactsFromCsv([["Name", "Mobile", "Province"], ["Sipho", "0711112222", "Gauteng"]]);
    expect(contacts[0]?.region).toBe("Gauteng");
  });
  it("explains a file it can't use", () => {
    expect(contactsFromCsv([["Company", "Notes"], ["A", "B"]]).problems).toHaveLength(2);
  });
  it("reads a phone .vcf export, including folded and quoted-printable lines", () => {
    const vcf = [
      "BEGIN:VCARD", "VERSION:3.0", "FN:Lerato Mokoena", "N:Mokoena;Lerato;;;", "ORG:Mokoena Holdings;", "TEL;TYPE=CELL:+27 83 444",
      " 5555", "EMAIL;TYPE=INTERNET:lerato@mokoena.example", "CATEGORIES:Clients,Tax", "END:VCARD",
      "BEGIN:VCARD", "VERSION:2.1", "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=4E=61=64=65;Zo=C3=AB;;;", "TEL;CELL:0724445555", "END:VCARD",
      "BEGIN:VCARD", "VERSION:3.0", "FN:Landline Only", "TEL:12", "END:VCARD",
    ].join("\r\n");
    const { contacts, problems } = contactsFromVcf(vcf);
    expect(contacts).toEqual([
      { name: "Lerato Mokoena", phone: "27834445555", email: "lerato@mokoena.example", company: "Mokoena Holdings", tags: ["clients", "tax"], interest: null },
      { name: "Zoë Nade", phone: "27724445555", email: null, company: "", tags: [], interest: null },
    ]);
    expect(problems).toEqual(["Card 3: Landline Only has no usable phone number or email."]);
  });
  it("merges duplicates in one file", () => {
    const merged = dedupeContacts([
      { name: "A", phone: "27821234567", email: null, company: "", tags: ["x"], interest: null },
      { name: "A2", phone: "27821234567", email: "a@a.example", company: "Co", tags: ["y"], interest: null },
      { name: "B", phone: null, email: "a@a.example", company: "", tags: [], interest: null },
    ]);
    expect(merged).toEqual([{ name: "A", phone: "27821234567", email: "a@a.example", company: "Co", tags: ["x", "y"], interest: null }]);
  });
});
