"use client";

import { Suspense } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function CallbackInner() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "clipagent://auth-callback";

  const [deepLink, setDeepLink] = useState<string | null>(null);

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
      const link = `${redirect}#access_token=${encodeURIComponent(
        accessToken
      )}&refresh_token=${encodeURIComponent(
        refreshToken
      )}&expires_at=${encodeURIComponent(expiresAt)}`;

      setDeepLink(link);
      window.location.href = link;
    }
  }, [redirect]);

  const hasTokens = useMemo(() => !!deepLink, [deepLink]);

  if (!hasTokens) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
        <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-950 p-6 shadow-xl">
          <h1 className="text-2xl font-semibold mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-400 mb-4">
            We couldn&apos;t find a login session in this callback.
          </p>
          <a
            href="/auth/clipagent"
            className="inline-flex items-center rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
          >
            Try logging in again
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