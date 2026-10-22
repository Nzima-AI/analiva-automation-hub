import type { ReactNode } from "react";
import { BookOpen, CalendarCheck, EnvelopeOpen, ShieldCheck } from "@phosphor-icons/react/dist/ssr";

const POINTS = [
  { icon: EnvelopeOpen, title: "Invoices read from the inbox", body: "Filed to the right client without retyping." },
  { icon: BookOpen, title: "Books that keep themselves", body: "Bank lines matched, statements always current." },
  { icon: CalendarCheck, title: "Every SARS date in one place", body: "VAT201, EMP201, provisional tax and CIPC." },
];

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="grid min-h-[100dvh] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:px-16">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-sm font-bold text-white shadow-[0_10px_24px_-10px_rgb(0_134_195/0.7)]">A</span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight text-ink">Analiva</span>
            <span className="block text-xs text-muted">Automation Hub</span>
          </span>
        </div>
        <div className="mx-auto w-full max-w-sm py-12">
          <h1 data-reveal className="font-display text-[30px] font-semibold leading-tight tracking-tight text-ink">
            {title}
          </h1>
          {subtitle ? (
            <p data-reveal className="mt-2 text-sm text-muted">
              {subtitle}
            </p>
          ) : null}
          <div data-reveal className="mt-8">
            {children}
          </div>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-faint">
          <ShieldCheck className="h-3.5 w-3.5" /> Two-step sign-in. Your data stays in your practice&apos;s workspace.
        </p>
      </section>

      <aside className="auth-panel relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-end">
        <div className="auth-orb auth-orb-a" aria-hidden />
        <div className="auth-orb auth-orb-b" aria-hidden />
        <div className="relative z-10 max-w-lg p-14">
          <p className="font-display text-[40px] font-semibold leading-[1.08] tracking-tight text-white">Less capturing. More accounting.</p>
          <ul className="mt-10 space-y-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] backdrop-blur">
                  <p.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-[15px] font-medium text-white">{p.title}</span>
                  <span className="block text-sm text-white/65">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
