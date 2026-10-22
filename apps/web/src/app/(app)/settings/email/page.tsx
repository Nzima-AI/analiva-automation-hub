import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Card, Empty, Table, Td } from "@/components/ui";
import { formatDateTime, humanise } from "@/lib/format";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Email accounts" };

const statusTone = { OK: "brand", ERROR: "danger", UNTESTED: "neutral" } as const;

export default async function EmailAccountsPage() {
  const { db, ctx } = await requireStaff();
  if (ctx.role !== "OWNER") redirect("/settings");
  const accounts = await db.mailAccount.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-6">
      <Card
        title="Mailboxes"
        actions={<ButtonLink href="/settings/email/new">Add email account</ButtonLink>}
      >
        <p className="mb-4 text-sm text-muted">
          Mailboxes the platform reads invoices from (inbound) and sends from (outbound). Passwords are encrypted and never shown again.
        </p>
        {accounts.length === 0 ? (
          <Empty>No email accounts yet.</Empty>
        ) : (
          <Table head={["Account", "Use", "Servers", "Status", "Last tested"]}>
            {accounts.map((a) => (
              <tr key={a.id} className="hover:bg-canvas">
                <Td>
                  <Link href={`/settings/email/${a.id}`} className="font-medium text-brand hover:underline">
                    {a.label}
                  </Link>
                  <div className="text-xs text-muted">
                    {a.emailAddress}
                    {a.isDefaultSender ? " · default sender" : ""}
                    {!a.enabled ? " · disabled" : ""}
                  </div>
                </Td>
                <Td>{a.purpose === "BOTH" ? "Inbound and outbound" : humanise(a.purpose)}</Td>
                <Td className="text-xs text-muted">
                  {a.purpose !== "OUTBOUND" ? <div>IMAP {a.imapHost}:{a.imapPort}</div> : null}
                  {a.purpose !== "INBOUND" ? <div>SMTP {a.smtpHost}:{a.smtpPort}</div> : null}
                </Td>
                <Td>
                  <Badge tone={statusTone[a.status]}>{a.status === "OK" ? "Connected" : humanise(a.status)}</Badge>
                </Td>
                <Td className="tabular whitespace-nowrap">{formatDateTime(a.lastTestedAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
