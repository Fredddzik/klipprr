"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import type { AuthResponse } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import type { AuthError } from "@supabase/supabase-js";

const STRIPE_CHECKOUT_API = "/api/stripe/checkout";

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase env vars");
  }

  return createClient(url, key);
}

type License = {
  plan: string;
  expires_at: string | null;
};

type PaidTier = "pro" | "max";
type BillingPeriod = "monthly" | "yearly";

function isAllowedAppRedirect(redirect: string): boolean {
  return redirect === "clipagent://auth-callback";
}

function buildDeepLink(
  redirect: string,
  accessToken: string,
  refreshToken: string,
  expiresAt?: string
): string {
  let link = `${redirect}#access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`;
  if (expiresAt) link += `&expires_at=${encodeURIComponent(expiresAt)}`;
  return link;
}

function toUnix(exp: string | null): number | null {
  if (!exp) return null;
  return Math.floor(new Date(exp).getTime() / 1000);
}

export default function UpgradePage() {
  const [session, setSession] = useState<any>(null);
  const [license, setLicense] = useState<License | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [supabase, setSupabase] = useState<any>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PaidTier>("pro");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("yearly");
  const successParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("success") : null;
  const canceledParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("canceled") : null;
  const [openAttempted, setOpenAttempted] = useState(false);

  useEffect(() => {
    try {
      const client = createSupabaseClient();
      setSupabase(client);
    } catch (e) {
      console.error("[Upgrade] Supabase init failed:", e);
    }
  }, []);

  // Get session on load + listen for auth changes
  useEffect(() => {
    if (!supabase) return;
  
    supabase.auth.getSession().then((res: AuthResponse) => {
      setSession(res.data.session);
    });
  
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
         setSession(session);
    });
  
    setMounted(true);
  
    return () => subscription.unsubscribe();
  }, [supabase]);

  // 🔑 Redirect back to the app with session in the deep link so the app can log in (same as auth/callback).
  // Without tokens in the URL, the app would only focus and stay logged out.
  useEffect(() => {
    if (!supabase) return;
    if (!session?.access_token || !session?.refresh_token) return;

    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace("#", ""));

    const redirectTo =
      searchParams.get("redirectTo") || hashParams.get("redirectTo");

    if (redirectTo && isAllowedAppRedirect(redirectTo)) {
      const expiresAt = session.expires_at ? String(session.expires_at) : "";
      const deepLink =
        `${redirectTo}#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}` +
        (expiresAt ? `&expires_at=${encodeURIComponent(expiresAt)}` : "");
      console.log("[Upgrade] Redirecting back to app with session");
      window.location.href = deepLink;
    }
  }, [supabase, session]);

  // On success, offer "Open Klipprr" even without redirectTo.
  useEffect(() => {
    if (successParam !== "1") return;
    if (openAttempted) return;
    if (!session?.access_token || !session?.refresh_token) return;
    // Give the license refresh a moment; then try opening the app.
    const t = setTimeout(() => {
      const deepLink = buildDeepLink(
        "clipagent://auth-callback",
        session.access_token,
        session.refresh_token,
        session.expires_at ? String(session.expires_at) : undefined
      );
      setOpenAttempted(true);
      window.location.href = deepLink;
    }, 500);
    return () => clearTimeout(t);
  }, [openAttempted, session?.access_token, session?.expires_at, session?.refresh_token, successParam]);

  // Fetch license when logged in (and after Stripe success)
  const refreshLicense = () => {
    if (!supabase || !session?.user?.id) return;
    supabase
      .from("licenses")
      .select("plan, expires_at, active")
      .eq("user_id", session.user.id)
      .eq("active", true)
      .maybeSingle()
      .then((res: PostgrestSingleResponse<any>) => {
        const data = res.data;
        if (!data) {
          setLicense(null);
          return;
        }
        if (!data.expires_at || new Date(data.expires_at) > new Date()) {
          setLicense({ plan: data.plan, expires_at: data.expires_at });
        } else {
          setLicense(null);
        }
      });
  };

  useEffect(() => {
    if (!supabase || !session?.user?.id) return;
    refreshLicense();
  }, [supabase, session]);

  // After Stripe redirect with ?success=1, refresh license once
  useEffect(() => {
    if (successParam === "1" && supabase && session?.user?.id) {
      refreshLicense();
    }
  }, [successParam, supabase, session?.user?.id]);

  if (!mounted) {
    return null;
  }

  const isSuccess = successParam === "1";
  const canDeepLink = !!session?.access_token && !!session?.refresh_token;
  const successDeepLink = canDeepLink
    ? buildDeepLink(
        "clipagent://auth-callback",
        session.access_token,
        session.refresh_token,
        session.expires_at ? String(session.expires_at) : undefined
      )
    : null;

  if (isSuccess && session && license) {
    const planLabel = (license.plan || "").toLowerCase() === "max" ? "Max" : "Pro";
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-12">
        <main className="mx-auto max-w-lg">
          <div className="flex items-center justify-center gap-3">
            <Image src="/logo.png" alt="Klipprr" width={40} height={40} className="rounded-xl" />
            <span className="text-xl font-semibold text-white">Klipprr</span>
          </div>

          <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
              Payment successful
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              You&apos;re all set
            </h1>
            <p className="mt-3 text-sm text-zinc-400">
              Your <strong className="text-white">{planLabel}</strong> plan is active for{" "}
              <strong className="text-white">{session.user?.email}</strong>.
            </p>

            {successDeepLink ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = successDeepLink;
                  }}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition"
                >
                  Open Klipprr
                </button>
                <p className="mt-3 text-xs text-zinc-500">
                  If nothing happens, make sure Klipprr is installed, then click the button again.
                </p>
              </>
            ) : (
              <Link
                href="/login"
                className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition"
              >
                Sign in again
              </Link>
            )}

            <div className="mt-6 flex items-center justify-center gap-4 text-sm">
              <Link href="/account" className="text-zinc-400 hover:text-white transition">
                View account
              </Link>
              <span className="text-zinc-700">•</span>
              <Link href="/" className="text-zinc-400 hover:text-white transition">
                Back to home
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const subscribeWithStripe = async () => {
    if (!session?.access_token) {
      setStatus("Please log in first.");
      return;
    }
    setStripeLoading(true);
    setStatus(null);
    try {
      const res = await fetch(STRIPE_CHECKOUT_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tier: selectedTier, billing: billingPeriod }),
      });
      const raw = await res.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        // Non-JSON error bodies (e.g. Next.js 500 HTML) should still surface the status.
        data = null;
      }

      if (!res.ok) {
        setStatus(
          (data && data.error) || `Could not start checkout (HTTP ${res.status})`
        );
        if (raw && raw.length < 2000) {
          console.error("[Upgrade] Stripe checkout non-JSON error body:", raw);
        }
        return;
      }
      if (data?.url) window.location.href = data.url;
      else setStatus(data?.error || "Missing checkout URL.");
    } catch (e) {
      console.error("[Upgrade] Stripe checkout failed:", e);
      setStatus("Checkout failed. Try again.");
    } finally {
      setStripeLoading(false);
    }
  };

  const redeemCode = async () => {
    if (!supabase) return;
    if (!code.trim()) return;

    setLoading(true);
    setStatus(null);

    const { error } = await supabase.functions.invoke(
      "redeem_activation_code",
      {
        body: { code },
      }
    );

    if (error) {
      setStatus(error.message || "Activation failed.");
    } else {
      setStatus("Activation successful. You can return to the app.");

      const { data: freshLicense } = await supabase
        .from("licenses")
        .select("plan, active")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!freshLicense || freshLicense.active !== true) {
        setStatus("Activation succeeded, but subscription is not active yet. Please refresh.");
        setLoading(false);
        return;
      }

      // Refresh license from Supabase so UI updates
      supabase
        .from("licenses")
        .select("plan, expires_at")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then((res: PostgrestSingleResponse<any>) => {
          const data = res.data;
          if (!data) {
            setLicense(null);
            return;
          }

          if (!data.expires_at || new Date(data.expires_at) > new Date()) {
            setLicense(data);
          }
        });
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100 px-4">
      <main className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 text-center shadow-xl">
        <h1 className="mb-4 text-2xl font-semibold text-white">
          Upgrade Klipprr
        </h1>

        {!session && (
          <>
            <p className="mb-6 text-sm text-zinc-400">
              Sign in to manage your subscription or redeem an activation code.
            </p>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-full bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition"
            >
              Sign in
            </Link>
            <Link
              href="/#pricing"
              className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 transition"
            >
              View pricing
            </Link>
          </>
        )}

        {session && license && (
          <>
            <p className="mb-4 text-sm text-emerald-400">
              Klipprr Pro is active.
            </p>
            <p className="text-sm text-zinc-400">
              Your license is active. Open Klipprr and log in to unlock Pro features.
            </p>
          </>
        )}

        {successParam === "1" && session && !license && (
          <p className="mb-4 text-sm text-amber-400">
            Payment successful. Refreshing your license…
          </p>
        )}

        {canceledParam === "1" && (
          <p className="mb-4 text-sm text-zinc-400">
            Checkout was canceled. You can subscribe or use an activation code below.
          </p>
        )}

        {session && !license && (
          <>
            <p className="mb-3 text-sm text-zinc-400">
              Subscribe with Stripe, or enter an activation code.
            </p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedTier("pro")}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  selectedTier === "pro"
                    ? "border-violet-500 bg-violet-600 text-white"
                    : "border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:text-white"
                }`}
              >
                Pro
              </button>
              <button
                type="button"
                onClick={() => setSelectedTier("max")}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  selectedTier === "max"
                    ? "border-emerald-500 bg-emerald-600 text-zinc-950"
                    : "border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:text-white"
                }`}
              >
                Max
              </button>
            </div>
            <div className="mb-3 flex overflow-visible rounded-lg border border-zinc-700 bg-zinc-800/80 p-1 pt-3">
              <button
                type="button"
                onClick={() => setBillingPeriod("monthly")}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                  billingPeriod === "monthly"
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {selectedTier === "pro" ? "$12 / month" : "$39 / month"}
              </button>
              <button
                type="button"
                onClick={() => setBillingPeriod("yearly")}
                className={`relative flex-1 rounded-md py-2 text-sm font-medium transition ${
                  billingPeriod === "yearly"
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {selectedTier === "pro" ? "$120 / year" : "$396 / year"}
                <span className="absolute -top-2 right-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  2 months free
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={subscribeWithStripe}
              disabled={stripeLoading}
              className="mb-3 w-full rounded-full bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 transition"
            >
              {stripeLoading
                ? "Redirecting…"
                : billingPeriod === "yearly"
                  ? `Subscribe to ${selectedTier === "pro" ? "Pro" : "Max"} — 2 months free`
                  : `Subscribe to ${selectedTier === "pro" ? "Pro" : "Max"} — Monthly`}
            </button>
            <p className="mb-5 text-xs text-zinc-500">
              By continuing, you agree to our{" "}
              <a className="text-violet-300 hover:text-violet-200 transition" href="/terms">
                Terms
              </a>{" "}
              and acknowledge our{" "}
              <a className="text-violet-300 hover:text-violet-200 transition" href="/privacy">
                Privacy Policy
              </a>
              . See{" "}
              <a className="text-violet-300 hover:text-violet-200 transition" href="/refunds">
                Refunds
              </a>
              .
            </p>
            <p className="mb-3 text-xs text-zinc-500">Or enter your activation code:</p>
            <input
              type="text"
              placeholder="BETA-CLIP-001"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <button
              onClick={redeemCode}
              disabled={loading}
              className="w-full rounded-full bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 transition"
            >
              Activate
            </button>
          </>
        )}

        {status && (
          <p className="mt-4 text-sm text-zinc-400">{status}</p>
        )}
      </main>
    </div>
  );
}
