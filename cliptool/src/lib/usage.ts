import { supabase } from "./supabase";

export type PaidPlanKey = "free" | "pro" | "max";

export const PLAN_MONTHLY_CLIP_LIMIT: Record<PaidPlanKey, number> = {
  free: 10,
  pro: 120,
  max: 500,
};

export function normalizePlan(input: string | null | undefined): PaidPlanKey {
  const v = (input ?? "").toLowerCase();
  if (v === "max") return "max";
  if (v === "pro") return "pro";
  return "free";
}

export async function getCurrentMonthlyUsage(plan: PaidPlanKey, userId: string) {
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);
  const periodKey = periodStart.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("clip_usage_monthly")
    .select("clips_used")
    .eq("user_id", userId)
    .eq("period_start", periodKey)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      error: error.message || "Failed to read usage",
    };
  }

  const used = Number(data?.clips_used ?? 0);
  const limit = PLAN_MONTHLY_CLIP_LIMIT[plan];
  return {
    ok: true as const,
    result: {
      used,
      limit,
      remaining: Math.max(0, limit - used),
    },
  };
}

export async function reserveClipExports(params: {
  plan: PaidPlanKey;
  requested: number;
}) {
  const requested = Math.max(1, Math.floor(params.requested));
  const { data, error } = await supabase.rpc("reserve_clip_exports", {
    p_plan: params.plan,
    p_requested: requested,
  });

  if (error) {
    return {
      ok: false as const,
      error: error.message || "Failed to reserve clip exports",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true as const,
    result: {
      allowed: Boolean(row?.allowed),
      used: Number(row?.used ?? 0),
      limit: Number(row?.limit ?? 0),
      remaining: Number(row?.remaining ?? 0),
      message: row?.message ? String(row.message) : null,
    },
  };
}

export async function releaseClipExports(params: { count: number }) {
  const count = Math.max(1, Math.floor(params.count));
  const { data, error } = await supabase.rpc("release_clip_exports", {
    p_count: count,
  });

  if (error) {
    return {
      ok: false as const,
      error: error.message || "Failed to refund clip exports",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true as const,
    result: {
      used: Number(row?.used ?? 0),
      refunded: Number(row?.refunded ?? 0),
    },
  };
}

