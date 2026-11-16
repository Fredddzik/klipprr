"use client";

import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import releaseNotes from "@/lib/release-notes.json";

const LAST_VERSION_KEY = "klipprr-last-seen-version";

/**
 * "What's new" card, shown once on the first launch after an update.
 *
 * The notes ship inside the app (lib/release-notes.json), so they always match the
 * version and work offline; the release workflow copies the same entry into latest.json
 * for the update toast. A version without an entry shows nothing.
 *
 * A fresh install never sees it. 0.1.42 and older did not record a version, so an
 * upgrade from them is recognised by the settings and sign-in they left behind.
 */
export default function WhatsNew() {
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !(window as { __TAURI__?: unknown }).__TAURI__) return;
    let cancelled = false;
    getVersion()
      .then((current) => {
        if (cancelled) return;
        let lastSeen: string | null = null;
        let usedBefore = false;
        try {
          lastSeen = localStorage.getItem(LAST_VERSION_KEY);
          usedBefore = Object.keys(localStorage).some((k) => k.startsWith("klipprr-") || k.startsWith("sb-"));
          localStorage.setItem(LAST_VERSION_KEY, current);
        } catch {
          return;
        }
        const upgraded = lastSeen ? lastSeen !== current : usedBefore;
        const entry = (releaseNotes as Record<string, string[]>)[current];
        if (upgraded && entry?.length) {
          setVersion(current);
          setNotes(entry);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!version || !notes) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h2 id="whats-new-title" className="text-base font-medium text-zinc-100">
          What&apos;s new in {version}
        </h2>
        <ul className="mt-4 space-y-2.5">
          {notes.map((n) => (
            <li key={n} className="flex gap-2.5 text-sm leading-relaxed text-zinc-300">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" aria-hidden="true" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-sm text-zinc-400">
          Thanks for clipping with Klipprr.
          <br />
          Frederik
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => setVersion(null)}
          className="mt-6 w-full rounded-md bg-violet-600 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
