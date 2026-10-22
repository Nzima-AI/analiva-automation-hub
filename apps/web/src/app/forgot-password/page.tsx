import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthShell } from "@/components/auth-shell";
import { Button, Field, Input, Notice } from "@/components/ui";
import { appUrl } from "@/lib/app-url";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Reset password" };

async function sendReset(formData: FormData) {
  "use server";
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) redirect("/forgot-password?error=" + encodeURIComponent("Enter a valid email."));

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${await appUrl()}/auth/callback?next=/account/password`,
  });
  if (error) console.error("password reset email failed", { reason: error.message });
  // Same message either way, so the form does not reveal which emails exist.
  redirect("/login?message=" + encodeURIComponent("If that email has an account, a reset link is on its way."));
}

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {error ? <Notice>{error}</Notice> : null}
      <form action={sendReset} className="space-y-4">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <Button type="submit" className="w-full">
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        <Link href="/login" className="text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
