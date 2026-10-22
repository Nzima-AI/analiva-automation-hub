import { Card, Notice, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { createClient } from "../actions";
import { ClientForm } from "../client-form";

export const metadata = { title: "New client" };

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireStaff();
  const { error } = await searchParams;
  return (
    <div>
      <PageHeader title="New client" subtitle="A client code and workspace are created automatically." />
      {error ? <Notice>{error}</Notice> : null}
      <Card>
        <ClientForm action={createClient} showServices cancelHref="/clients" />
      </Card>
    </div>
  );
}
