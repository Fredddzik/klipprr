"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

interface WatermarkInterstitialProps {
  open: boolean;
  count: number;
  exportDir: string;
  onUpgrade: () => void;
  onOpenFolder: () => void;
  onClose: () => void;
}

export default function WatermarkInterstitial({
  open,
  count,
  exportDir,
  onUpgrade,
  onOpenFolder,
  onClose,
}: WatermarkInterstitialProps) {
  useEffect(() => {
    if (open) posthog.capture("watermark_interstitial_shown", { clip_count: count });
  }, [open, count]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md mx-4 rounded-md border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Side-by-side preview mockup */}
        <div className="flex border-b border-zinc-800">
          {/* Watermarked side */}
          <div className="flex-1 relative bg-zinc-900 aspect-video overflow-hidden flex items-end">
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/60 to-zinc-900" />
            {/* Simulated video content */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-zinc-700/50 flex items-center justify-center">
                <svg className="w-4 h-4 text-zinc-500 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            {/* Watermark overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
              style={{ transform: "rotate(-25deg)" }}>
              <span className="text-white/30 text-xs font-bold tracking-[0.3em] uppercase whitespace-nowrap">
                KLIPPRR
              </span>
            </div>
            <div className="relative w-full bg-black/60 px-2 py-1">
              <span className="text-[10px] text-zinc-500 font-medium">Free — 720p · watermark</span>
            </div>
          </div>

          {/* Clean side */}
          <div className="flex-1 relative bg-zinc-900 aspect-video overflow-hidden flex items-end border-l border-zinc-800">
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/60 to-zinc-900" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-violet-600/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-violet-400 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            {/* Subtle violet glow to suggest "better" */}
            <div className="absolute inset-0 ring-1 ring-inset ring-violet-500/20" />
            <div className="relative w-full bg-black/60 px-2 py-1 flex items-center gap-1">
              <svg className="w-3 h-3 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
              <span className="text-[10px] text-zinc-400 font-medium">Pro — up to 4K · no watermark</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-sm font-semibold text-white">
            {count === 1 ? "Your clip is ready" : `Your ${count} clips are ready`} — with a watermark
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Free exports are capped at 720p and include a watermark. Upgrade to share clean clips instantly.
          </p>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => { posthog.capture("upgrade_clicked", { source: "watermark_interstitial" }); onUpgrade(); }}
              className="btn-brand w-full py-2.5 rounded text-sm font-semibold flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z"/></svg>
              Remove watermark — from $10/mo
            </button>
            <button
              type="button"
              onClick={() => { posthog.capture("watermark_interstitial_dismissed"); onOpenFolder(); onClose(); }}
              className="w-full py-2 rounded text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              Open folder (keep watermark)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
