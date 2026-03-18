"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function WindowsWaitlist() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("submitting");
    setMessage(null);

    try {
      const { error } = await supabase.from("waitlist").insert({
        email: email.trim(),
        platform: "windows",
        source: "website-download",
      });

      if (error) {
        console.error("[WindowsWaitlist] insert failed", error);
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setMessage("You’re on the waitlist. We’ll email you when Windows is ready.");
      setEmail("");
    } catch (err) {
      console.error("[WindowsWaitlist] unexpected error", err);
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex items-center justify-center rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 transition"
        >
          {status === "submitting" ? "Joining…" : "Join waitlist"}
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        We’ll only use this email to let you know when the Windows build is available.
      </p>
      {message && (
        <p
          className={`text-xs ${
            status === "success" ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );
}

