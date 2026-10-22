import { Receipt } from "@phosphor-icons/react/dist/ssr";
import { formatCents } from "@aah/core";
import { Badge, Card, Empty, PageHeader, Table, Tabs, Td } from "@/components/ui";
import { formatCalendarDate } from "@/lib/format";
import { requireClient } from "@/lib/session";

export const metadata = { title: "Invoices" };

export default async function PortalInvoicesPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { db, clientId } = await requireClient();
  const { d } = await searchParams;
  const direction = d === "sales" ? "RECEIVABLE" : "PAYABLE";
  const invoices = await db.invoice.findMany({
    where: { clientId, deletedAt: null, direction, status: { not: "REJECTED" } },
    orderBy: { issueDate: "desc" },
    take: 200,
    include: { supplier: { select: { name: true } }, sourceDocument: { select: { id: true } } },
  });
  const today = new Date();

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Everything your accountant has captured for you, with what's still outstanding." />
      <Tabs
        items={[
          { href: "/portal/invoices", label: "Bills from suppliers", active: direction === "PAYABLE" },
          { href: "/portal/invoices?d=sales", label: "Invoices to customers", active: direction === "RECEIVABLE" },
        ]}
      />
      <Card>
        {invoices.length === 0 ? (
          <Empty icon={Receipt}>Nothing captured yet.</Empty>
        ) : (
          <Table head={["Date", "Number", direction === "PAYABLE" ? "Supplier" : "Customer", "Total", "Outstanding", ""]} align={["left", "left", "left", "right", "right", "left"]}>
            {invoices.map((i) => {
              const owed = i.totalCents - i.amountPaidCents;
              const overdue = owed > 0n && i.dueDate && i.dueDate < today;
              return (
                <tr key={i.id} className="transition-colors hover:bg-subtle/60">
                  <Td className="tabular whitespace-nowrap text-muted">{formatCalendarDate(i.issueDate)}</Td>
                  <Td className="font-medium">{i.invoiceNumber}</Td>
                  <Td>{i.supplier?.name ?? "-"}</Td>
                  <Td className="tabular whitespace-nowrap text-right">{formatCents(i.totalCents, i.currency)}</Td>
                  <Td className="tabular whitespace-nowrap text-right">{owed > 0n ? formatCents(owed, i.currency) : <Badge tone="positive">Paid</Badge>}</Td>
                  <Td className="whitespace-nowrap">
                    {overdue ? <Badge tone="danger">Overdue</Badge> : null}{" "}
                    {i.sourceDocument ? (
                      <a href={`/documents/${i.sourceDocument.id}/download?view=1`} target="_blank" rel="noopener" className="text-xs font-medium text-brand-text hover:underline">
                        View
                      </a>
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
