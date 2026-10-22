import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";

export default function NotFound() {
  return (
    <AuthShell title="Not found" subtitle="That record doesn't exist, or you don't have access to it.">
      <Link href="/" className="text-sm text-brand hover:underline">
        Back to lookup
      </Link>
    </AuthShell>
  );
}
