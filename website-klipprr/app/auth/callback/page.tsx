"use client";

import { Suspense } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

function CallbackInner() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "clipagent://auth-callback";

  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [noSession, setNoSession] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const expiresAt =
      params.get("expires_at") ?? params.get("expires_in") ?? "";

    if (accessToken && refreshToken) {
      const link = buildDeepLink(redirect, accessToken, refreshToken, expiresAt || undefined);
      setDeepLink(link);
      return;
    }

    // No hash (e.g. user clicked "Continue as X" on login page) — use current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token && session?.refresh_token) {
        const link = buildDeepLink(
          redirect,
          session.access_token,
          session.refresh_token,
          session.expires_at ? String(session.expires_at) : undefined
        );
        setDeepLink(link);
      } else {
        setNoSession(true);
      }
    });
  }, [redirect]);

  // Try opening the app once the deep link is ready. Many browsers block
  // programmatic redirects to custom schemes; the "Open Klipprr" button
  // provides a user gesture so the app can open if this fails.
  useEffect(() => {
    if (!deepLink) return;
    const t = setTimeout(() => {
      window.location.href = deepLink;
    }, 200);
    return () => clearTimeout(t);
  }, [deepLink]);

  const hasTokens = useMemo(() => !!deepLink, [deepLink]);

  if (!hasTokens && !noSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-4">
        <p className="text-zinc-400">Redirecting…</p>
      </div>
    );
  }

  if (!hasTokens && noSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl">
          <h1 className="text-2xl font-semibold text-white mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-zinc-400 mb-4">
            We couldn&apos;t find a login session. Sign in first, then try again.
          </p>
          <a
            href={`/login?redirect=${encodeURIComponent(redirect)}`}
            className="inline-flex items-center rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-white mb-2">
          Open Klipprr
        </h1>
        <p className="text-sm text-zinc-400 mb-4">
          Click the button below to open the app and log in. Your browser may not open it automatically.
        </p>
        {deepLink && (
          <>
            <button
              type="button"
              onClick={() => {
                window.location.href = deepLink;
              }}
              className="inline-flex items-center rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition"
            >
              Open Klipprr
            </button>
            <p className="text-xs text-zinc-500 mt-3">
              If nothing happens, run the built app (not dev) and try again — the custom link only works when Klipprr is installed.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}