"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { testMailAccount, type TestState } from "../../actions";

export function TestPanel({ accountId, canSend, ownerEmail }: { accountId: string; canSend: boolean; ownerEmail: string }) {
  const [state, action, pending] = useActionState<TestState, FormData>(testMailAccount.bind(null, accountId), { status: "idle" });

  return (
    <form action={action} className="space-y-3">
      {canSend ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sendTest" className="accent-brand" />
          Also send a test email to {ownerEmail}
        </label>
      ) : null}
      <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
        {pending ? "Testing… (up to 30s)" : "Test connection"}
      </Button>
      {state.status === "done" ? (
        <ul className="space-y-1 text-sm">
          {state.results.map((r, i) => (
            <li key={i} className={r.ok ? "text-brand" : "text-danger"}>
              {r.ok ? "✓" : "✗"} {r.detail}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
