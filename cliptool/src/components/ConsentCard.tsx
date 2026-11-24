"use client";

import { useEffect, useState } from "react";
import {
  ANALYTICS_AVAILABLE,
  consentAskDue,
  getAnalyticsConsent,
  onAnalyticsConsentChange,
  setAnalyticsConsent,
} from "@/lib/analytics";

/**
 * Asks once whether the app may send usage data, after the first successful export: at
 * that point people have seen what the app does. Nothing is sent before a yes, "No thanks"
 * is as easy as yes and is never asked again, and the answer can be changed in Settings.
 */
export default function ConsentCard() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ANALYTICS_AVAILABLE) return;
    if (!(window as { __TAURI__?: unknown }).__TAURI__) return;
    const sync = () => setOpen(getAnalyticsConsent() === null && consentAskDue());
    sync();
    return onAnalyticsConsentChange(sync);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed bottom-6 left-6 z-50 w-[22rem] max-w-[calc(100vw-3rem)] rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
      role="dialog"
      aria-labelledby="consent-title"
    >
      <h2 id="consent-title" className="text-sm font-medium text-zinc-100">
        Help me make Klipprr better
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Share what happens in the app: the links you load, how long they take, your exports and
        any errors. Never your videos or file names. You can change this in Settings.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAnalyticsConsent("denied")}
          className="rounded-md bg-zinc-800 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700"
        >
          No thanks
        </button>
        <button
          type="button"
          onClick={() => setAnalyticsConsent("granted")}
          className="rounded-md bg-zinc-800 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700"
        >
          Share
        </button>
      </div>
    </div>
  );
}
