"use client";

import { useState } from "react";
import { Buildings, UserCircle } from "@phosphor-icons/react";
import { cx } from "@/components/ui";

export interface SendAsOption {
  value: "PRACTICE" | "CLIENT";
  title: string;
  fromLine: string;
  replyTo: string | null;
  footer: string;
  disabledReason: string | null;
}

/** "Send on behalf of" switch with a live preview of what the recipient will see. */
export function SendAsToggle({ options, defaultValue }: { options: SendAsOption[]; defaultValue: "PRACTICE" | "CLIENT" }) {
  const usable = options.find((o) => o.value === defaultValue && !o.disabledReason) ?? options.find((o) => !o.disabledReason) ?? options[0]!;
  const [value, setValue] = useState(usable.value);
  const current = options.find((o) => o.value === value)!;
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-ink-2">Send as</legend>
      <input type="hidden" name="sendAs" value={value} />
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
        {options.map((o) => {
          const Icon = o.value === "PRACTICE" ? Buildings : UserCircle;
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!!o.disabledReason}
              onClick={() => setValue(o.value)}
              className={cx(
                "group flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
                active ? "border-brand bg-brand-soft shadow-sm" : "border-line bg-panel hover:-translate-y-px hover:border-line-strong hover:shadow-sm",
                o.disabledReason && "cursor-not-allowed opacity-60 hover:translate-y-0",
              )}
            >
              <Icon size={22} weight={active ? "fill" : "regular"} className={active ? "text-brand-text" : "text-faint"} />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{o.title}</span>
                <span className="block truncate text-xs text-muted">{o.disabledReason ?? o.fromLine}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 rounded-xl border border-line bg-panel-2 p-3 text-xs text-muted">
        <p>
          <span className="text-faint">From:</span> <span className="text-ink">{current.fromLine}</span>
        </p>
        {current.replyTo ? (
          <p>
            <span className="text-faint">Replies go to:</span> <span className="text-ink">{current.replyTo}</span>
          </p>
        ) : null}
        <p>
          <span className="text-faint">Footer:</span> {current.footer}
        </p>
      </div>
    </fieldset>
  );
}
