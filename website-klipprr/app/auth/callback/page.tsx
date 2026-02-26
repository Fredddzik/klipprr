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
      window.location.href = link;
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
        window.location.href = link;
      } else {
        setNoSession(true);
      }
    });
  }, [redirect]);

  const hasTokens = useMemo(() => !!deepLink, [deepLink]);

  if (!hasTokens && !noSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
        <p className="text-gray-400">Redirecting…</p>
      </div>
    );
  }

  if (!hasTokens && noSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
        <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-950 p-6 shadow-xl">
          <h1 className="text-2xl font-semibold mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-400 mb-4">
            We couldn&apos;t find a login session. Sign in first, then try again.
          </p>
          <a
            href={`/login?redirect=${encodeURIComponent(redirect)}`}
            className="inline-flex items-center rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-950 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold mb-2">
          Redirecting to ClipAgent...
        </h1>
        <p className="text-sm text-gray-400 mb-4">
          If your app doesn&apos;t open automatically, use the button below.
        </p>
        {deepLink && (
          <a
            href={deepLink}
            className="inline-flex items-center rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
          >
            Open ClipAgent
          </a>
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