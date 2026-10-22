import "server-only";
import { FREE_MAIL_DOMAINS, learnLabel, type InvoiceField, type ParseHints, type TenantContext } from "@aah/core";
import type { TenantDb } from "@aah/db";

/** A supplier is recognised by its VAT number, else by the sender's (non-free-mail) domain. */
export function supplierKeys(supplierVat: string | null, senderEmail: string | null): string[] {
  const keys: string[] = [];
  if (supplierVat) keys.push(supplierVat);
  const domain = senderEmail?.split("@")[1]?.toLowerCase();
  if (domain && !FREE_MAIL_DOMAINS.has(domain)) keys.push(`@${domain}`);
  return keys;
}

export async function hintsFor(db: TenantDb, keys: string[]): Promise<Pick<ParseHints, "labels" | "supplierName"> | null> {
  if (keys.length === 0) return null;
  const profiles = await db.supplierProfile.findMany({ where: { key: { in: keys } } });
  const profile = keys.map((k) => profiles.find((p) => p.key === k)).find(Boolean);
  if (!profile) return null;
  return { supplierName: profile.supplierName, labels: (profile.labels ?? {}) as ParseHints["labels"] };
}

/** Labels that produced a value ("after \"invoice no\"") are reinforced; corrected values teach new ones. */
export function labelsFromSources(sources: Partial<Record<InvoiceField, string>>): Partial<Record<InvoiceField, string[]>> {
  const out: Partial<Record<InvoiceField, string[]>> = {};
  for (const [field, source] of Object.entries(sources) as Array<[InvoiceField, string]>) {
    const m = /^after "(.+)"$/.exec(source);
    if (m) out[field] = [m[1]!];
  }
  return out;
}

export interface Learned {
  field: InvoiceField;
  extracted: string | null;
  corrected: string | null;
  /** raw text as typed, used to find the label in the document */
  correctedRaw: string | null;
}

/**
 * Update the supplier profile after a filing: remember the name, VAT number, the labels
 * that worked, and labels for any values the user corrected.
 */
export async function rememberSupplier(
  db: TenantDb,
  ctx: TenantContext,
  args: {
    keys: string[];
    supplierName: string;
    vatNumber: string | null;
    documentText: string | null;
    workingSources: Partial<Record<InvoiceField, string>>;
    corrections: Learned[];
    captureId: string;
  },
): Promise<void> {
  if (args.keys.length === 0) return;
  const labels: Partial<Record<InvoiceField, string[]>> = labelsFromSources(args.workingSources);

  for (const c of args.corrections) {
    const label = args.documentText && c.correctedRaw ? learnLabel(args.documentText, c.correctedRaw) : null;
    if (label && c.field !== "supplierName") labels[c.field] = [label, ...(labels[c.field] ?? []).filter((l) => l !== label)];
    await db.captureCorrection.create({
      data: {
        practiceId: ctx.practiceId,
        captureId: args.captureId,
        field: c.field,
        extractedValue: c.extracted,
        correctedValue: c.corrected,
        learnedLabel: label,
        userId: ctx.userId,
      },
    });
  }

  for (const key of args.keys) {
    const existing = await db.supplierProfile.findFirst({ where: { key } });
    const merged = { ...((existing?.labels ?? {}) as Record<string, string[]>) };
    for (const [field, ls] of Object.entries(labels)) {
      merged[field] = [...new Set([...(ls ?? []), ...(merged[field] ?? [])])].slice(0, 4);
    }
    if (existing) {
      await db.supplierProfile.updateMany({
        where: { id: existing.id },
        data: { supplierName: args.supplierName, vatNumber: args.vatNumber ?? existing.vatNumber, labels: merged, timesFiled: { increment: 1 } },
      });
    } else {
      await db.supplierProfile.create({
        data: { practiceId: ctx.practiceId, key, supplierName: args.supplierName, vatNumber: args.vatNumber, labels: merged, timesFiled: 1 },
      });
    }
  }
}

/**
 * Remember that mail from this exact address belongs to this client. Only the address,
 * not the domain: a supplier's billing domain serves many clients. If the address later
 * sends for another client, the document's own signals make the match AMBIGUOUS and we ask.
 */
export async function rememberSender(db: TenantDb, ctx: TenantContext, senderEmail: string, clientId: string): Promise<void> {
  const pattern = senderEmail.trim().toLowerCase();
  await db.senderRule.upsert({
    where: { practiceId_pattern: { practiceId: ctx.practiceId, pattern } },
    create: { practiceId: ctx.practiceId, pattern, clientId, createdByUserId: ctx.userId },
    update: { clientId },
  });
}
