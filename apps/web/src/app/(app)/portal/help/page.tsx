import { GuideBody } from "@/components/help/guide-body";
import { HelpCenter } from "@/components/help/help-center";
import { sectionsFor } from "@/lib/guide";
import { requireClient } from "@/lib/session";

export const metadata = { title: "Help" };

export default async function PortalHelpPage() {
  const { practice } = await requireClient();
  const sections = sectionsFor("client").map((s) => ({ id: s.id, title: s.title, summary: s.summary, text: s.body, content: <GuideBody body={s.body} /> }));
  return <HelpCenter sections={sections} title="Using your portal" intro={`Everything you can do here with ${practice.name}. Still stuck? Open an enquiry.`} />;
}
