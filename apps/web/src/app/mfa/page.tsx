import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { loadSession } from "@/lib/session";
import { MfaForm } from "./mfa-form";

export const metadata = { title: "Two-step login" };

export default async function MfaPage() {
  const result = await loadSession();
  if (result.status === "signed-out") redirect("/login");
  if (result.status === "ok") redirect("/");
  if (result.status !== "mfa-required") redirect("/login?error=" + encodeURIComponent("This login has no access to the platform."));

  return (
    <AuthShell
      title={result.hasFactor ? "Enter your code" : "Set up two-step login"}
      subtitle={
        result.hasFactor
          ? "Open your authenticator app and enter the 6-digit code."
          : "Scan the QR code with Google Authenticator, Microsoft Authenticator or 1Password, then enter the code it shows."
      }
    >
      <MfaForm hasFactor={result.hasFactor} />
      <form action="/auth/signout" method="post" className="mt-6">
        <button className="text-sm text-muted hover:text-ink">Sign out</button>
      </form>
    </AuthShell>
  );
}
