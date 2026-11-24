import { ArrowUpRight, Check, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { Badge, Button, Card, InkPanel, Notice, PageHeader } from "@/components/ui";
import { CURRENT_TIER, UPGRADE_TIER } from "@/lib/plan";
import { requireStaff } from "@/lib/session";
import { requestUpgrade } from "./actions";

export const metadata = { title: "Workspace tier" };

const currentFeatures = ["Inbox and invoice processing", "Client records and follow-ups", "Campaign drafting and approval"];
const proposedFeatures = ["Scheduled campaign delivery", "Automated client journeys", "analiva.app invoice handoff after client approval"];

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { db, ctx, practice } = await requireStaff();
  const { error } = await searchParams;
  const request = await db.auditLog.findFirst({
    where: { action: "workspace.upgrade_requested", entityType: "Practice", entityId: practice.id },
    select: { id: true },
  });

  return (
    <>
      <PageHeader title="Workspace tier" subtitle={practice.name} />
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={CURRENT_TIER} actions={<Badge tone="brand">Current tier</Badge>}>
          <ul className="space-y-3 pt-3 text-sm text-muted">
            {currentFeatures.map((item) => <li key={item} className="flex items-center gap-2"><Check size={17} className="shrink-0 text-brand-text" aria-hidden />{item}</li>)}
          </ul>
        </Card>
        <InkPanel className="p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="editorial-heading text-4xl text-white">{UPGRADE_TIER}</h2>
            <span className="rounded-full border border-white/20 px-2.5 py-1 text-xs text-white/80">Proposed tier</span>
          </div>
          <ul className="my-5 space-y-3 text-sm text-white/80">
            {proposedFeatures.map((item) => <li key={item} className="flex items-center gap-2"><Sparkle size={17} className="shrink-0 text-[#8ee2ff]" aria-hidden />{item}</li>)}
          </ul>
          {request ? (
            <p className="text-sm text-[#a6edff]" role="status">Upgrade interest recorded for this workspace.</p>
          ) : ctx.role === "OWNER" ? (
            <form action={requestUpgrade}>
              <Button type="submit" variant="secondary">Request upgrade <ArrowUpRight size={16} aria-hidden /></Button>
            </form>
          ) : (
            <p className="text-sm text-white/80">Ask your workspace owner to request an upgrade.</p>
          )}
          <p className="mt-3 text-xs text-white/70">Requests are recorded in the workspace. Billing and activation are pending.</p>
        </InkPanel>
      </div>
    </>
  );
}
