"use client";

export type ThemePreference = "light" | "dark" | "system";
export type ClipSortOption = "timeline" | "created";
export type DefaultExportFormat = "universal" | "original"; // H.264 - Universal | AV1 - Original

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
  { value: "universal", label: "H.264 – Universal" },
  { value: "original", label: "AV1 – Original" },
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
                      ? "bg-violet-600 text-white"
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
        </div>
      </div>
    </div>
  );
}
