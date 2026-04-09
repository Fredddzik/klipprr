"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type BillingMode = "yearly" | "monthly";

type Tier = {
  name: string;
  subtitle: string;
  ctaLabel: string;
  popular?: boolean;
  accent?: "violet" | "emerald" | "zinc";
  monthlyPrice: number;
  yearlyPerMonthPrice?: number;
  yearlyOriginalMonthlyPrice?: number;
  badge?: string;
  features: string[];
};

const tiers: Tier[] = [
  {
    name: "Free",
    subtitle: "Try Klipprr quickly before upgrading",
    ctaLabel: "Get Started",
    accent: "zinc",
    monthlyPrice: 0,
    features: [
      "10 clips per month",
      "Up to 720p quality",
      "Watermark on exports",
      "All supported platforms",
      "Local file support",
    ],
  },
  {
    name: "Pro",
    subtitle: "No watermark + up to 4K exports",
    ctaLabel: "Upgrade",
    popular: true,
    accent: "violet",
    monthlyPrice: 12,
    yearlyPerMonthPrice: 10,
    yearlyOriginalMonthlyPrice: 12,
    badge: "2 months free",
    features: [
      "No watermark",
      "Up to 4K clips",
      "Can rename clips",
      "Can choose export path",
      "120 clips per month",
    ],
  },
  {
    name: "Max",
    subtitle: "No watermark + up to 8K exports",
    ctaLabel: "Upgrade",
    accent: "emerald",
    monthlyPrice: 39,
    yearlyPerMonthPrice: 33,
    yearlyOriginalMonthlyPrice: 39,
    badge: "2 months free",
    features: [
      "No watermark",
      "Up to 8K (if source supports it)",
      "Everything in Pro",
      "500 clips per month",
      "Priority support",
    ],
  },
];

function priceCopy(tier: Tier, mode: BillingMode) {
  if (tier.monthlyPrice === 0) {
    return {
      original: null,
      current: "$0",
      suffix: "/ month",
      detail: "No credit card required",
    };
  }

  if (mode === "yearly" && tier.yearlyPerMonthPrice) {
    return {
      original: `$${tier.yearlyOriginalMonthlyPrice ?? tier.monthlyPrice}`,
      current: `$${tier.yearlyPerMonthPrice}`,
      suffix: "/ month",
      detail: `Billed yearly ($${tier.yearlyPerMonthPrice * 12}/year)`,
    };
  }

  return {
    original: null,
    current: `$${tier.monthlyPrice}`,
    suffix: "/ month",
    detail: "Billed monthly",
  };
}

export function PricingSection() {
  const router = useRouter();
  const [mode, setMode] = useState<BillingMode>("yearly");
  const orderedTiers = useMemo(() => tiers, []);
  const [checkoutLoading, setCheckoutLoading] = useState<null | "pro" | "max">(null);

  const startCheckout = async (tier: "pro" | "max", billing: BillingMode) => {
    setCheckoutLoading(tier);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        router.push("/login");
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tier, billing }),
      });
      const raw = await res.text();
      const json = raw ? (JSON.parse(raw) as { url?: string; error?: string }) : null;
      if (!res.ok || !json?.url) {
        const message = json?.error || `Could not start checkout (HTTP ${res.status})`;
        alert(message);
        return;
      }
      window.location.href = json.url;
    } catch (e) {
      console.error("[Pricing] checkout failed", e);
      alert("Checkout failed. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <section id="pricing" className="border-t border-zinc-800 py-24 px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Pricing</h2>
          <p className="mt-4 text-lg text-zinc-400">
            Start free, upgrade when you're ready. No credit card required.
          </p>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setMode("monthly")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              mode === "monthly"
                ? "bg-zinc-700 text-white"
                : "bg-zinc-900 text-zinc-400 hover:text-white"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setMode("yearly")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              mode === "yearly"
                ? "bg-violet-600 text-white"
                : "bg-zinc-900 text-zinc-400 hover:text-white"
            }`}
          >
            Yearly
          </button>
          <span className="rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-semibold text-emerald-300">
            Save 2 months
          </span>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {orderedTiers.map((tier) => {
            const price = priceCopy(tier, mode);
            const accentClass =
              tier.accent === "violet"
                ? "border-violet-500/90 shadow-[0_0_35px_rgba(139,92,246,0.35)]"
                : tier.accent === "emerald"
                  ? "border-emerald-500/70 shadow-[0_0_28px_rgba(16,185,129,0.2)]"
                  : "border-zinc-700";

            return (
              <div
                key={tier.name}
                className={`relative flex flex-col rounded-2xl border bg-zinc-900/75 p-6 ${accentClass}`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-900">
                    Most Popular
                  </span>
                )}

                <h3 className="text-lg font-semibold text-white uppercase">{tier.name}</h3>
                <p className="mt-1 text-sm text-zinc-400">{tier.subtitle}</p>

                <div className="mt-5">
                  {price.original ? (
                    <p className="text-zinc-500 line-through">{price.original}</p>
                  ) : (
                    <p className="text-zinc-500">&nbsp;</p>
                  )}
                  <p className="text-5xl font-bold text-white">
                    {price.current}
                    <span className="ml-1 text-xl font-normal text-zinc-400">{price.suffix}</span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">{price.detail}</p>
                  {mode === "yearly" && tier.badge && tier.monthlyPrice > 0 && (
                    <span className="mt-3 inline-block rounded-md bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                      {tier.badge}
                    </span>
                  )}
                </div>

                <ul className="mt-6 flex-1 space-y-3 text-sm text-zinc-300">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className="mt-0.5 text-emerald-400">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {tier.monthlyPrice === 0 ? (
                  <Link
                    href="/login"
                    className="mt-7 rounded-xl bg-zinc-100 py-2.5 text-center text-sm font-semibold uppercase tracking-wide text-zinc-900 transition hover:bg-zinc-200"
                  >
                    {tier.ctaLabel}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => startCheckout(tier.name === "Max" ? "max" : "pro", mode)}
                    disabled={checkoutLoading !== null}
                    className={`mt-7 rounded-xl py-2.5 text-center text-sm font-semibold uppercase tracking-wide transition disabled:opacity-60 ${
                      tier.popular
                        ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                        : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                    }`}
                  >
                    {checkoutLoading
                      ? "Redirecting…"
                      : mode === "yearly"
                        ? `Upgrade (yearly)`
                        : `Upgrade (monthly)`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

