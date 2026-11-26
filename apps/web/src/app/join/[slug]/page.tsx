import { notFound } from "next/navigation";
import { CheckCircle, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { rootDb } from "@aah/db";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { joinList } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stay in touch on WhatsApp", robots: { index: false } };

/** Public WhatsApp opt-in page for a practice (off until the owner switches it on). */
export default async function JoinPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { slug } = await params;
  const { done, error } = await searchParams;
  const practice = await rootDb().practice.findUnique({ where: { slug }, select: { name: true, marketingSettings: { select: { optInEnabled: true, optInHeadline: true } } } });
  if (!practice?.marketingSettings?.optInEnabled) notFound();
  const headline = practice.marketingSettings.optInHeadline || `Get updates from ${practice.name} on WhatsApp`;

  return (
    <main className="app-backdrop grid min-h-[100dvh] place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-[1.5rem] border border-line bg-panel p-6 shadow-md sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#25d366] text-white shadow-[0_10px_26px_-8px_rgb(37_211_102/0.75)]"><WhatsappLogo size={26} weight="fill" aria-hidden /></span>
        <p className="mt-5 text-sm font-medium text-muted">{practice.name}</p>
        <h1 className="editorial-heading mt-1 text-[34px] leading-tight text-ink">{headline}</h1>
        {done ? (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-positive/25 bg-positive-soft p-4 text-sm text-ink">
            <CheckCircle size={22} weight="fill" className="shrink-0 text-positive" aria-hidden />
            <p>You&apos;re on the list. We&apos;ll be in touch on WhatsApp. Reply STOP to any message to opt out.</p>
          </div>
        ) : (
          <form action={joinList.bind(null, slug)} className="mt-6 space-y-4">
            {error ? <Notice>{error}</Notice> : null}
            <Field label="Your name"><Input name="name" required maxLength={200} autoComplete="name" /></Field>
            <Field label="Mobile number" hint="The number you use for WhatsApp."><Input name="phone" type="tel" required maxLength={40} autoComplete="tel" placeholder="082 123 4567" /></Field>
            <Field label="Email (optional)"><Input name="email" type="email" maxLength={200} autoComplete="email" /></Field>
            <Field label="Business name (optional)"><Input name="company" maxLength={200} autoComplete="organization" /></Field>
            <Field label="Most interested in">
              <Select name="interest" defaultValue="REPORTING"><option value="REPORTING">Financial reporting</option><option value="BOOKKEEPING">Bookkeeping</option><option value="PAYROLL">Payroll</option></Select>
            </Field>
            <div className="hidden" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            <label className="flex items-start gap-3 text-sm text-ink-2">
              <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
              <span>I agree that {practice.name} may send me updates and offers on WhatsApp. I can reply STOP at any time to opt out.</span>
            </label>
            <Button type="submit" className="w-full">Join on WhatsApp</Button>
            <p className="text-center text-xs text-faint">Your details are used only by {practice.name}, as POPIA requires.</p>
          </form>
        )}
      </section>
    </main>
  );
}
