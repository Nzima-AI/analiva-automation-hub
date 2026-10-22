import { redirect } from "next/navigation";
import { Card, Notice } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { saveMailAccount } from "../../actions";
import { EMPTY_MAIL_FORM } from "../mail-defaults";
import { MailForm } from "../mail-form";

export const metadata = { title: "Add email account" };

export default async function NewMailAccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { ctx } = await requireStaff();
  if (ctx.role !== "OWNER") redirect("/settings");
  const { error } = await searchParams;
  return (
    <Card title="Add email account">
      {error ? <Notice>{error}</Notice> : null}
      <MailForm action={saveMailAccount.bind(null, null)} initial={EMPTY_MAIL_FORM} hasPassword={false} />
    </Card>
  );
}
