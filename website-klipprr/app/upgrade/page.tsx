"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { AuthResponse } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

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

  const params = new URLSearchParams(window.location.search);
  const redirectTo = params.get("redirectTo");

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
  
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + "/upgrade",
      },
    });
  
    if (error) {
      setStatus(error.message);
    } else {
      setStatus("Check your email for the login link.");
    }
  
    setLoading(false);
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Upgrade ClipAgent
        </h1>

        {!session && (
          <>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Log in to manage your ClipAgent license.
            </p>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-3 w-full rounded border px-3 py-2 text-sm"
            />
            <button
              onClick={sendMagicLink}
              disabled={loading}
              className="w-full rounded bg-yellow-500 py-2 text-sm font-medium text-black"
            >
              Send login link
            </button>
          </>
        )}

        {session && license && (
          <>
            <p className="mb-4 text-sm text-green-600">
              ClipAgent Pro is active.
            </p>
            <p className="text-sm text-zinc-500">
            Your license is active. Open ClipAgent and log in to unlock Pro features.
            </p>
          </>
        )}

        {session && !license && (
          <>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              Enter your activation code.
            </p>
            <input
              type="text"
              placeholder="BETA-CLIP-001"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mb-3 w-full rounded border px-3 py-2 text-sm"
            />
            <button
              onClick={redeemCode}
              disabled={loading}
              className="w-full rounded bg-yellow-500 py-2 text-sm font-medium text-black"
            >
              Activate
            </button>
          </>
        )}

        {status && (
          <p className="mt-4 text-sm text-zinc-500">{status}</p>
        )}
      </main>
    </div>
  );
}
