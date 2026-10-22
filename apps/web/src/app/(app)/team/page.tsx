import { redirect } from "next/navigation";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { formatDate, humanise } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { setUserDisabled } from "./actions";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const { db, ctx } = await requireStaff();
  if (ctx.role !== "OWNER") redirect("/");
  const [users, clients] = await Promise.all([
    db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }], include: { client: { select: { name: true } } } }),
    db.client.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader title="Team and logins" subtitle="Everyone signs in with a password plus an authenticator app." />
      <Card title="Create a login" className="mb-6">
        <InviteForm clients={clients} />
      </Card>
      <Card title="People">
        <Table head={["Name", "Email", "Role", "Client", "Since", ""]}>
          {users.map((u) => (
            <tr key={u.id}>
              <Td className="font-medium">{u.name}</Td>
              <Td>{u.email}</Td>
              <Td>
                <Badge tone={u.role === "OWNER" ? "brand" : "neutral"}>{humanise(u.role)}</Badge>
              </Td>
              <Td>{u.client?.name ?? "—"}</Td>
              <Td className="tabular whitespace-nowrap">{formatDate(u.createdAt)}</Td>
              <Td className="text-right">
                {u.id !== ctx.userId ? (
                  <form action={setUserDisabled.bind(null, u.id, !u.disabledAt)}>
                    <button className={"text-sm " + (u.disabledAt ? "text-brand" : "text-danger") + " hover:underline"}>
                      {u.disabledAt ? "Re-enable" : "Disable"}
                    </button>
                  </form>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
