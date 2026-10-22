import { NextResponse, type NextRequest } from "next/server";
import { parseDateRange } from "@aah/core";
import { toAnalivaImportCsv } from "@aah/connectors";
import { audit } from "@aah/db";
import { requireStaff } from "@/lib/session";

/**
 * Import file for Analiva (CLAUDE.md §8, route 2). Exports invoices in the date
 * range that are captured or approved and have no open validation issues.
 * TODO(confirm): Analiva's real import layout; columns are in @aah/connectors.
 */
export async function GET(request: NextRequest) {
  const session = await requireStaff();
  const p = request.nextUrl.searchParams;
  const from = p.get("from") ? parseDateRange(p.get("from")!) : null;
  const to = p.get("to") ? parseDateRange(p.get("to")!) : null;
  const clientId = p.get("client") || undefined;

  const invoices = await session.db.invoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ["CAPTURED", "APPROVED"] },
      validationIssues: { isEmpty: true },
      ...(clientId ? { clientId } : {}),
      ...(from || to ? { issueDate: { ...(from ? { gte: from.from } : {}), ...(to ? { lt: to.to } : {}) } } : {}),
    },
    orderBy: [{ issueDate: "asc" }],
    take: 5000,
    include: { client: { select: { code: true, name: true } }, supplier: { select: { name: true, vatNumber: true } } },
  });

  const csv = toAnalivaImportCsv(
    invoices.map((i) => ({
      id: i.id,
      clientCode: i.client.code,
      clientName: i.client.name,
      direction: i.direction,
      supplierName: i.supplier?.name ?? null,
      supplierVatNumber: i.supplier?.vatNumber ?? null,
      invoiceNumber: i.invoiceNumber,
      issueDate: i.issueDate.toISOString().slice(0, 10),
      dueDate: i.dueDate?.toISOString().slice(0, 10) ?? null,
      description: i.description,
      currency: i.currency,
      subtotalCents: i.subtotalCents,
      vatCents: i.vatCents,
      totalCents: i.totalCents,
    })),
  );
  await audit(
    session.ctx,
    { action: "invoice.exported", entityType: "Practice", entityId: session.ctx.practiceId, metadata: { count: invoices.length, from: p.get("from"), to: p.get("to") } },
    session.user.name,
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analiva-import-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
