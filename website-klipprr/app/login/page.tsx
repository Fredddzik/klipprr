"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

const DEFAULT_APP_REDIRECT = "clipagent://auth-callback";

function LoginInner() {
  const searchParams = useSearchParams();
  const desktop = searchParams.get("desktop") === "true";
  const redirect =
    searchParams.get("redirect") ??
    (desktop ? DEFAULT_APP_REDIRECT : "");

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const handleContinueToApp = () => {
    if (!redirect) {
      setError("Missing redirect. Open this page from the app.");
      return;
    }
    window.location.href = `https://klipprr.com/auth/callback?redirect=${encodeURIComponent(redirect)}`;
  };

  const handleSignInWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAuthLoading(true);
    try {
      const { error: err } =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: redirect
                  ? `https://klipprr.com/auth/callback?redirect=${encodeURIComponent(redirect)}`
                  : undefined,
              },
            });
      if (err) {
        setError(err.message);
        return;
      }
      if (mode === "signup") {
        setError("Check your email to confirm your account, then sign in.");
      }
      if (redirect) {
        window.location.href = `https://klipprr.com/auth/callback?redirect=${encodeURIComponent(redirect)}`;
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setAuthLoading(true);
    try {
      const redirectTo = redirect
        ? `https://klipprr.com/auth/callback?redirect=${encodeURIComponent(redirect)}`
        : `${typeof window !== "undefined" ? window.location.origin : ""}/login`;
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (err) setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p className="text-gray-400">Loading…</p>
      </div>
    );
  }

  const isDesktopFlow = !!redirect;

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-950 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold mb-1">Klipprr</h1>
        <p className="text-sm text-gray-400 mb-6">
          {isDesktopFlow
            ? "Sign in to link your account with the desktop app."
            : "Sign in to your account."}
        </p>

        {session ? (
          <>
            <p className="text-sm text-gray-300 mb-4">
              Signed in as <strong>{session.user.email}</strong>
            </p>
            {isDesktopFlow ? (
              <button
                type="button"
                onClick={handleContinueToApp}
                className="w-full rounded-lg bg-yellow-500 py-2.5 text-sm font-semibold text-black hover:brightness-110"
              >
                Continue as {session.user.email} to Klipprr
              </button>
            ) : (
              <p className="text-sm text-gray-500">You are logged in.</p>
            )}
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                setSession(null);
              }}
              className="mt-3 w-full text-sm text-gray-400 hover:text-white"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <form onSubmit={handleSignInWithPassword} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
                required
                autoComplete="email"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
              {error && (
                <p className="text-sm text-red-400" role="alert">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex-1 rounded-lg bg-yellow-500 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-60"
                >
                  {authLoading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode((m) => (m === "signin" ? "signup" : "signin"));
                    setError(null);
                  }}
                  className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
                >
                  {mode === "signin" ? "Sign up" : "Sign in"}
                </button>
              </div>
            </form>

            <div className="my-4 flex items-center gap-3">
              <span className="flex-1 border-t border-gray-700" />
              <span className="text-xs text-gray-500">or</span>
              <span className="flex-1 border-t border-gray-700" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            >
              Continue with Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <LoginInner />
    </Suspense>
  );
}
