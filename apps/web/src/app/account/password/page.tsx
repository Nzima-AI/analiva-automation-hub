import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthShell } from "@/components/auth-shell";
import { Button, Field, Input, Notice } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Choose a password" };

const schema = z
  .object({ password: z.string().min(12, "Use at least 12 characters."), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match." });

async function setPassword(formData: FormData) {
  "use server";
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/account/password?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid password."));
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.warn("password update failed", { reason: error.message });
    redirect("/account/password?error=" + encodeURIComponent(error.message));
  }
  redirect("/");
}

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { error } = await searchParams;

  return (
    <AuthShell title="Choose a password" subtitle={data.user.email ?? undefined}>
      {error ? <Notice>{error}</Notice> : null}
      <form action={setPassword} className="space-y-4">
        <Field label="New password" hint="At least 12 characters.">
          <Input name="password" type="password" autoComplete="new-password" minLength={12} required autoFocus />
        </Field>
        <Field label="Confirm password">
          <Input name="confirm" type="password" autoComplete="new-password" minLength={12} required />
        </Field>
        <Button type="submit" className="w-full">
          Save password
        </Button>
      </form>
    </AuthShell>
  );
}
