"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface Enrolment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export function MfaForm({ hasFactor }: { hasFactor: boolean }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;

    async function prepare() {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        setError(listError.message);
        return;
      }
      if (hasFactor) {
        const verified = data.totp.find((f) => f.status === "verified");
        if (!cancelled) setFactorId(verified?.id ?? null);
        return;
      }
      // Clear abandoned enrolments before starting a fresh one.
      for (const f of data.all.filter((f) => f.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: enrolled, error: enrolError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enrolError) {
        setError(enrolError.message);
        return;
      }
      if (!cancelled) {
        setFactorId(enrolled.id);
        setEnrolment({ factorId: enrolled.id, qrCode: enrolled.totp.qr_code, secret: enrolled.totp.secret });
      }
    }

    prepare().catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not start two-step login."));
    return () => {
      cancelled = true;
    };
  }, [hasFactor]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabaseBrowser().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (verifyError) {
      setBusy(false);
      setError("That code didn't work. Check the time on your phone and try the next code.");
      return;
    }
    window.location.assign("/");
  }

  return (
    <div className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      {enrolment ? (
        <div className="rounded-lg border border-line bg-panel p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL SVG from Supabase */}
          <img src={enrolment.qrCode} alt="QR code for your authenticator app" className="mx-auto h-48 w-48" />
          <p className="mt-3 break-all text-center font-mono text-xs text-muted">{enrolment.secret}</p>
        </div>
      ) : null}
      <form onSubmit={verify} className="space-y-4">
        <Field label="6-digit code">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
          />
        </Field>
        <Button type="submit" className="w-full" disabled={busy || !factorId}>
          {busy ? "Checking…" : "Verify"}
        </Button>
      </form>
    </div>
  );
}
