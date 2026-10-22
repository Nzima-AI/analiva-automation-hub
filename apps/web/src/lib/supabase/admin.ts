import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/** Service-role client. Server only: storage and admin user management. */
export function supabaseAdmin() {
  return createClient(publicEnv().url, serverEnv().serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
