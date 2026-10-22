"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normaliseCipcRegistration, normaliseSaPhone, parseDateRange, SERVICES, isValidSaVatNumber } from "@aah/core";
import { audit, Prisma } from "@aah/db";
import { blankToNull, fail, parseForm } from "@/lib/forms";
import { requireStaff } from "@/lib/session";

const optional = z.preprocess(blankToNull, z.string().max(200).nullable());

const clientSchema = z.object({
  name: z.string().trim().min(2, "Enter the client's registered or full name.").max(200),
  tradingName: optional,
  registrationNumber: optional,
  vatNumber: optional,
  taxNumber: optional,
  email: z.preprocess(blankToNull, z.string().email().max(200).nullable()),
  phone: optional,
  emailDomains: optional,
  status: z.enum(["PROSPECT", "ONBOARDING", "ACTIVE", "PAUSED", "ARCHIVED"]).default("ONBOARDING"),
  notes: z.preprocess(blankToNull, z.string().max(5000).nullable()),
  isCompany: z.preprocess((v) => v === "on", z.boolean()),
  vatRegistered: z.preprocess((v) => v === "on", z.boolean()),
  vatCategory: z.preprocess(blankToNull, z.enum(["A", "B", "C"]).nullable()),
  payeRegistered: z.preprocess((v) => v === "on", z.boolean()),
  financialYearEndMonth: z.coerce.number().int().min(1).max(12).default(2),
  incorporationDate: z.preprocess(blankToNull, z.string().nullable()),
});

type ClientInput = z.infer<typeof clientSchema>;

function normaliseClient(input: ClientInput, backTo: string) {
  const registrationNumber = input.registrationNumber ? normaliseCipcRegistration(input.registrationNumber) : null;
  if (input.registrationNumber && !registrationNumber) fail(backTo, "CIPC registration should look like 2019/123456/07.");
  const vatNumber = input.vatNumber ? input.vatNumber.replace(/\s/g, "") : null;
  if (vatNumber && !isValidSaVatNumber(vatNumber)) fail(backTo, "VAT number must be 10 digits starting with 4.");
  const domains = (input.emailDomains ?? "")
    .split(/[\s,;]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  const domainFromEmail = input.email?.split("@")[1]?.toLowerCase();
  const freeMail = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "live.com", "webmail.co.za", "mweb.co.za", "telkomsa.net"];
  if (domainFromEmail && !freeMail.includes(domainFromEmail) && !domains.includes(domainFromEmail)) domains.push(domainFromEmail);

  const incorporationDate = input.incorporationDate ? parseDateRange(input.incorporationDate)?.from ?? null : null;
  if (input.incorporationDate && !incorporationDate) fail(backTo, "Incorporation date isn't a valid date.");
  if (input.vatRegistered && !input.vatCategory) fail(backTo, "Choose the client's VAT category (A, B or C) for the VAT calendar.");

  return {
    isCompany: input.isCompany,
    vatRegistered: input.vatRegistered,
    vatCategory: input.vatRegistered ? input.vatCategory : null,
    payeRegistered: input.payeRegistered,
    financialYearEndMonth: input.financialYearEndMonth,
    incorporationDate,
    name: input.name,
    tradingName: input.tradingName,
    registrationNumber,
    vatNumber,
    taxNumber: input.taxNumber,
    email: input.email?.toLowerCase() ?? null,
    phone: input.phone ? (normaliseSaPhone(input.phone) ?? input.phone) : null,
    emailDomains: domains,
    status: input.status,
    notes: input.notes,
  };
}

