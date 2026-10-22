import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { ensureChart } from "@/lib/books/ledger";
import { requireStaff } from "@/lib/session";
import { BooksTabs } from "./books-tabs";

export default async function BooksClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const { db, ctx } = await requireStaff();
  const { clientId } = await params;
  const client = await db.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true, name: true, code: true, vatRegistered: true, vatCategory: true } });
  if (!client) notFound();
  await ensureChart(db, ctx, client.id);
  const toCode = await db.bankTransaction.count({ where: { clientId, status: "UNMATCHED" } });

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link href="/books" className="hover:underline">
            Books & reports
          </Link>
        }
        title={client.name}
        subtitle={
          <span className="flex items-center gap-2">
            <Link href={`/clients/${client.id}`} className="hover:underline">
              {client.code}
            </Link>
            {client.vatRegistered ? <Badge tone="brand">VAT category {client.vatCategory ?? "not set"}</Badge> : <Badge>Not VAT registered</Badge>}
          </span>
        }
      />
      <BooksTabs clientId={client.id} toCode={toCode} />
      {children}
    </div>
  );
}
