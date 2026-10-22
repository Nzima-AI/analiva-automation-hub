/**
 * One-off: create the private documents bucket in Supabase Storage.
 * Usage: pnpm setup:storage   (reads .env at the repo root)
 */
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.DOCUMENTS_BUCKET || "documents";
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: existing } = await supabase.storage.getBucket(bucket);
if (existing) {
  console.log(`Bucket "${bucket}" already exists (public: ${existing.public}).`);
  if (existing.public) {
    await supabase.storage.updateBucket(bucket, { public: false });
    console.log("Made it private.");
  }
} else {
  const { error } = await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit: "50MB" });
  if (error) throw error;
  console.log(`Created private bucket "${bucket}".`);
}
