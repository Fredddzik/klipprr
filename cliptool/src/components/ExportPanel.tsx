"use client";

import { useEffect, useState, useRef } from "react";
import { downloadAll, type AgentResult } from "../lib/clipagent";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";

interface Clip {
  id: string;
  start: number;
  end: number;
  name: string;
}

interface VideoData {
  id: string;
  preview?: { url?: string };
}

interface ExportPanelProps {
  clips: Clip[];
  selectedClipIds: string[];

  videoUrl: string;
  /** When set, export uses this local file path instead of videoUrl (desktop only). */
  localFilePath?: string | null;
  videoData: VideoData | null;

  exportHQ: boolean;
  setExportHQ: (v: boolean) => void;

  exportCodec: "universal" | "original";
  setExportCodec: (v: "universal" | "original") => void;

  keepWholeVideo: boolean;
  setKeepWholeVideo: (v: boolean) => void;

  fastCap: number | null;
  setFastCap: (v: number | null) => void;

  fastMax: number;
  trueMax: number;
  fastReachesMax: boolean;
  needsReencode: boolean;

  showAdvancedExport: boolean;
  setShowAdvancedExport: (v: boolean) => void;

  shouldWarnQuality: boolean;

  isExporting: boolean;
  setIsExporting: (v: boolean) => void;

  exportPath: string;
  setExportPath: (v: string) => void;
  defaultExportDir: string;

  sanitizeExportPath: (input: string) => string | null;

  canEditExportPath: boolean;

  /** When user picks a folder (Pro), persist it via Tauri. */
  onExportPathChosen?: (path: string) => void;

  onUpgradeRequested?: () => void;

  onBeforeExport?: () => Promise<boolean>;

  /** Called when export finishes successfully (count, exportDir). Replaces alert. */
  onExportComplete?: (count: number, exportDir: string) => void;
}

function fmtRes(h: number) {
  return h > 0 ? `${h}p` : "—";
}

/** Show path with capped length, prioritizing the end (e.g. "...Clips/Experiment clips"). */
function truncatePathEnd(path: string, maxLen: number = 40): string {
  if (path.length <= maxLen) return path;
  return "..." + path.slice(-(maxLen - 3));
}

