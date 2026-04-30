const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const DECIDE_URL = "https://app.posthog.com/decide/?v=3";

export type SubscribeCtaVariant = "control" | "benefit" | "urgency";
export type PricingProCtaVariant = "control" | "benefit" | "savings";

export interface AppFeatureFlags {
  subscribeCtaVariant: SubscribeCtaVariant;
  pricingProCtaVariant: PricingProCtaVariant;
}

const FALLBACK: AppFeatureFlags = {
  subscribeCtaVariant: "control",
  pricingProCtaVariant: "control",
};

const SUBSCRIBE_CTA_VARIANTS: SubscribeCtaVariant[] = ["control", "benefit", "urgency"];
const PRICING_PRO_CTA_VARIANTS: PricingProCtaVariant[] = ["control", "benefit", "savings"];

// Module-level session cache — one fetch per app launch.
let sessionCache: AppFeatureFlags | null = null;

export function clearAppFeatureFlagsCache(): void {
  sessionCache = null;
}

export async function fetchAppFeatureFlags(distinctId: string): Promise<AppFeatureFlags> {
  if (sessionCache) return sessionCache;
  if (!POSTHOG_API_KEY || !distinctId) return FALLBACK;

  try {
    const res = await fetch(DECIDE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_API_KEY, distinct_id: distinctId }),
    });
    if (!res.ok) return FALLBACK;

    const data = (await res.json()) as { featureFlags?: Record<string, unknown> };
    const flags = data?.featureFlags ?? {};

    const raw1 = flags["upgrade-subscribe-cta"];
    const raw2 = flags["pricing-pro-cta"];

    sessionCache = {
      subscribeCtaVariant: SUBSCRIBE_CTA_VARIANTS.includes(raw1 as SubscribeCtaVariant)
        ? (raw1 as SubscribeCtaVariant)
        : "control",
      pricingProCtaVariant: PRICING_PRO_CTA_VARIANTS.includes(raw2 as PricingProCtaVariant)
        ? (raw2 as PricingProCtaVariant)
        : "control",
    };
    return sessionCache;
  } catch {
    return FALLBACK;
  }
}

const SUBSCRIBE_CTA_COPY: Record<SubscribeCtaVariant, readonly [string, string]> = {
  control: ["Subscribe to Pro — 2 months free", "Subscribe to Pro — Monthly"],
  benefit: ["Get Pro — no watermark, ever", "Get Pro — $12/mo, cancel anytime"],
  urgency: ["Start exporting in 4K — 2 mo free", "Start exporting in 4K — $12/mo"],
};

const PRICING_PRO_CTA_COPY: Record<PricingProCtaVariant, readonly [string, string]> = {
  control: ["Remove watermark — $10/mo", "Remove watermark — $12/mo"],
  benefit: ["Unlock 4K exports — $10/mo", "Unlock 4K exports — $12/mo"],
  savings: ["Get Pro — save $24/yr", "Get Pro — $12/mo"],
};

export function getSubscribeCtaCopy(
  variant: SubscribeCtaVariant,
  billing: "yearly" | "monthly" = "yearly"
): string {
  return SUBSCRIBE_CTA_COPY[variant][billing === "yearly" ? 0 : 1];
}

export function getPricingProCtaCopy(
  variant: PricingProCtaVariant,
  billing: "yearly" | "monthly" = "yearly"
): string {
  return PRICING_PRO_CTA_COPY[variant][billing === "yearly" ? 0 : 1];
}
