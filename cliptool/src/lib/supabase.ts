// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);

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