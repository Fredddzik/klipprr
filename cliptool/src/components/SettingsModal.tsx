"use client";

import { useEffect, useState } from "react";
import { ANALYTICS_AVAILABLE, getAnalyticsConsent, setAnalyticsConsent } from "@/lib/analytics";

export type ThemePreference = "light" | "dark" | "system";
export type ClipSortOption = "timeline" | "created";
/** Every option is an exact, re-encoded cut. "universal" is H.264 (its value predates HEVC and ProRes). */
export type DefaultExportFormat = "universal" | "hevc" | "prores";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemePreference;
  setTheme: (v: ThemePreference) => void;
  clipSort: ClipSortOption;
  setClipSort: (v: ClipSortOption) => void;
  defaultExportFormat: DefaultExportFormat;
  setDefaultExportFormat: (v: DefaultExportFormat) => void;
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Same as system" },
];

const CLIP_SORT_OPTIONS: { value: ClipSortOption; label: string }[] = [
  { value: "timeline", label: "Position on timeline" },
  { value: "created", label: "When created" },
];

const EXPORT_FORMAT_OPTIONS: { value: DefaultExportFormat; label: string }[] = [
  { value: "universal", label: "MP4 · H.264" },
  { value: "hevc", label: "MP4 · HEVC" },
  { value: "prores", label: "MOV · ProRes 422" },
];

export default function SettingsModal({
  isOpen,
  onClose,
  theme,
  setTheme,
  clipSort,
  setClipSort,
  defaultExportFormat,
  setDefaultExportFormat,
}: SettingsModalProps) {
  const [shareUsage, setShareUsage] = useState(false);
  useEffect(() => {
    if (isOpen) setShareUsage(getAnalyticsConsent() === "granted");
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 id="settings-title" className="text-lg font-semibold text-white">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 px-5 py-4">
          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Appearance
            </label>
            <div className="flex flex-wrap gap-2">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTheme(opt.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    theme === opt.value
                      ? "bg-zinc-600 text-white"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clip sort */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Sort clips by
            </label>
            <div className="flex flex-wrap gap-2">
              {CLIP_SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setClipSort(opt.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    clipSort === opt.value
                      ? "bg-violet-600 text-white"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Default export format */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Default export format
            </label>
            <div className="flex flex-wrap gap-2">
              {EXPORT_FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDefaultExportFormat(opt.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    defaultExportFormat === opt.value
                      ? "bg-violet-600 text-white"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {ANALYTICS_AVAILABLE && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={shareUsage}
                onChange={(e) => {
                  setShareUsage(e.target.checked);
                  setAnalyticsConsent(e.target.checked ? "granted" : "denied");
                }}
                className="mt-0.5 h-4 w-4 accent-violet-600"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-300">Share usage data</span>
                <span className="block text-xs leading-relaxed text-zinc-500 mt-0.5">
                  The links you load, timings, exports and errors. Never your videos or file names.
                </span>
              </span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
