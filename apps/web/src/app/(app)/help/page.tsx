import { GuideBody } from "@/components/help/guide-body";
import { HelpCenter } from "@/components/help/help-center";
import { sectionsFor } from "@/lib/guide";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Help" };

export default async function HelpPage() {
  await requireStaff();
  const sections = sectionsFor("staff").map((s) => ({ id: s.id, title: s.title, summary: s.summary, text: s.body, content: <GuideBody body={s.body} /> }));
  return <HelpCenter sections={sections} title="Help centre" intro="How the hub works, from the first sign-in to VAT201. Search, or jump to a topic." />;
}
