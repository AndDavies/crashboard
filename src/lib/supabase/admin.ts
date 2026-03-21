import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for trusted server-only flows (e.g. ingestion).
 * Bypasses RLS; never import this from client components or expose the key.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url?.trim()) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL (required for admin Supabase client).",
    );
  }
  if (!serviceRoleKey?.trim()) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (required for ingestion writes while RLS has no policies).",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
