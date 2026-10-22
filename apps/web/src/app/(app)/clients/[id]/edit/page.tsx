import { notFound } from "next/navigation";
import { Card, Notice, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { updateClient } from "../../actions";
import { ClientForm } from "../../client-form";

export const metadata = { title: "Edit client" };

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { db } = await requireStaff();
  const { id } = await params;
  const { error } = await searchParams;
  const client = await db.client.findFirst({ where: { id, deletedAt: null } });
  if (!client) notFound();

  return (
    <div>
      <PageHeader title={`Edit ${client.name}`} subtitle={client.code} />
      {error ? <Notice>{error}</Notice> : null}
      <Card>
        <ClientForm action={updateClient.bind(null, client.id)} values={client} cancelHref={`/clients/${client.id}`} />
      </Card>
    </div>
  );
}
