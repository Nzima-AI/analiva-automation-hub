import { Plus } from "@phosphor-icons/react/dist/ssr";
import { DataTable } from "@/components/crm/data-table";
import { ButtonLink, PageHeader } from "@/components/ui";
import { clientRows } from "@/lib/crm";
import { CLIENT_COLUMNS, CLIENT_FACETS } from "@/lib/crm-columns";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { db } = await requireStaff();
  const { q } = await searchParams;
  const [rows, total] = await Promise.all([clientRows(db), db.client.count({ where: { deletedAt: null } })]);
  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Every business the practice serves. Type to narrow down by name, contact, phone, VAT or CIPC number."
        actions={
          <ButtonLink href="/clients/new">
            <Plus className="h-4 w-4" /> New client
          </ButtonLink>
        }
      />
      <DataTable
        rows={rows}
        columns={CLIENT_COLUMNS}
        facets={CLIENT_FACETS}
        initialQuery={q}
        totalAvailable={total}
        emptyText="No clients yet. Add the first one to start capturing their invoices."
        placeholder="Search name, code, contact, phone, email, VAT or CIPC number"
      />
    </div>
  );
}
