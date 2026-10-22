import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthShell } from "@/components/auth-shell";
import { Button, Field, Input, Notice } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Sign in" };

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

async function signIn(formData: FormData) {
  "use server";
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/login?error=" + encodeURIComponent("Enter your email and password."));

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    console.warn("sign-in failed", { email: parsed.data.email, reason: error.message });
    redirect("/login?error=" + encodeURIComponent("Email or password is incorrect."));
  }
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { error, message } = await searchParams;
  return (
    <AuthShell title="Sign in" subtitle="Use the email your practice registered for you.">
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone="brand">{message}</Notice> : null}
      <form action={signIn} className="space-y-4">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        <Link href="/forgot-password" className="text-brand hover:underline">
          Forgot your password?
        </Link>
      </p>
    </AuthShell>
  );
}
