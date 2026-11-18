"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { cx } from "@/components/ui";

export interface HelpSection {
  id: string;
  title: string;
  summary: string;
  text: string;
  content: ReactNode;
}

/** Guide with a filter box and a table of contents that follows the reader. */
export function HelpCenter({ sections, title, intro }: { sections: HelpSection[]; title: string; intro: string }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const shown = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return terms.length ? sections.filter((s) => terms.every((t) => `${s.title} ${s.summary} ${s.text}`.toLowerCase().includes(t))) : sections;
  }, [q, sections]);

  useEffect(() => {
    const els = shown.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [shown]);

  return (
    <div>
      <section data-reveal className="ink mb-8 rounded-3xl border border-white/10 px-6 py-9 sm:px-10">
        <h1 className="font-display text-[34px] font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-2 max-w-[60ch] text-sm text-white/65">{intro}</p>
        <label className="relative mt-6 block max-w-xl">
          <MagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the guide, e.g. mandate, VAT201, bank rules"
            className="h-12 w-full rounded-xl border border-white/15 bg-white/10 pl-11 pr-4 text-[15px] text-white outline-none backdrop-blur transition-all placeholder:text-white/45 focus:border-white/40 focus:bg-white/15"
            aria-label="Search the guide"
          />
        </label>
      </section>

      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="hidden lg:block" aria-label="Guide contents">
          <ul className="sticky top-24 space-y-0.5 border-l border-line">
            {shown.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={cx(
                    "-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors",
                    active === s.id ? "border-brand font-medium text-ink" : "border-transparent text-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-14">
          {shown.length === 0 ? <p className="text-sm text-muted">Nothing in the guide matches “{q}”.</p> : null}
          {shown.map((s) => (
            <article key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">{s.title}</h2>
              <p className="mb-5 mt-1 text-sm text-muted">{s.summary}</p>
              {s.content}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
