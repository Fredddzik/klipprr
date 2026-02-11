"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ClipAgentAuthPage() {
  const searchParams = useSearchParams();
  const redirect =
    searchParams.get("redirect") ?? "clipagent://auth-callback";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter your email");
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `https://klipprr.com/auth/callback?redirect=${encodeURIComponent(
            redirect
          )}`,
        },
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAlreadyLoggedIn = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setError("No active session found. Please request a login link first.");
      return;
    }

    window.location.href = `/auth/callback?redirect=${encodeURIComponent(
      redirect
    )}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-950 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold mb-2">
          Almost in the app...
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          Log in through your browser, then we’ll bring you right back.
        </p>

        <form onSubmit={handleSendLink} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
            disabled={loading || sent}
            autoComplete="email"
          />
          <p className="text-xs text-gray-500">
            We&apos;ll email you a magic link.
          </p>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || sent}
            className="w-full rounded-lg bg-yellow-500 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send login link"}
          </button>
        </form>

        {sent && (
          <p className="mt-3 text-xs text-green-400">
            Magic link sent. Open it on this device to continue into ClipAgent.
          </p>
        )}

        <hr className="my-6 border-gray-800" />

        <button
          type="button"
          onClick={handleAlreadyLoggedIn}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2 text-sm font-semibold hover:bg-gray-800"
        >
          I&apos;m already logged in
        </button>
      </div>
    </div>
  );
}

