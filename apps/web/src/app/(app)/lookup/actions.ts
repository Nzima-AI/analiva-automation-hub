"use server";

import type { Row } from "@/components/crm/data-table";
import { searchDocumentRows, searchInvoiceRows } from "@/lib/crm";
import { requireStaff } from "@/lib/session";

export async function searchOlderInvoices(q: string): Promise<Row[]> {
  const { db } = await requireStaff();
  return searchInvoiceRows(db, q.slice(0, 120));
}

export async function searchOlderDocuments(q: string): Promise<Row[]> {
  const { db } = await requireStaff();
  return searchDocumentRows(db, q.slice(0, 120));
}
