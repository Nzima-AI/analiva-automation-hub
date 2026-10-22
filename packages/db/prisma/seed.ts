/**
 * Demo data — fake businesses only (CLAUDE.md §10: never real client data).
 * Seeds into the practice named by SEED_PRACTICE_SLUG (default "demo"), creating it if needed.
 * Safe to re-run: it skips when the practice already has clients.
 */
import path from "node:path";
import { config } from "dotenv";
import { normaliseInvoiceNumber, vatFromInclusive } from "@aah/core";
import { rootDb } from "../src/client";

config({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });

const slug = process.env.SEED_PRACTICE_SLUG ?? "demo";
const db = rootDb();

const CLIENTS = [
  { name: "Mokoena Plumbing (Pty) Ltd", trading: "Mokoena Plumbing", reg: "2018/402113/07", vat: "4730261845", phone: "0821234567", email: "info@mokoena-plumbing.example", contact: "Thabo Mokoena", services: ["ACCOUNTING", "PAYROLL"] },
  { name: "Ubuntu Bakery CC", trading: "Ubuntu Bakes", reg: "2009/014552/23", vat: "4120345678", phone: "0117654321", email: "hello@ubuntubakes.example", contact: "Lerato Dlamini", services: ["ACCOUNTING", "BRANDING", "WEBSITE"] },
  { name: "Naidoo & Daughters Logistics (Pty) Ltd", trading: null, reg: "2021/558901/07", vat: "4987654321", phone: "0315550101", email: "accounts@naidoologistics.example", contact: "Priya Naidoo", services: ["ACCOUNTING", "PAYROLL", "CIPC"] },
  { name: "Karoo Craft Gin (Pty) Ltd", trading: "Karoo Craft", reg: "2023/701245/07", vat: null, phone: "0233421100", email: "cheers@karoocraft.example", contact: "Johan van der Merwe", services: ["CIPC", "BRANDING", "WEBSITE", "LAUNCH"] },
  { name: "Sipho Ndlovu", trading: "Ndlovu Consulting", reg: null, vat: null, phone: "0739876543", email: "sipho@ndlovuconsulting.example", contact: "Sipho Ndlovu", services: ["ACCOUNTING"] },
] as const;

const SUPPLIERS = [
  { name: "Builders Warehouse", vat: "4440102345" },
  { name: "Vodacom", vat: "4910101010" },
  { name: "Eskom", vat: "4740101508" },
  { name: "Makro", vat: "4560117890" },
  { name: "Engen Garage", vat: "4400220011" },
];

function day(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}

async function main() {
  const practice = await db.practice.upsert({ where: { slug }, create: { name: slug === "demo" ? "Demo Practice" : slug, slug }, update: {} });
  if ((await db.client.count({ where: { practiceId: practice.id } })) > 0) {
    console.log(`Practice "${slug}" already has clients; skipping seed.`);
    return;
  }

  let n = 0;
  for (const c of CLIENTS) {
    n++;
    const client = await db.client.create({
      data: {
        practiceId: practice.id,
        code: `CL-${String(n).padStart(4, "0")}`,
        name: c.name,
        tradingName: c.trading,
        registrationNumber: c.reg,
        vatNumber: c.vat,
        email: c.email,
        phone: c.phone,
        emailDomains: [c.email.split("@")[1]!],
        status: "ACTIVE",
      },
    });
    await db.workspace.create({ data: { practiceId: practice.id, clientId: client.id } });
    await db.clientService.createMany({ data: c.services.map((service) => ({ practiceId: practice.id, clientId: client.id, service })) });
    await db.contact.create({ data: { practiceId: practice.id, clientId: client.id, name: c.contact, email: c.email, phone: c.phone, isPrimary: true, position: "Director" } });

    // Three years of supplier bills so "find the invoice from 2023" has something to find.
    for (let i = 0; i < 12; i++) {
      const s = SUPPLIERS[(i + n) % SUPPLIERS.length]!;
      const supplier = await db.supplier.upsert({
        where: { clientId_name: { clientId: client.id, name: s.name } },
        create: { practiceId: practice.id, clientId: client.id, name: s.name, vatNumber: s.vat },
        update: {},
      });
      const year = 2023 + (i % 3);
      const issueDate = day(year, 1 + ((i * 5 + n) % 12), 1 + ((i * 7 + n) % 27));
      const totalCents = BigInt(25_000 + ((i * 7919 + n * 104729) % 4_000_000));
      const vatCents = vatFromInclusive(totalCents);
      const invoiceNumber = `INV-${year}-${String(1000 + i * 37 + n).padStart(5, "0")}`;
      const retainUntil = new Date(issueDate);
      retainUntil.setUTCFullYear(retainUntil.getUTCFullYear() + 5);
      await db.invoice.create({
        data: {
          practiceId: practice.id,
          clientId: client.id,
          supplierId: supplier.id,
          invoiceNumber,
          invoiceNumberNorm: normaliseInvoiceNumber(invoiceNumber),
          issueDate,
          subtotalCents: totalCents - vatCents,
          vatCents,
          totalCents,
          status: i % 5 === 0 ? "NEEDS_REVIEW" : "APPROVED",
          validationIssues: i % 5 === 0 ? ["SUSPECTED_DUPLICATE"] : [],
          retainUntil,
        },
      });
    }
  }
  console.log(`Seeded ${CLIENTS.length} demo clients into practice "${slug}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
