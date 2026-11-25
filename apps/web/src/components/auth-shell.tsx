import Image from "next/image";
import { ThemeToggle } from "@/components/shell/appearance";
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
        <div className="flex items-center justify-between gap-4">
          <div className="shell-brand">
            <Image className="shell-mark" src="/brand/analiva-mark.png" width={34} height={34} alt="" unoptimized />
            <span className="shell-wordmark">analiva</span>
          </div>
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-sm py-12">
          <h1 data-reveal className="editorial-heading text-[48px] font-normal leading-tight tracking-tight text-ink">
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

      <aside className="auth-panel relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between">
        <div className="auth-photo" aria-hidden />
        <div className="auth-orb auth-orb-a" aria-hidden />
        <div className="auth-orb auth-orb-b" aria-hidden />
        <div className="auth-constellation" aria-hidden><i /><i /><i /></div>
        <div className="auth-shade" aria-hidden />

        <div className="relative z-10 flex items-center justify-between p-14 pb-0">
          <p className="auth-rise flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55" style={{ "--d": "0.1s" } as React.CSSProperties}>
            <span className="h-px w-8 bg-white/30" aria-hidden /> Analiva Automation Hub
          </p>
          <p className="auth-chip auth-rise" style={{ "--d": "0.9s" } as React.CSSProperties}>
            <span className="auth-chip-dot" aria-hidden /> Inbox checked every five minutes
          </p>
        </div>

        <div className="relative z-10 max-w-xl p-14">
          <p className="editorial-heading text-[60px] font-normal leading-[1.04] tracking-tight text-white">
            <span className="auth-line"><span style={{ "--d": "0.2s" } as React.CSSProperties}>Less capturing.</span></span>
            <span className="auth-line"><span style={{ "--d": "0.35s" } as React.CSSProperties}>More accounting.</span></span>
          </p>
          <ul className="mt-10 max-w-md">
            {POINTS.map((p, i) => (
              <li key={p.title} className="auth-point auth-rise" style={{ "--d": `${0.55 + i * 0.12}s` } as React.CSSProperties}>
                <p.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#7fd8ff]" weight="light" />
                <span>
                  <span className="block text-[15px] font-medium text-white">{p.title}</span>
                  <span className="mt-0.5 block text-sm text-white/55">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="absolute bottom-4 right-6 z-10 text-[10px] text-white/25">
          Photo: <a href="https://commons.wikimedia.org/wiki/File:Night_in_Joburg.jpg" className="hover:text-white/60">South African Tourism</a>,{" "}
          <a href="https://creativecommons.org/licenses/by-sa/2.0/" className="hover:text-white/60">CC BY-SA 2.0</a>
        </p>
      </aside>
    </main>
  );
}
