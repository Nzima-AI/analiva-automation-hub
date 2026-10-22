import "server-only";
import type { TenantDb } from "@aah/db";
import type { SendAsOption } from "@/components/send-as-toggle";
import { senderFor } from "@/lib/outbound";

/** Both identities for the Send-as toggle, with previews and why one might be unavailable. */
export async function sendAsOptions(db: TenantDb, clientId: string, practiceName: string): Promise<{ options: SendAsOption[]; error: string | null }> {
  const [asPractice, asClient] = await Promise.all([senderFor(db, clientId, "PRACTICE"), senderFor(db, clientId, "CLIENT")]);
  if ("error" in asPractice) return { options: [], error: asPractice.error ?? "Can't send yet." };
  const option = (value: "PRACTICE" | "CLIENT", r: Awaited<ReturnType<typeof senderFor>>, title: string): SendAsOption => {
    if ("error" in r) return { value, title, fromLine: "", replyTo: null, footer: "", disabledReason: r.error ?? "Unavailable" };
    const s = r.sender;
    return s.ok
      ? { value, title, fromLine: `${s.fromName} <${s.fromAddress}>`, replyTo: s.replyTo, footer: s.footer, disabledReason: null }
      : { value, title, fromLine: "", replyTo: null, footer: "", disabledReason: s.reason };
  };
  const clientName = "error" in asClient ? "the client" : asClient.client.tradingName || asClient.client.name;
  return {
    options: [option("PRACTICE", asPractice, `${practiceName} (the practice)`), option("CLIENT", asClient, `${clientName} (on their behalf)`)],
    error: null,
  };
}
