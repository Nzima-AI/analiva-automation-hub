function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function publicEnv() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

export function serverEnv() {
  return {
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    documentsBucket: process.env.DOCUMENTS_BUCKET || "documents",
    requireMfa: process.env.REQUIRE_MFA !== "false",
  };
}

/** 32-byte base64 key for encrypting stored credentials (mailbox passwords). */
export function secretsKey(): string {
  return required("SECRETS_KEY", process.env.SECRETS_KEY);
}
