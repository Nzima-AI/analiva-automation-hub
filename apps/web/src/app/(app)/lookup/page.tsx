import { Plus, Receipt } from "@phosphor-icons/react/dist/ssr";
import { DataTable } from "@/components/crm/data-table";
import { CLIENT_COLUMNS, CLIENT_FACETS } from "@/lib/crm-columns";
import { ButtonLink, PageHeader, Tabs } from "@/components/ui";
import { clientRows, contactRows, documentRows, invoiceRows } from "@/lib/crm";
import { requireStaff } from "@/lib/session";
import { searchOlderDocuments, searchOlderInvoices } from "./actions";

export const metadata = { title: "Records" };

const TABS = ["clients", "contacts", "invoices", "documents"] as const;
type Tab = (typeof TABS)[number];

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { db } = await requireStaff();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "clients";
  const [counts] = await Promise.all([
    Promise.all([db.client.count({ where: { deletedAt: null } }), db.contact.count(), db.invoice.count({ where: { deletedAt: null } }), db.document.count({ where: { deletedAt: null } })]),
  ]);
  const [clientCount, contactCount, invoiceCount, documentCount] = counts;

  let table: React.ReactNode;
  if (tab === "clients") {
    table = (
      <DataTable
        rows={await clientRows(db)}
        columns={CLIENT_COLUMNS}
        facets={CLIENT_FACETS}
        initialQuery={sp.q}
        totalAvailable={clientCount}
        emptyText="No clients yet."
        placeholder="Search name, code, contact, phone, email, VAT or CIPC number"
      />
    );
  } else if (tab === "contacts") {
    const rows = await contactRows(db);
    table = (
      <DataTable
        rows={rows}
        columns={[
          { key: "name", label: "Contact", sub: "position" },
          { key: "client", label: "Client" },
          { key: "email", label: "Email", hideBelow: "md" },
          { key: "phone", label: "Phone", hideBelow: "md" },
          { key: "primary", label: "", kind: "badge", tones: { PRIMARY: "brand" }, sortable: false, hideBelow: "lg" },
        ]}
        facets={[{ key: "client", label: "Client", options: [...new Set(rows.map((r) => String(r.values.client)))].sort().map((c) => ({ value: c, label: c })) }]}
        initialQuery={sp.q}
        totalAvailable={contactCount}
        emptyText="No contacts yet. Add them on a client's page."
        placeholder="Search name, email, phone or client"
      />
    );
  } else if (tab === "invoices") {
    const rows = await invoiceRows(db);
    table = (
      <DataTable
        rows={rows}
        columns={[
          { key: "number", label: "Invoice", sub: "party" },
          { key: "client", label: "Client" },
          { key: "date", label: "Date", kind: "date" },
          { key: "direction", label: "Type", kind: "badge", tones: { BILL: "neutral", SALE: "brand" }, hideBelow: "md" },
          { key: "total", label: "Total", kind: "money", align: "right" },
          { key: "outstanding", label: "Outstanding", kind: "money", align: "right", hideBelow: "lg" },
          { key: "status", label: "Status", kind: "badge", tones: { CAPTURED: "neutral", NEEDS_REVIEW: "warn", APPROVED: "positive", POSTED: "positive", REJECTED: "danger" } },
        ]}
        facets={[
          { key: "client", label: "Client", options: [...new Set(rows.map((r) => String(r.values.client)))].sort().map((c) => ({ value: c, label: c })) },
          { key: "status", label: "Status", options: ["CAPTURED", "NEEDS_REVIEW", "APPROVED", "POSTED", "REJECTED"].map((v) => ({ value: v, label: v.replace("_", " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase()) })) },
          { key: "direction", label: "Type", options: [{ value: "BILL", label: "Supplier bills" }, { value: "SALE", label: "Sales invoices" }] },
        ]}
        initialQuery={sp.q}
        totalAvailable={invoiceCount}
        remoteSearch={searchOlderInvoices}
        defaultSort={{ key: "date", dir: "desc" }}
        emptyText="No invoices yet."
        placeholder="Search invoice number, supplier, client, R amount or date (Mar 2024)"
      />
    );
  } else {
    const rows = await documentRows(db);
    table = (
      <DataTable
        rows={rows}
        columns={[
          { key: "filename", label: "File", sub: "by" },
          { key: "client", label: "Client" },
          { key: "kind", label: "Type", kind: "badge" },
          { key: "size", label: "Size", hideBelow: "md", sortable: false },
          { key: "added", label: "Added", kind: "date" },
        ]}
        facets={[
          { key: "kind", label: "Type", options: ["INVOICE", "STATEMENT", "CIPC", "CONTRACT", "MANDATE", "BRAND_ASSET", "PAYROLL", "TAX", "OTHER"].map((v) => ({ value: v, label: v.replace("_", " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase()) })) },
          { key: "source", label: "Came from", options: [{ value: "EMAIL", label: "Email" }, { value: "UPLOAD", label: "Staff upload" }, { value: "PORTAL", label: "Client portal" }] },
        ]}
        initialQuery={sp.q}
        totalAvailable={documentCount}
        remoteSearch={searchOlderDocuments}
        defaultSort={{ key: "added", dir: "desc" }}
        emptyText="No documents yet."
        placeholder="Search file name or client"
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Records"
        subtitle="Every client, contact, invoice and document. Start typing to narrow down; amounts, dates and phone numbers work too."
        actions={
          <>
            <ButtonLink href="/invoices/new" variant="secondary">
              <Receipt className="h-4 w-4" /> Capture invoice
            </ButtonLink>
            <ButtonLink href="/clients/new">
              <Plus className="h-4 w-4" /> New client
            </ButtonLink>
          </>
        }
      />
      <Tabs
        items={[
          { href: "/lookup?tab=clients", label: "Clients", active: tab === "clients", count: clientCount },
          { href: "/lookup?tab=contacts", label: "Contacts", active: tab === "contacts", count: contactCount },
          { href: "/lookup?tab=invoices", label: "Invoices", active: tab === "invoices", count: invoiceCount },
          { href: "/lookup?tab=documents", label: "Documents", active: tab === "documents", count: documentCount },
        ]}
      />
      {table}
    </div>
  );
}
