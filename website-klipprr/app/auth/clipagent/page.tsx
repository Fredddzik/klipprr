"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function ClipAgentAuthInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const redirect = searchParams.get("redirect") ?? "clipagent://auth-callback";
    const loginUrl = `https://klipprr.com/login?redirect=${encodeURIComponent(redirect)}`;
    window.location.replace(loginUrl);
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
      <p className="text-gray-400">Redirecting to sign in…</p>
    </div>
  );
}

export default function ClipAgentAuthPage() {
  return (
    <Suspense fallback={null}>
      <ClipAgentAuthInner />
    </Suspense>
  );
}