export default function ExportPanel({
  clips,
  selectedClipIds,
  videoUrl,
  localFilePath,
  videoData,
  exportHQ,
  setExportHQ,
  exportCodec,
  setExportCodec,
  keepWholeVideo,
  setKeepWholeVideo,
  fastCap,
  setFastCap,
  fastMax,
  trueMax,
  fastReachesMax,
  needsReencode,
  showAdvancedExport,
  setShowAdvancedExport,
  shouldWarnQuality,
  isExporting,
  setIsExporting,
  exportPath,
  setExportPath,
  defaultExportDir,
  sanitizeExportPath,
  canEditExportPath,
  onExportPathChosen,
  onUpgradeRequested,
  onBeforeExport,
  onExportComplete,
}: ExportPanelProps) {
  const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI__;
  const [exportProgress, setExportProgress] = useState<{
    clipIndex: number;
    totalClips: number;
    clipsCompleted: number;
  } | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const exportInProgressRef = useRef(false);

  useEffect(() => {
    if (!isTauri) return;
    const unlistenProgress = listen<{ clipIndex?: number; totalClips?: number; phase?: string }>(
      "export-progress",
      (event) => {
        const p = event.payload;
        const total = p?.totalClips != null ? Number(p.totalClips) : 0;
        if (total > 0) {
          setExportProgress((prev) => ({
            clipIndex: typeof p?.clipIndex === "number" ? p.clipIndex : 0,
            totalClips: total,
            clipsCompleted: prev?.clipsCompleted ?? 0,
          }));
        }
      }
    );
    const unlistenDone = listen<{ clip_name?: string }>("export-clip-done", () => {
      setExportProgress((prev) =>
        prev && prev.totalClips > 0
          ? { ...prev, clipsCompleted: Math.min(prev.clipsCompleted + 1, prev.totalClips) }
          : prev
      );
    });
    const unlistenAllDone = listen<{ export_dir?: string; totalClips?: number }>(
      "export-all-done",
      () => {
        if ((window as any).__exportSafetyTimeout != null) {
          window.clearTimeout((window as any).__exportSafetyTimeout);
          (window as any).__exportSafetyTimeout = null;
        }
        if (exportInProgressRef.current) {
          exportInProgressRef.current = false;
          setConnectionLost(false);
          setIsExporting(false);
          setExportProgress(null);
        }
      }
    );
    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenDone.then((fn) => fn());
      unlistenAllDone.then((fn) => fn());
    };
  }, [isTauri]);

  const displayPath =
    (exportPath && exportPath.trim()) ? exportPath : (defaultExportDir || "~/Downloads");

  async function chooseExportFolder() {
    if (!isTauri || !canEditExportPath) return;
    try {
      const selected = await openFolderDialog({
        directory: true,
        multiple: false,
      });
      if (selected) {
        setExportPath(selected);
        onExportPathChosen?.(selected);
      }
    } catch (e) {
      console.warn("Folder dialog failed:", e);
    }
  }
  async function doExport(selectedOnly: boolean) {
    const chosen = selectedOnly
      ? clips.filter((c) => selectedClipIds.includes(c.id))
      : clips;

    if (chosen.length === 0) return;

    if (!videoData) {
      alert("Video data not available.");
      return;
    }

    if (shouldWarnQuality && !localFilePath) {
      const ok = window.confirm(
        "High Quality mode downloads the entire video first.\n\n" +
          "For long or 4K videos this can take several minutes and may time out.\n\n" +
          "Fast mode is recommended for most clips.\n\n" +
          "Continue anyway?"
      );
      if (!ok) return;
    }

    if (onBeforeExport) {
      const ok = await onBeforeExport();
      if (!ok) return;
    }

    exportInProgressRef.current = true;
    setConnectionLost(false);
    setIsExporting(true);
    setExportProgress(null);

    try {
      const result = await downloadAll({
        url: localFilePath ? "" : videoUrl.trim(),
        local_path: localFilePath ?? undefined,
        clips: chosen,
        mode: exportHQ ? "quality" : "speed",
        fast_max_height: exportHQ ? null : fastCap,
        keep_full: keepWholeVideo,
        preview_url: videoData?.preview?.url ?? null,
        video_id: videoData?.id ?? null,
        export_path: sanitizeExportPath(exportPath),
        has_watermark: !canEditExportPath,
        codec: exportCodec,
      });

      if (!result.ok) {
        exportInProgressRef.current = false;
        setIsExporting(false);
        setExportProgress(null);
        alert("Export failed: " + result.error);
        return;
      }

      const count = result.data?.results?.filter((r: any) => r?.ok).length ?? chosen.length;
      const exportDir = result.data?.export_dir ?? "";
      if (onExportComplete && exportDir) {
        onExportComplete(count, exportDir);
      } else {
        alert(selectedOnly ? "Export successful!" : "All clips exported!");
      }
      // Fallback: clear loading if export-all-done never fires (e.g. old backend)
      setTimeout(() => {
        if (exportInProgressRef.current) {
          exportInProgressRef.current = false;
          setConnectionLost(false);
          setIsExporting(false);
          setExportProgress(null);
        }
      }, 2000);
    } catch (e) {
      // Do NOT clear loading here. The HTTP connection may have timed out or dropped
      // while the backend is still exporting (long clips). We only clear when we
      // receive export-all-done.
      console.error("Export request failed (connection may have timed out):", e);
      setConnectionLost(true);
      const safetyTimeout = window.setTimeout(() => {
        if (exportInProgressRef.current) {
          exportInProgressRef.current = false;
          setConnectionLost(false);
          setIsExporting(false);
          setExportProgress(null);
          alert("Export may have failed. The connection was lost and no completion was received.");
        }
      }, 15 * 60 * 1000); // 15 minutes
      (window as any).__exportSafetyTimeout = safetyTimeout;
    }
  }

  return (
    <div className="space-y-4">
      {/* CAPABILITIES */}
      <div className="text-xs text-zinc-600 dark:text-gray-300/80 space-y-1">
        <div>
          Fast max: <span className="text-zinc-900 dark:text-white">{fmtRes(fastMax)}</span>{" "}
          • Max possible: <span className="text-zinc-900 dark:text-white">{fmtRes(trueMax)}</span>
        </div>

        {fastMax > 0 && trueMax > 0 && fastMax < trueMax && (
          <div className="text-yellow-300/90">
            True max requires Quality mode (slower).
            {needsReencode
              ? " True max may require re-encoding (much slower on long 4K)."
              : ""}
          </div>
        )}

        {fastReachesMax && (
          <div className="text-gray-400">
            Fast already reaches the highest resolution available.
          </div>
        )}
      </div>

      {/* QUALITY TOGGLE */}
      {(!fastReachesMax || showAdvancedExport) && (
        <label className="flex items-center gap-2 text-sm">
          <span className={!exportHQ ? "text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-gray-400"}>
            Fast
          </span>

          <button
            type="button"
            onClick={() => setExportHQ(!exportHQ)}
            className={`relative w-11 h-6 rounded-full ${
              exportHQ ? "bg-green-500" : "bg-gray-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                exportHQ ? "translate-x-5" : ""
              }`}
            />
          </button>

          <span className={exportHQ ? "text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-gray-400"}>
            Quality
          </span>
        </label>
      )}

      <div className="space-y-1">
        <label className="text-xs text-gray-400">Video format</label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setExportCodec("universal")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              exportCodec === "universal"
                ? "btn-brand text-white"
                : "bg-zinc-200 border border-zinc-300 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            H.264 – Universal
          </button>

          <button
            type="button"
            onClick={() => setExportCodec("original")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              exportCodec === "original"
                ? "btn-brand text-white"
                : "bg-zinc-200 border border-zinc-300 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            AV1 – Original
          </button>
        </div>

        {exportCodec === "original" && (
          <p className="text-xs text-yellow-400 mt-1">
            AV1 may not play in QuickTime on older Macs.
          </p>
        )}
      </div>

      {!exportHQ && fastMax > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Resolution</label>
          <select
            value={fastCap ?? "auto"}
            onChange={(e) =>
              setFastCap(e.target.value === "auto" ? null : Number(e.target.value))
            }
            className="w-full rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm px-3 py-2 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer"
          >
            <option value="auto">Auto (up to {fmtRes(fastMax)})</option>
          {[2160, 1440, 1080, 720, 480, 360]
            .filter((h) => h <= fastMax)
            .map((h) => (
              <option key={h} value={h}>
                {h}p
              </option>
            ))}
          </select>
        </div>
      )}

      {fastReachesMax && !showAdvancedExport && (
        <button
          type="button"
          onClick={() => setShowAdvancedExport(true)}
          className="text-xs text-gray-400 underline"
        >
          Show advanced export options
        </button>
      )}

      {exportHQ && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={keepWholeVideo}
            onChange={() => setKeepWholeVideo(!keepWholeVideo)}
          />
          Keep whole downloaded video as well
        </label>
      )}

      {isExporting && (
        <div className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900/80 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-5 h-5 border-2 border-violet-500 dark:border-violet-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-zinc-900 dark:text-white">
              {exportProgress
                ? exportProgress.clipsCompleted < exportProgress.totalClips
                  ? `Exporting clip ${exportProgress.clipIndex + 1} of ${exportProgress.totalClips}…`
                  : `Finishing…`
                : "Preparing export…"}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
            {/* Real progress when we have events; otherwise indeterminate so bar always moves */}
            {exportProgress && exportProgress.totalClips > 0 && exportProgress.clipsCompleted >= exportProgress.totalClips ? (
              <div
                className="h-full bg-violet-500 transition-all duration-300"
                style={{
                  width: `${Math.round(
                    (exportProgress.clipsCompleted / exportProgress.totalClips) * 100
                  )}%`,
                }}
              />
            ) : (
              <div
                className="h-full bg-violet-500 animate-export-bar"
                style={{ width: "0%" }}
              />
            )}
          </div>
          {connectionLost && (
            <p className="text-xs text-amber-400">
              Connection lost — export may still be running. You’ll see a notification when it finishes.
            </p>
          )}
          <p className="text-xs text-zinc-400">
            Long clips may take several minutes. Don’t close the app.
          </p>
        </div>
      )}

      <div className="space-y-1 relative group">
        <label className="text-xs text-zinc-500 dark:text-gray-400">Export folder</label>

        <div
          className={`flex gap-2 items-center rounded border min-w-0 max-w-full
            ${canEditExportPath
              ? "bg-zinc-200 border-zinc-300 dark:bg-gray-800 dark:border-gray-700"
              : "bg-zinc-100 border-zinc-200 dark:bg-gray-900 dark:border-gray-800"
            }`}
        >
          <span
            className={`flex-1 min-w-0 max-w-[14rem] py-1 px-2 text-sm font-mono block overflow-hidden text-ellipsis whitespace-nowrap
              ${canEditExportPath ? "text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-gray-500"}
            `}
            title={displayPath}
          >
            {truncatePathEnd(displayPath)}
          </span>
          {canEditExportPath && isTauri ? (
            <button
              type="button"
              onClick={chooseExportFolder}
              className="shrink-0 py-1 px-2 rounded text-sm bg-zinc-600 hover:bg-zinc-500 text-white"
            >
              Choose folder…
            </button>
          ) : !canEditExportPath ? (
            <button
              type="button"
              onClick={() => onUpgradeRequested?.()}
              className="shrink-0 py-1 px-2 rounded text-sm bg-zinc-500 hover:bg-zinc-600 text-white dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              🔒 Pro
            </button>
          ) : null}
        </div>
      </div>

      <button
        disabled={selectedClipIds.length === 0 || isExporting}
        onClick={() => doExport(true)}
        className="btn-brand-green w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
      >
        <span>↓</span>
        Export selected {selectedClipIds.length > 0 && `(${selectedClipIds.length})`}
      </button>

      <button
        disabled={clips.length === 0 || isExporting}
        onClick={() => doExport(false)}
        className="btn-brand w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
      >
        <span>↓</span>
        Export all {clips.length > 0 && `(${clips.length})`}
      </button>
    </div>
  );
}