import { LockSimple } from "@phosphor-icons/react/dist/ssr";
import { Badge, Button, Textarea, cx } from "@/components/ui";
import { formatDateTime, humanise } from "@/lib/format";

export const ENQUIRY_STATUS = {
  OPEN: { label: "Waiting on the practice", tone: "warn" },
  AWAITING_CLIENT: { label: "Waiting on the client", tone: "brand" },
  RESOLVED: { label: "Resolved", tone: "positive" },
} as const;

export function EnquiryStatusBadge({ status, viewer }: { status: keyof typeof ENQUIRY_STATUS; viewer: "PRACTICE" | "CLIENT" }) {
  const s = ENQUIRY_STATUS[status];
  const label = viewer === "CLIENT" && status === "OPEN" ? "With your accountant" : viewer === "CLIENT" && status === "AWAITING_CLIENT" ? "Reply needed" : s.label;
  return <Badge tone={s.tone}>{label}</Badge>;
}

interface Message {
  id: string;
  authorName: string;
  authorSide: string;
  body: string;
  internal: boolean;
  createdAt: Date;
}

/** Conversation view. Viewer's own side sits on the right. */
export function EnquiryThread({ messages, viewer }: { messages: Message[]; viewer: "PRACTICE" | "CLIENT" }) {
  return (
    <ol className="space-y-4">
      {messages.map((m) => {
        const mine = m.authorSide === viewer;
        return (
          <li key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
            <div
              className={cx(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-xs",
                m.internal ? "border border-dashed border-warn/40 bg-warn-soft" : mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-line bg-panel",
              )}
            >
              <p className={cx("mb-1 flex items-center gap-1.5 text-xs", mine && !m.internal ? "text-white/80" : "text-muted")}>
                {m.internal ? <LockSimple className="h-3 w-3" /> : null}
                <span className="font-medium">{m.authorName}</span>
                <span aria-hidden>·</span>
                <span className="tabular">{formatDateTime(m.createdAt)}</span>
                {m.internal ? <span className="font-medium text-warn">Internal note</span> : null}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ReplyBox({ action, staff }: { action: (fd: FormData) => Promise<void>; staff: boolean }) {
  return (
    <form action={action} className="space-y-3">
      <Textarea name="body" required rows={4} placeholder={staff ? "Write a reply to the client" : "Write a reply"} aria-label="Reply" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {staff ? (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="internal" className="accent-[var(--brand)]" /> Internal note (the client won&apos;t see it)
          </label>
        ) : (
          <span />
        )}
        <Button type="submit">Send</Button>
      </div>
    </form>
  );
}

export const ENQUIRY_CATEGORIES = ["GENERAL", "INVOICES", "TAX", "PAYROLL", "CIPC", "DOCUMENTS", "REPORTS"] as const;
export const categoryLabel = (c: string) => (c === "CIPC" ? "CIPC" : humanise(c));
