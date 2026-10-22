import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Table, Td } from "@/components/ui";
import { formatDateTime, humanise } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { CheckInboxButton } from "../review/check-inbox-button";

export const metadata = { title: "Inbox" };
export const maxDuration = 60;

const kindTone = { INVOICE: "brand", STATEMENT: "neutral", CIPC: "warn", QUERY: "warn", OTHER: "neutral" } as const;

export default async function InboxPage() {
  const { db } = await requireStaff();
  const emails = await db.emailMessage.findMany({
    orderBy: { receivedAt: "desc" },
    take: 100,
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { documents: true } },
      captures: { select: { id: true, status: true, invoiceId: true } },
    },
  });

  return (
    <div>
      <PageHeader title="Inbox" subtitle="Every email fetched from connected mailboxes, how it was classified, and who it was matched to." actions={<CheckInboxButton />} />
      <Card>
        {emails.length === 0 ? (
          <Empty>No emails fetched yet.</Empty>
        ) : (
          <Table head={["Received", "From", "Subject", "Type", "Client", "Result"]}>
            {emails.map((e) => (
              <tr key={e.id} className="hover:bg-canvas">
                <Td className="tabular whitespace-nowrap">{formatDateTime(e.receivedAt)}</Td>
                <Td>
                  <div className="max-w-[14rem] truncate">{e.fromName ?? e.fromAddress}</div>
                  <div className="max-w-[14rem] truncate text-xs text-muted">{e.fromAddress}</div>
                </Td>
                <Td>
                  <div className="max-w-[18rem] truncate">{e.subject}</div>
                  <div className="text-xs text-muted">{e._count.documents} attachment{e._count.documents === 1 ? "" : "s"}</div>
                </Td>
                <Td>
                  <Badge tone={kindTone[e.kind]}>{humanise(e.kind)}</Badge>
                </Td>
                <Td>
                  {e.client ? (
                    <Link href={`/clients/${e.client.id}`} className="hover:underline">
                      {e.client.name}
                    </Link>
                  ) : (
                    <span className="text-muted">{e.matchStatus === "AMBIGUOUS" ? "Several possible" : "Not matched"}</span>
                  )}
                </Td>
                <Td className="text-sm">
                  {e.captures.length === 0 ? (
                    <span className="text-muted">Stored</span>
                  ) : (
                    e.captures.map((c) =>
                      c.invoiceId ? (
                        <Link key={c.id} href={`/invoices/${c.invoiceId}`} className="mr-2 text-brand hover:underline">
                          Invoice filed
                        </Link>
                      ) : c.status === "DISMISSED" ? (
                        <span key={c.id} className="mr-2 text-muted">
                          Dismissed
                        </span>
                      ) : (
                        <Link key={c.id} href={`/review/${c.id}`} className="mr-2 text-warn hover:underline">
                          To review
                        </Link>
                      ),
                    )
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
