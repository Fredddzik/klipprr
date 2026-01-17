"use client";

import { open as openExternal } from "@tauri-apps/plugin-shell";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  onUpgraded?: () => void;
}

export default function UpgradeModal({ open, onClose, onUpgraded }: UpgradeModalProps) {
  if (!open) return null;

  const handleUpgradeInBrowser = async () => {
    try {
      console.log("[UpgradeModal] Opening upgrade URL in system browser");
      const upgradeUrl = "http://localhost:3000/upgrade";
      await openExternal(upgradeUrl);
      // When user comes back from browser, refresh capabilities
      setTimeout(() => {
        onUpgraded?.();
      }, 1500);
    } catch (err) {
      console.error("[UpgradeModal] Failed to open browser:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-gray-400 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="mb-4 text-xl font-semibold text-white">
          Upgrade Required
        </h2>

        <p className="mb-6 text-sm text-gray-400">
          This feature is locked. Please upgrade in your browser to unlock it.
        </p>

        <button
          onClick={handleUpgradeInBrowser}
          className="w-full rounded-lg bg-yellow-500 py-2 font-semibold text-black hover:brightness-110"
        >
          Upgrade in browser
        </button>

        <button
          onClick={onClose}
          className="mt-4 w-full text-sm text-gray-400 hover:text-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
