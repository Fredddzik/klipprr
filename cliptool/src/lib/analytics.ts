const TRACK_URL = "https://klipprr.com/api/track";

export interface AnalyticsBase {
  externalId: string | null;
  email: string | null;
  plan: "free" | "pro" | "max";
}

export function track(
  base: AnalyticsBase,
  event: string,
  extra: Record<string, unknown> = {}
): void {
  fetch(TRACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...base, event, ...extra }),
  }).catch(() => {});
}