export async function createClient(formData: FormData) {
  const session = await requireStaff();
  const backTo = "/clients/new";
  const input = parseForm(clientSchema, formData, backTo);
  const data = normaliseClient(input, backTo);
  const services = formData.getAll("services").filter((s): s is (typeof SERVICES)[number] => SERVICES.includes(s as never));

  const { db, ctx } = session;
  let clientId: string | null = null;
  for (let attempt = 0; attempt < 5 && !clientId; attempt++) {
    const count = await db.client.count();
    const code = `CL-${String(count + 1 + attempt).padStart(4, "0")}`;
    try {
      const created = await db.client.create({ data: { ...data, code, practiceId: ctx.practiceId } });
      clientId = created.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  if (!clientId) fail(backTo, "Could not allocate a client code. Try again.");

  await db.workspace.create({ data: { clientId, practiceId: ctx.practiceId } });
  if (services.length > 0) {
    await db.clientService.createMany({
      data: services.map((service) => ({ clientId: clientId!, service, practiceId: ctx.practiceId })),
    });
  }
  await audit(ctx, { action: "client.created", entityType: "Client", entityId: clientId, clientId, metadata: { services: services.join(",") } }, session.user.name);
  redirect(`/clients/${clientId}`);
}

export async function updateClient(clientId: string, formData: FormData) {
  const session = await requireStaff();
  const backTo = `/clients/${clientId}/edit`;
  const input = parseForm(clientSchema, formData, backTo);
  const data = normaliseClient(input, backTo);
  const { count } = await session.db.client.updateMany({ where: { id: clientId, deletedAt: null }, data });
  if (count === 0) fail("/clients", "Client not found.");
  await audit(
    session.ctx,
    { action: input.status === "ARCHIVED" ? "client.archived" : "client.updated", entityType: "Client", entityId: clientId, clientId },
    session.user.name,
  );
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function toggleService(clientId: string, service: (typeof SERVICES)[number], enabled: boolean) {
  const session = await requireStaff();
  if (!SERVICES.includes(service)) fail(`/clients/${clientId}`, "Unknown service.");
  const client = await session.db.client.findFirst({ where: { id: clientId }, select: { id: true } });
  if (!client) fail("/clients", "Client not found.");
  await session.db.clientService.upsert({
    where: { clientId_service: { clientId, service } },
    create: { clientId, service, enabled, practiceId: session.ctx.practiceId },
    update: { enabled },
  });
  await audit(
    session.ctx,
    { action: "client.service_toggled", entityType: "Client", entityId: clientId, clientId, metadata: { service, enabled } },
    session.user.name,
  );
  revalidatePath(`/clients/${clientId}`);
}

const contactSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.preprocess(blankToNull, z.string().email().max(200).nullable()),
  phone: optional,
  position: optional,
  isPrimary: z.preprocess((v) => v === "on", z.boolean()),
});

export async function addContact(clientId: string, formData: FormData) {
  const session = await requireStaff();
  const backTo = `/clients/${clientId}`;
  const input = parseForm(contactSchema, formData, backTo);
  const client = await session.db.client.findFirst({ where: { id: clientId }, select: { id: true } });
  if (!client) fail("/clients", "Client not found.");
  if (input.isPrimary) {
    await session.db.contact.updateMany({ where: { clientId }, data: { isPrimary: false } });
  }
  const contact = await session.db.contact.create({
    data: {
      clientId,
      practiceId: session.ctx.practiceId,
      name: input.name,
      email: input.email?.toLowerCase() ?? null,
      phone: input.phone ? (normaliseSaPhone(input.phone) ?? input.phone) : null,
      position: input.position,
      isPrimary: input.isPrimary,
    },
  });
  await audit(session.ctx, { action: "contact.created", entityType: "Contact", entityId: contact.id, clientId }, session.user.name);
  revalidatePath(backTo);
}

export async function deleteContact(clientId: string, contactId: string) {
  const session = await requireStaff();
  const { count } = await session.db.contact.deleteMany({ where: { id: contactId, clientId } });
  if (count > 0) {
    await audit(session.ctx, { action: "contact.deleted", entityType: "Contact", entityId: contactId, clientId }, session.user.name);
  }
  revalidatePath(`/clients/${clientId}`);
}

const captureSchema = z.object({
  captureMode: z.enum(["ALWAYS_REVIEW", "AUTO_WHEN_CONFIDENT", "NEVER_REVIEW"]),
  autoFileThreshold: z.coerce.number().int().min(60).max(99),
});

/** Owner-only: how much of this client's inbox capture skips review. */
export async function updateCaptureSettings(clientId: string, formData: FormData) {
  const session = await requireStaff();
  if (session.ctx.role !== "OWNER") fail(`/clients/${clientId}`, "Only the practice owner can change review settings.");
  const input = parseForm(captureSchema, formData, `/clients/${clientId}`);
  const { count } = await session.db.client.updateMany({
    where: { id: clientId, deletedAt: null },
    data: { captureMode: input.captureMode, autoFileThreshold: input.autoFileThreshold / 100 },
  });
  if (count === 0) fail("/clients", "Client not found.");
  await audit(
    session.ctx,
    {
      action: "client.settings_updated",
      entityType: "Client",
      entityId: clientId,
      clientId,
      metadata: { captureMode: input.captureMode, threshold: input.autoFileThreshold },
    },
    session.user.name,
  );
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  redirect(`/clients/${clientId}?saved=capture`);
}
