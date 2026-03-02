"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { AuthResponse } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import type { AuthError } from "@supabase/supabase-js";

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

  // 🔑 Redirect back to the app after successful login (deep link handoff)
useEffect(() => {
  if (!supabase) return;
  if (!session) return;

  // redirectTo may be in query (original) or hash (supabase flow)
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace("#", ""));

  const redirectTo =
    searchParams.get("redirectTo") || hashParams.get("redirectTo");

  if (redirectTo) {
    console.log("[Upgrade] Redirecting back to app:", redirectTo);
    window.location.href = redirectTo;
  }
}, [supabase, session]);

  // Fetch license when logged in
  useEffect(() => {
    if (!supabase) return;
    if (!session?.user?.id) return;

    supabase
      .from("licenses")
      .select("plan, expires_at, active")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then((res: PostgrestSingleResponse<any>) => {
        const data = res.data;
        if (!data || data.active !== true) {
          console.log("[Upgrade] No active license in Supabase");
          setLicense(null);
          return;
        }

        if (!data.expires_at || new Date(data.expires_at) > new Date()) {
          setLicense({ plan: data.plan, expires_at: data.expires_at });
        } else {
          setLicense(null);
        }
      });
  }, [supabase, session]);

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

        {session && !license && (
          <>
            <p className="mb-3 text-sm text-zinc-400">
              Enter your activation code.
            </p>
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
