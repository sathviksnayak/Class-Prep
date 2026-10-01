import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
}

if (!supabaseServiceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

/**
 * Server-side Supabase client using the service role key.
 * NEVER expose this to the browser — only use in server actions / API routes.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const storageBucket = process.env.SUPABASE_STORAGE_BUCKET;
if (!storageBucket) {
  throw new Error("SUPABASE_STORAGE_BUCKET is not set");
}
export const STORAGE_BUCKET = storageBucket;

/** Fail closed if the configured bucket is missing or has been made public. */
export async function assertPrivateStorageBucket() {
  const { data, error } = await supabaseAdmin.storage.getBucket(STORAGE_BUCKET);
  if (error || !data) {
    console.error("[storage] Could not verify the configured bucket:", error?.message);
    throw new Error("Document storage is unavailable. Please contact support.");
  }
  if (data.public) {
    console.error(`[storage] Bucket ${STORAGE_BUCKET} is public; refusing document operation.`);
    throw new Error("Document storage must be private. Please contact support.");
  }
}

/**
 * Build the storage path for a document.
 * Format: userId/folderId/filename  (or userId/root/filename for root uploads)
 */
export function buildStoragePath(userId: string, folderId: string | null, filename: string): string {
  const folder = folderId ?? "root";
  // Sanitise filename to avoid issues with special chars while preserving extension
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${userId}/${folder}/${randomUUID()}_${safe}`;
}
