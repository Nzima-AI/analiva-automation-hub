import { notFound, redirect } from "next/navigation";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { formatDateTime, humanise } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { deleteMailAccount, saveMailAccount } from "../../actions";
import { MailForm } from "../mail-form";
import { TestPanel } from "./test-panel";

export const metadata = { title: "Email account" };

export default async function MailAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { db, ctx, user } = await requireStaff();
  if (ctx.role !== "OWNER") redirect("/settings");
  const { id } = await params;
  const { error, saved } = await searchParams;
  const a = await db.mailAccount.findFirst({ where: { id } });
  if (!a) notFound();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title={a.label} className="lg:col-span-2">
        {error ? <Notice>{error}</Notice> : null}
        {saved ? <Notice tone="brand">Saved. Run a connection test to check the settings.</Notice> : null}
        <MailForm
          action={saveMailAccount.bind(null, a.id)}
          hasPassword={!!a.secretEncrypted}
          initial={{
            label: a.label,
            emailAddress: a.emailAddress,
            displayName: a.displayName ?? "",
            provider: a.provider,
            purpose: a.purpose,
            username: a.username,
            imapHost: a.imapHost ?? "",
            imapPort: a.imapPort ? String(a.imapPort) : "",
            imapSecure: a.imapSecure,
            imapFolder: a.imapFolder,
            smtpHost: a.smtpHost ?? "",
            smtpPort: a.smtpPort ? String(a.smtpPort) : "",
            smtpSecure: a.smtpSecure,
            isDefaultSender: a.isDefaultSender,
            enabled: a.enabled,
          }}
        />
      </Card>

      <div className="space-y-6">
        <Card title="Connection">
          <p className="mb-3 flex items-center gap-2 text-sm">
            <Badge tone={a.status === "OK" ? "brand" : a.status === "ERROR" ? "danger" : "neutral"}>
              {a.status === "OK" ? "Connected" : humanise(a.status)}
            </Badge>
            <span className="text-muted">{a.lastTestedAt ? `tested ${formatDateTime(a.lastTestedAt)}` : "not tested yet"}</span>
          </p>
          {a.lastError ? <p className="mb-3 text-sm text-danger">{a.lastError}</p> : null}
          <TestPanel accountId={a.id} canSend={a.purpose !== "INBOUND"} ownerEmail={user.email} />
        </Card>
        <Card title="Remove">
          <form action={deleteMailAccount.bind(null, a.id)}>
            <p className="mb-3 text-sm text-muted">Deletes the account and its saved password.</p>
            <Button variant="danger" className="w-full">
              Remove email account
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
