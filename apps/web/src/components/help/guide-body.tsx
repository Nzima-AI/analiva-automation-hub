import type { ReactNode } from "react";
import { Lightbulb } from "@phosphor-icons/react/dist/ssr";

/** Inline **bold** and `code`. Static guide text only. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(
      t.startsWith("**") ? (
        <strong key={i++} className="font-semibold text-ink">
          {t.slice(2, -2)}
        </strong>
      ) : (
        <code key={i++} className="rounded-md border border-line bg-subtle px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
          {t.slice(1, -1)}
        </code>
      ),
    );
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function GuideBody({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/);
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-2">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const bullets = lines.filter((l) => l.startsWith("- "));
        const steps = lines.filter((l) => /^\d+\. /.test(l));
        const lead = lines.filter((l) => !l.startsWith("- ") && !/^\d+\. /.test(l) && !l.startsWith("> "));
        if (block.startsWith("> ")) {
          return (
            <p key={bi} className="flex gap-3 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm text-ink-2">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-text" weight="duotone" />
              <span>{inline(block.slice(2))}</span>
            </p>
          );
        }
        return (
          <div key={bi} className="space-y-2.5">
            {lead.length ? <p className="max-w-[68ch]">{inline(lead.join(" "))}</p> : null}
            {bullets.length ? (
              <ul className="max-w-[68ch] space-y-1.5">
                {bullets.map((b, i) => (
                  <li key={i} className="relative pl-5 before:absolute before:left-0 before:top-[0.7em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-brand/60">
                    {inline(b.slice(2))}
                  </li>
                ))}
              </ul>
            ) : null}
            {steps.length ? (
              <ol className="max-w-[68ch] space-y-2">
                {steps.map((st, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-xs text-brand-text shadow-xs">{i + 1}</span>
                    <span>{inline(st.replace(/^\d+\. /, ""))}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
