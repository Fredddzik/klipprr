"use client";

import { open as openExternal } from "@tauri-apps/plugin-shell";
import type { UpdateInfo, UpdateProgress, UpdateStatus } from "@/hooks/useAppUpdate";

/** Bottom-right card that offers, downloads and installs an update (see useAppUpdate). */
export default function UpdateToast({
  visible,
  status,
  info,
  progress,
  onDismiss,
  onInstall,
}: {
  visible: boolean;
  status: UpdateStatus;
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  onDismiss: () => void;
  onInstall: () => void;
}) {
  if (!visible || !info?.version) return null;
  if (!(status === "available" || status === "downloading" || status === "error")) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] rounded-md border border-zinc-800 bg-zinc-900 text-white shadow-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">
            {status === "downloading"
              ? progress?.phase === "installing"
                ? "Installing update…"
                : "Downloading update…"
              : status === "error"
              ? "Update didn't finish"
              : "Update available"}
          </div>
          <div className="text-xs text-zinc-300 mt-1">
            {status === "error" ? (
              <>The download kept failing. You can install version <span className="font-mono">{info.version}</span> from the website instead.</>
            ) : status === "downloading" && progress?.phase === "retrying" ? (
              "The download stalled, retrying…"
            ) : (
              <>Version <span className="font-mono">{info.version}</span> is ready to install.</>
            )}
          </div>
          {status === "downloading" && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full bg-violet-500 transition-[width] duration-300 ease-linear ${
                    !progress?.total ? "animate-pulse w-1/12" : ""
                  }`}
                  style={progress?.total ? { width: `${Math.min(100, (progress.received / progress.total) * 100)}%` } : undefined}
                />
              </div>
              <span className="w-10 text-right text-xs tabular-nums text-zinc-400">
                {progress?.total ? `${Math.floor((progress.received / progress.total) * 100)}%` : ""}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="text-zinc-400 hover:text-white text-sm"
          onClick={onDismiss}
          aria-label="Dismiss update notification"
        >
          ✕
        </button>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 transition"
          onClick={onDismiss}
          disabled={status === "downloading"}
        >
          Later
        </button>
        {status === "error" ? (
          <>
            <button
              type="button"
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 transition"
              onClick={onInstall}
            >
              Try again
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-semibold text-white transition"
              onClick={() => openExternal("https://klipprr.com/download")}
            >
              Download from website
            </button>
          </>
        ) : (
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-semibold text-white disabled:opacity-50 transition"
            onClick={onInstall}
            disabled={status === "downloading"}
          >
            {status === "downloading" ? "Downloading…" : "Download & restart"}
          </button>
        )}
      </div>
      {info.body && (
        <div className="mt-3 text-xs text-zinc-300 max-h-24 overflow-auto whitespace-pre-wrap">
          {info.body}
        </div>
      )}
    </div>
  );
}
