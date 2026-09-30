const TRACK_URL = "https://klipprr.com/api/track";

/**
 * The desktop app sends no analytics. It has no consent prompt, and the privacy policy
 * says PostHog runs only after cookie consent and that the app reports only clip counts,
 * plan and export errors, tied to the account (Supabase). App usage is measured there:
 * accounts and `clip_usage_monthly`. See docs/STRATEGY-BACKLOG.md.
 *
 * Nothing was lost by this: release builds never had a PostHog key, and klipprr.com's
 * /api/track rejects the app's origin, so neither path had ever delivered an event.
 * Turning either on needs a consent prompt in the app and a privacy policy change first.
 */
export const APP_ANALYTICS_ENABLED = false;

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
  if (!APP_ANALYTICS_ENABLED) return;
  fetch(TRACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...base, event, ...extra }),
  }).catch(() => {});
}
