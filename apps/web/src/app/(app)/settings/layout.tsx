import { NavLink } from "@/components/nav-link";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/session";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { ctx } = await requireStaff();
  return (
    <div>
      <PageHeader title="Settings" />
      <nav className="mb-6 flex gap-1 border-b border-line pb-3">
        <NavLink href="/settings" exact>
          Practice and profile
        </NavLink>
        {ctx.role === "OWNER" ? <NavLink href="/settings/email">Email accounts</NavLink> : null}
      </nav>
      {children}
    </div>
  );
}
