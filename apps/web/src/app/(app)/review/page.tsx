import Link from "next/link";
import { formatCents } from "@aah/core";
import { Badge, Card, Empty, Notice, PageHeader, Table, Td } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { readExtracted } from "@/lib/inbox/extracted";
import { requireStaff } from "@/lib/session";
import { CheckInboxButton } from "./check-inbox-button";

export const metadata = { title: "Review queue" };
export const maxDuration = 60;

const CAPTURE_LABEL = {
  NEEDS_CLIENT: { text: "Which client?", tone: "warn" },
  SUGGESTED: { text: "Confirm", tone: "brand" },
  NEEDS_REVIEW: { text: "Check details", tone: "warn" },
  FAILED: { text: "Failed", tone: "danger" },
  FILED: { text: "Filed", tone: "brand" },
  DISMISSED: { text: "Dismissed", tone: "neutral" },
} as const;

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ done?: string; show?: string }> }) {
  const { db } = await requireStaff();
  const { done, show } = await searchParams;
  const showRecent = show === "recent";
  const [items, accounts] = await Promise.all([
    db.capture.findMany({
      where: showRecent ? { status: { in: ["FILED", "DISMISSED"] } } : { status: { in: ["NEEDS_CLIENT", "SUGGESTED", "NEEDS_REVIEW", "FAILED"] } },
      orderBy: showRecent ? { decidedAt: "desc" } : { createdAt: "asc" },
      take: 100,
      include: {
        client: { select: { name: true } },
        document: { select: { filename: true } },
        email: { select: { fromAddress: true, fromName: true, subject: true, receivedAt: true } },
        invoice: { select: { id: true } },
      },
    }),
    db.mailAccount.findMany({ where: { purpose: { in: ["INBOUND", "BOTH"] } }, select: { emailAddress: true, lastPolledAt: true, lastPollError: true, enabled: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Review queue"
        subtitle="Invoices read from the inbox that need a client, a confirmation or a check. Confident ones are filed automatically."
        actions={<CheckInboxButton />}
      />
      {done ? <Notice tone="brand">All caught up.</Notice> : null}
      {accounts.length === 0 ? (
        <Notice tone="warn">
          No inbox connected yet. Add one under <Link href="/settings/email" className="underline">Settings → Email accounts</Link>.
        </Notice>
      ) : (
        <p className="mb-4 text-xs text-muted">
          {accounts.map((a) => (
            <span key={a.emailAddress} className="mr-4">
              {a.emailAddress}: {a.lastPollError ? <span className="text-danger">{a.lastPollError}</span> : `checked ${formatDateTime(a.lastPolledAt)}`}
            </span>
          ))}
          Checked automatically every 5 minutes.
        </p>
      )}
      <div className="mb-3 flex gap-3 text-sm">
        <Link href="/review" className={showRecent ? "text-muted hover:text-ink" : "font-medium text-brand"}>
          Waiting
        </Link>
        <Link href="/review?show=recent" className={showRecent ? "font-medium text-brand" : "text-muted hover:text-ink"}>
          Recently filed or dismissed
        </Link>
      </div>
      <Card>
        {items.length === 0 ? (
          <Empty>{showRecent ? "Nothing filed yet." : "Nothing waiting."}</Empty>
        ) : (
          <Table head={["Received", "From", "Document", "Read as", "Client", "Confidence", ""]}>
            {items.map((c) => {
              const x = readExtracted(c.extracted).fields;
              const label = CAPTURE_LABEL[c.status];
              return (
                <tr key={c.id} className="hover:bg-canvas">
                  <Td className="tabular whitespace-nowrap">{formatDateTime(c.email?.receivedAt ?? c.createdAt)}</Td>
                  <Td>
                    <div className="max-w-[14rem] truncate">{c.email?.fromName ?? c.email?.fromAddress ?? "Upload"}</div>
                    <div className="max-w-[14rem] truncate text-xs text-muted">{c.email?.subject}</div>
                  </Td>
                  <Td className="max-w-[12rem] truncate">{c.document.filename}</Td>
                  <Td className="text-xs">
                    <div>{x.supplierName?.value ?? "—"}</div>
                    <div className="text-muted">
                      {x.invoiceNumber?.value ?? "no number"} · {x.total ? formatCents(BigInt(x.total.value)) : "no total"}
                    </div>
                  </Td>
                  <Td>{c.client?.name ?? <span className="text-warn">Unknown</span>}</Td>
                  <Td className="tabular">{Math.round(c.confidence * 100)}%</Td>
                  <Td className="whitespace-nowrap text-right">
                    {c.invoice ? (
                      <Link href={`/invoices/${c.invoice.id}`} className="text-sm text-brand hover:underline">
                        View invoice
                      </Link>
                    ) : c.status === "DISMISSED" ? (
                      <Badge>{label.text}</Badge>
                    ) : (
                      <Link href={`/review/${c.id}`}>
                        <Badge tone={label.tone}>{label.text} →</Badge>
                      </Link>
                    )}
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
