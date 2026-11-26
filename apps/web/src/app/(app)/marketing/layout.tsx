import type { ReactNode } from "react";
import { marketingSettings } from "@/lib/marketing/engine";
import { requireStaff } from "@/lib/session";

/** Marketing pages share the demo-mode banner. */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const { db } = await requireStaff();
  const settings = await marketingSettings(db);
  return (
    <>
      {settings.demoMode && (
        <p className="mb-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-ink">
          <b>Demo mode.</b> WhatsApp messages aren&apos;t really sent: replies, reads and sign-ups are simulated so you can see everything working. Switch it off under Settings once Meta is connected.
        </p>
      )}
      {children}
    </>
  );
}
