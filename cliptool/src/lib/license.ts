// src/lib/license.ts
import { supabase } from "./supabase";

export async function verifyLicense(userId: string) {
  return supabase
    .from("licenses")
    .select("plan, active")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
}