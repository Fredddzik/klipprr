"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  const [installingToAgent, setInstallingToAgent] = useState(false);
  const [installedToAgent, setInstalledToAgent] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Get session on load + listen for auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    setMounted(true);

    return () => subscription.unsubscribe();
  }, []);

  // Fetch license when logged in
  useEffect(() => {
    if (!session?.user?.id) return;

    supabase
      .from("licenses")
      .select("plan, expires_at, active")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
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
  }, [session]);

  // If already Pro (e.g. re-subscribed), (re)install license into the local app
  useEffect(() => {
    if (!session?.user?.email) return;
    if (!license?.plan) return;
    if (!license) return;
    if (installedToAgent) return;

    let cancelled = false;

    (async () => {
      try {
        setInstallingToAgent(true);

        const res = await fetch("http://localhost:4000/license", {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: session.user.email,
            plan: license.plan,
	    exp: toUnix(license.expires_at),
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error("[Upgrade] Auto-install failed:", res.status, text);
          return;
        }

        if (!cancelled) {
          setInstalledToAgent(true);
          console.log("[Upgrade] Auto-installed license into ClipAgent");
        }
      } catch (e) {
        console.error("[Upgrade] Auto-install fetch failed:", e);
      } finally {
        if (!cancelled) setInstallingToAgent(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, license, installedToAgent]);

  if (!mounted) {
    return null;
  }

  const sendMagicLink = async () => {
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

      try {
        console.log("[Upgrade] Installing license into local ClipAgent…");

        const res = await fetch("http://localhost:4000/license", {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: session.user.email,
            plan: freshLicense.plan,
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error("[Upgrade] POST /license failed:", res.status, text);
          setStatus(
            "License activated, but the app is not running. Please open ClipAgent and come back to this page."
          );
          return;
        }

        console.log("[Upgrade] License successfully sent to ClipAgent");
      } catch (e) {
        console.error("[Upgrade] Failed to reach ClipAgent:", e);
        setStatus(
          "License activated, but ClipAgent is not reachable. Make sure the app is running, then refresh this page."
        );
        return;
      }

      // Refresh license from Supabase so UI updates
      supabase
        .from("licenses")
        .select("plan, expires_at")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
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
              You can close this page and return to the app.
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
