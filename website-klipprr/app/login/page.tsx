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
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <p className="text-zinc-400">Loading…</p>
      </div>
    );
  }

  const isDesktopFlow = !!redirect;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-white mb-1">Klipprr</h1>
        <p className="text-sm text-zinc-400 mb-6">
          {isDesktopFlow
            ? "Sign in to link your account with the desktop app."
            : "Sign in to your account."}
        </p>

        {session ? (
          <>
            <p className="text-sm text-zinc-300 mb-4">
              Signed in as <strong className="text-white">{session.user.email}</strong>
            </p>
            {isDesktopFlow ? (
              <button
                type="button"
                onClick={handleContinueToApp}
                className="w-full rounded-full bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition"
              >
                Continue as {session.user.email} to Klipprr
              </button>
            ) : (
              <p className="text-sm text-zinc-500">You are logged in.</p>
            )}
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                setSession(null);
              }}
              className="mt-3 w-full text-sm text-zinc-400 hover:text-white transition"
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
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                required
                autoComplete="email"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
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
                  className="flex-1 rounded-full bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 transition"
                >
                  {authLoading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode((m) => (m === "signin" ? "signup" : "signin"));
                    setError(null);
                  }}
                  className="rounded-full border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition"
                >
                  {mode === "signin" ? "Sign up" : "Sign in"}
                </button>
              </div>
            </form>

            <div className="my-4 flex items-center gap-3">
              <span className="flex-1 border-t border-zinc-700" />
              <span className="text-xs text-zinc-500">or</span>
              <span className="flex-1 border-t border-zinc-700" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="w-full rounded-full border border-zinc-600 bg-zinc-800/50 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 transition"
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
