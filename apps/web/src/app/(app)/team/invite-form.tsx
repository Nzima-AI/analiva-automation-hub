"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { inviteUser, type InviteState } from "./actions";

export function InviteForm({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteUser, { status: "idle" });
  const [role, setRole] = useState("STAFF");

  return (
    <form action={action} className="space-y-4">
      {state.status === "error" ? <Notice>{state.message}</Notice> : null}
      {state.status === "ok" ? (
        <Notice tone="brand">
          <p>
            Login created for <strong>{state.email}</strong>. Send them this one-time link to choose a password (it expires in 24 hours):
          </p>
          <Input readOnly value={state.link} className="mt-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        </Notice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" required />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Role">
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="STAFF">Practice staff</option>
            <option value="CLIENT">Client (business owner)</option>
            <option value="CLIENT_STAFF">Client staff</option>
          </Select>
        </Field>
        {role !== "STAFF" ? (
          <Field label="Client">
            <Select name="clientId" required defaultValue="">
              <option value="" disabled>
                Choose a client
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create login"}
      </Button>
    </form>
  );
}
