"use client";

import { useRef } from "react";
import { Button, Textarea } from "@/components/ui";

/** Reply box with one-tap saved replies. */
export function Composer({ action, saved, disabled }: { action: (form: FormData) => void; saved: Array<{ id: string; title: string; body: string }>; disabled?: string }) {
  const box = useRef<HTMLTextAreaElement>(null);
  return (
    <form action={action} className="space-y-2">
      {saved.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Saved replies">
          {saved.map((s) => (
            <button key={s.id} type="button" onClick={() => { if (box.current) { box.current.value = s.body; box.current.focus(); } }} className="min-h-9 rounded-full border border-line px-3 text-xs hover:border-brand hover:text-brand-text">
              {s.title}
            </button>
          ))}
        </div>
      ) : null}
      <Textarea ref={box} name="text" required maxLength={4000} rows={3} placeholder={disabled ?? "Type a reply"} disabled={Boolean(disabled)} aria-label="Reply" />
      <Button type="submit" disabled={Boolean(disabled)}>Send reply</Button>
    </form>
  );
}
