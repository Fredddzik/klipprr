"use client";

import { useEffect, useState } from "react";
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

function isAllowedAppRedirect(redirect: string): boolean {
  return redirect === "clipagent://auth-callback";
}

function toUnix(exp: string | null): number | null {
  if (!exp) return null;
  return Math.floor(new Date(exp).getTime() / 1000);
}

export default function UpgradePage() {
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<any>(null);
  const [license, setLicense] = useState<License | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [supabase, setSupabase] = useState<any>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [billingPlan, setBillingPlan] = useState<"monthly" | "yearly">("monthly");
  const successParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("success") : null;
  const canceledParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("canceled") : null;

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

  const sendMagicLink = async () => {
  if (!supabase) return;

  setLoading(true);
  setStatus(null);

  try {
    const params = new URLSearchParams(window.location.search);
    const redirectTo = params.get("redirectTo");

    const redirectUrl = redirectTo
      ? `${window.location.origin}/upgrade?redirectTo=${encodeURIComponent(
          redirectTo
        )}`
      : `${window.location.origin}/upgrade`;

    const { error }: { error: AuthError | null } =
      await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

    if (error) {
      setStatus(error.message);
    } else {
      setStatus("Check your email for the login link.");
    }
  } catch (e) {
    console.error("[Upgrade] signInWithOtp failed:", e);
    setStatus("Login failed. Check console logs.");
  } finally {
    setLoading(false);
  }
};

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
        body: JSON.stringify({ plan: billingPlan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Could not start checkout.");
        return;
      }
      if (data.url) window.location.href = data.url;
      else setStatus("Missing checkout URL.");
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
            <p className="mb-4 text-sm text-zinc-400">
              Log in to manage your Klipprr license.
            </p>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <button
              onClick={sendMagicLink}
              disabled={loading}
              className="w-full rounded-full bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 transition"
            >
              Send login link
            </button>
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
              Subscribe to Pro with Stripe, or enter an activation code.
            </p>
            <div className="mb-3 flex overflow-visible rounded-lg border border-zinc-700 bg-zinc-800/80 p-1 pt-3">
              <button
                type="button"
                onClick={() => setBillingPlan("monthly")}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                  billingPlan === "monthly"
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                $12 / month
              </button>
              <button
                type="button"
                onClick={() => setBillingPlan("yearly")}
                className={`relative flex-1 rounded-md py-2 text-sm font-medium transition ${
                  billingPlan === "yearly"
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                $120 / year
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
                : billingPlan === "yearly"
                  ? "Subscribe to Pro — 2 months free"
                  : "Subscribe to Pro — Monthly"}
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
