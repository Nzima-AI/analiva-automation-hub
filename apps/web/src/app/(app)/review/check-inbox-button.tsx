"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { checkInboxNow, type CheckState } from "./actions";

export function CheckInboxButton() {
  const [state, action, pending] = useActionState<CheckState>(checkInboxNow, { status: "idle" });
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Checking inbox…" : "Check inbox now"}
      </Button>
      {state.status === "done" ? (
        <span className="text-xs text-muted">
          {state.results.length === 0
            ? "No inbound mailbox set up (Settings → Email accounts)."
            : state.results
                .map((r) => (r.error ? `${r.account}: ${r.error}` : `${r.account}: ${r.fetched} new, ${r.filed} filed, ${r.queued} to review`))
                .join(" · ")}
        </span>
      ) : null}
    </form>
  );
}
