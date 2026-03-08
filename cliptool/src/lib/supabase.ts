// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

// Use placeholders when env is missing or empty so the build (e.g. CI) never throws.
// Real values must be set in GitHub Actions variables or .env for the app to work at runtime.
const _url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const _key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseUrl = typeof _url === "string" && _url.trim() !== "" ? _url : "https://placeholder.supabase.co";
const supabaseAnonKey = typeof _key === "string" && _key.trim() !== "" ? _key : "placeholder";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Passed to the desktop backend for sync_license_from_supabase when the process has no env vars. */
export function getSupabaseConfigForBackend(): {
  supabase_url: string;
  supabase_anon_key: string;
} {
  return {
    supabase_url: supabaseUrl ?? "",
    supabase_anon_key: supabaseAnonKey ?? "",
  };
}