"use client";

import { useEffect, useState, useRef } from "react";
import { downloadAll, type AgentResult } from "../lib/clipagent";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { releaseClipExports } from "@/lib/usage";

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
  /** Normalized URL that resolve used. Export should prefer this over whatever is currently typed. */
  resolvedUrl?: string | null;
  /** When set, export uses this local file path instead of videoUrl (desktop only). */
  localFilePath?: string | null;
  videoData: VideoData | null;

  exportHQ: boolean;
  setExportHQ: (v: boolean) => void;
  /** Pro-only feature: allow using Quality mode. */
  canUseQualityMode: boolean;
  /** Quality mode only: force re-encode to H.264 (slower). */
  qualityReencodeH264: boolean;
  setQualityReencodeH264: (v: boolean) => void;

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
  /** True when exports should include a watermark (Free plan). */
  hasWatermark: boolean;

  /** When user picks a folder (Pro), persist it via Tauri. */
  onExportPathChosen?: (path: string) => void;

  onUpgradeRequested?: () => void;

  onBeforeExport?: (clipCount: number) => Promise<boolean>;
  onExportReservationStart?: (clipCount: number) => void;
  onExportClipSettled?: () => void;
  onExportReservationComplete?: () => void;

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
  resolvedUrl,
  localFilePath,
  videoData,
  exportHQ,
  setExportHQ,
  canUseQualityMode,
  qualityReencodeH264,
  setQualityReencodeH264,
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
  hasWatermark,
  onExportPathChosen,
  onUpgradeRequested,
  onBeforeExport,
  onExportReservationStart,
  onExportClipSettled,
  onExportReservationComplete,
  onExportComplete,
}: ExportPanelProps) {
  const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI__;
  const [exportProgress, setExportProgress] = useState<{
    clipIndex: number;
    totalClips: number;
    clipsCompleted: number;
  } | null>(null);
  const [qualityGlobal, setQualityGlobal] = useState<{ phase: string; percent: number } | null>(null);
  /** Per-clip progress 0–100; key = clip index. */
  const [clipProgress, setClipProgress] = useState<Record<number, number>>({});
  /** Per-clip simulated progress config for the yt-dlp phase. */
  const clipSimRef = useRef<Record<number, { t0: number; durMs: number }>>({});
  /** When true for an index, we stop simulating and trust backend progress. */
  const clipHasRealProgressRef = useRef<Record<number, boolean>>({});
  /** For the current export request: half-duration ms per clip index. */
  const clipHalfDurMsRef = useRef<Record<number, number>>({});
  const clipProgressRef = useRef<Record<number, number>>({});
  const exportTotalRef = useRef<number | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const exportInProgressRef = useRef(false);
  const exportClientIdRef = useRef<string | null>(null);
  const clipFailedRef = useRef<Record<number, string>>({});
  const [clipFailed, setClipFailed] = useState<Record<number, string>>({});
  const exportOkCountRef = useRef(0);
  const exportFailedCountRef = useRef(0);
  const exportDirRef = useRef<string>("");
  const refundedFailedClipIndicesRef = useRef<Record<number, true>>({});
  const [exportClipNames, setExportClipNames] = useState<string[]>([]);
  const exportClipNamesRef = useRef<string[]>([]);

  function dbg(_msg: string, _extra?: any) {}

  function clearExportingUI(reason: string, extra?: any) {
    dbg(`clearExportingUI: ${reason}`, extra);
    exportInProgressRef.current = false;
    setConnectionLost(false);
    setIsExporting(false);
    setExportProgress(null);
    setClipProgress({});
    setClipFailed({});
    setExportClipNames([]);
    exportClipNamesRef.current = [];
    clipSimRef.current = {};
    clipHasRealProgressRef.current = {};
    clipHalfDurMsRef.current = {};
    clipProgressRef.current = {};
    clipFailedRef.current = {};
    exportTotalRef.current = null;
    exportClientIdRef.current = null;
    exportOkCountRef.current = 0;
    exportFailedCountRef.current = 0;
    exportDirRef.current = "";
    refundedFailedClipIndicesRef.current = {};
  }

  useEffect(() => {
    clipProgressRef.current = clipProgress;
  }, [clipProgress]);

  useEffect(() => {
    if (!isTauri) return;
    const unlistenProgress = listen<{
      clipIndex?: number;
      totalClips?: number;
      phase?: string;
      clipPercent?: number;
      globalPercent?: number;
      client_export_id?: string;
    }>("export-progress", (event) => {
      const p = event.payload;
      if (p?.client_export_id && exportClientIdRef.current && p.client_export_id !== exportClientIdRef.current) {
        dbg("IGNORING export-progress (stale id)", { got: p.client_export_id, want: exportClientIdRef.current, p });
        return;
      }
      // If we are receiving progress events, backend is alive; clear "connection lost".
      if (exportInProgressRef.current) setConnectionLost(false);
      const total = p?.totalClips != null ? Number(p.totalClips) : 0;
      const idx = typeof p?.clipIndex === "number" ? p.clipIndex : 0;
      const percent = typeof p?.clipPercent === "number" ? Math.min(100, Math.max(0, p.clipPercent)) : undefined;
      const global = typeof p?.globalPercent === "number" ? Math.min(100, Math.max(0, p.globalPercent)) : undefined;
      if (total > 0) {
        dbg("event export-progress", p);
        exportTotalRef.current = total;
        if (global !== undefined && typeof p?.phase === "string" && p.phase.startsWith("quality_")) {
          setQualityGlobal({ phase: p.phase, percent: global });
        }
        setExportProgress((prev) => ({
          clipIndex: idx,
          totalClips: total,
          clipsCompleted: prev?.clipsCompleted ?? 0,
        }));

        // Start simulated 0→50% ONLY when this clip actually starts exporting.
        // We gate this on the explicit "clip start" event (phase=clip, percent=0).
        if (
          !localFilePath &&
          percent === 0 &&
          p?.phase === "clip" &&
          !clipHasRealProgressRef.current[idx] &&
          clipSimRef.current[idx] == null
        ) {
          dbg(`start sim for clip ${idx}`, { halfDurMs: clipHalfDurMsRef.current[idx] });
          const durMs = clipHalfDurMsRef.current[idx] ?? 1200;
          clipSimRef.current[idx] = { t0: Date.now(), durMs: Math.max(500, durMs) };
          // Ensure the row exists so it doesn't show "pending" once started.
          setClipProgress((prev) => ({ ...prev, [idx]: 0 }));
        }

        // Only treat progress as "real" once encoding starts (we emit >=50 at encoding start),
        // otherwise we'd stop simulating immediately due to the 0% "clip start" event.
        if (percent !== undefined && (p?.phase === "encoding" || percent >= 50)) {
          clipHasRealProgressRef.current[idx] = true;
        }
        if (percent !== undefined) {
          // Keep the ref in sync immediately (avoid race where export-all-done arrives before state updates).
          clipProgressRef.current = { ...clipProgressRef.current, [idx]: percent };
          setClipProgress((prev) => ({ ...prev, [idx]: percent }));
        }
      }
    });
    const unlistenDone = listen<{ clipIndex?: number; clip_name?: string; client_export_id?: string }>("export-clip-done", (event) => {
      if (event.payload?.client_export_id && exportClientIdRef.current && event.payload.client_export_id !== exportClientIdRef.current) {
        dbg("IGNORING export-clip-done (stale id)", { got: event.payload.client_export_id, want: exportClientIdRef.current });
        return;
      }
      if (exportInProgressRef.current) setConnectionLost(false);
      dbg("event export-clip-done", event.payload);
      exportOkCountRef.current += 1;
      const idx = typeof event.payload?.clipIndex === "number" ? event.payload.clipIndex : undefined;
      setExportProgress((prev) =>
        prev && prev.totalClips > 0
          ? { ...prev, clipsCompleted: Math.min(prev.clipsCompleted + 1, prev.totalClips) }
          : prev
      );
      if (idx !== undefined) {
        clipProgressRef.current = { ...clipProgressRef.current, [idx]: 100 };
        setClipProgress((prev) => ({ ...prev, [idx]: 100 }));
        onExportClipSettled?.();
      }
    });
    const unlistenFailed = listen<{ clipIndex?: number; reason?: string; client_export_id?: string }>(
      "export-clip-failed",
      (event) => {
        if (event.payload?.client_export_id && exportClientIdRef.current && event.payload.client_export_id !== exportClientIdRef.current) {
          dbg("IGNORING export-clip-failed (stale id)", { got: event.payload.client_export_id, want: exportClientIdRef.current });
          return;
        }
        if (exportInProgressRef.current) setConnectionLost(false);
        dbg("event export-clip-failed", event.payload);
        exportFailedCountRef.current += 1;
        const idx = typeof event.payload?.clipIndex === "number" ? event.payload.clipIndex : undefined;
        const reason = typeof event.payload?.reason === "string" ? event.payload.reason : "failed";
        if (idx !== undefined) {
          if (!refundedFailedClipIndicesRef.current[idx]) {
            refundedFailedClipIndicesRef.current[idx] = true;
            releaseClipExports({ count: 1 }).then((res) => {
              if (!res.ok) {
                console.warn("[Export] Failed to refund quota for failed clip", {
                  idx,
                  error: res.error,
                });
              }
            });
          }
          onExportClipSettled?.();
          clipFailedRef.current = { ...clipFailedRef.current, [idx]: reason };
          setClipFailed((prev) => ({ ...prev, [idx]: reason }));
          // Mark as "done" so export-all-done can close UI deterministically.
          clipProgressRef.current = { ...clipProgressRef.current, [idx]: 100 };
          setClipProgress((prev) => ({ ...prev, [idx]: 100 }));
        }
      }
    );
    const unlistenAllDone = listen<{ export_dir?: string; totalClips?: number; client_export_id?: string }>(
      "export-all-done",
      (event) => {
        if (event.payload?.client_export_id && exportClientIdRef.current && event.payload.client_export_id !== exportClientIdRef.current) {
          dbg("IGNORING export-all-done (stale id)", { got: event.payload.client_export_id, want: exportClientIdRef.current });
          return;
        }
        if (exportInProgressRef.current) setConnectionLost(false);
        dbg("event export-all-done", event.payload);
        if (typeof event.payload?.export_dir === "string") {
          exportDirRef.current = event.payload.export_dir;
        }
        if ((window as any).__exportSafetyTimeout != null) {
          window.clearTimeout((window as any).__exportSafetyTimeout);
          (window as any).__exportSafetyTimeout = null;
        }
        if (exportInProgressRef.current) {
          const total =
            typeof event.payload?.totalClips === "number"
              ? Number(event.payload.totalClips)
              : exportTotalRef.current;
          const completed =
            total != null
              ? Object.values(clipProgressRef.current).filter((p) => typeof p === "number" && p >= 100).length
              : null;
          const failed =
            total != null ? Object.keys(clipFailedRef.current).length : null;

          // Defensive guard: export-all-done can arrive essentially at the same time as the last clip-done.
          // If we're short by a clip, retry once shortly before deciding it's truly early.
          if (total != null && completed != null && failed != null && completed + failed < total) {
            dbg("export-all-done arrived before completion; retrying shortly", { total, completed, failed, clipProgress: clipProgressRef.current, clipFailed: clipFailedRef.current });
            setConnectionLost(true);
            window.setTimeout(() => {
              if (!exportInProgressRef.current) return;
              const completedNow = Object.values(clipProgressRef.current).filter((p) => typeof p === "number" && p >= 100).length;
              const failedNow = Object.keys(clipFailedRef.current).length;
              if (completedNow + failedNow >= total) {
                setConnectionLost(false);
                const okCount = exportOkCountRef.current;
                const exportDir = exportDirRef.current;
                onExportReservationComplete?.();
                clearExportingUI("export-all-done accepted (after retry)", { total, completedNow, failedNow, okCount, exportDir });
                if (onExportComplete && exportDir && okCount > 0) {
                  onExportComplete(okCount, exportDir);
                } else if (okCount === 0) {
                  alert("Export failed. No clips were exported.");
                }
              }
            }, 120);
            return;
          }

          const okCount = exportOkCountRef.current;
          const exportDir = exportDirRef.current;
          onExportReservationComplete?.();
          clearExportingUI("export-all-done accepted", { total, completed, failed, okCount, exportDir });
          if (onExportComplete && exportDir && okCount > 0) {
            onExportComplete(okCount, exportDir);
          } else if (okCount === 0) {
            alert("Export failed. No clips were exported.");
          }
        }
      }
    );
    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenDone.then((fn) => fn());
      unlistenFailed.then((fn) => fn());
      unlistenAllDone.then((fn) => fn());
    };
  }, [isTauri]);

  useEffect(() => {
    if (!isExporting) return;
    const interval = window.setInterval(() => {
      const sim = clipSimRef.current;
      const hasReal = clipHasRealProgressRef.current;
      const now = Date.now();
      const updates: Record<number, number> = {};
      let changed = false;

      for (const k of Object.keys(sim)) {
        const idx = Number(k);
        if (Number.isNaN(idx)) continue;
        if (hasReal[idx]) continue;
        const cfg = sim[idx];
        if (!cfg) continue;
        const elapsed = Math.max(0, now - cfg.t0);
        const frac = cfg.durMs > 0 ? Math.min(1, elapsed / cfg.durMs) : 1;
        const pct = Math.round(frac * 50); // 0..50
        updates[idx] = pct;
        changed = true;
      }

      if (changed) {
        setClipProgress((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(updates)) {
            const idx = Number(k);
            // Only update if backend hasn't moved it past our simulated range.
            const cur = typeof next[idx] === "number" ? next[idx] : undefined;
            if (cur === undefined || cur < 50) {
              next[idx] = Math.min(50, v);
            }
          }
          return next;
        });
      }
    }, 200);
    return () => window.clearInterval(interval);
  }, [isExporting]);

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
      const ok = await onBeforeExport(chosen.length);
      if (!ok) return;
    }
    onExportReservationStart?.(chosen.length);

    exportInProgressRef.current = true;
    exportClientIdRef.current = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setConnectionLost(false);
    setIsExporting(true);
    setExportProgress(null);
    setClipProgress({});
    setQualityGlobal(null);
    clipHasRealProgressRef.current = {};
    clipHalfDurMsRef.current = {};
    clipProgressRef.current = {};
    exportTotalRef.current = null;
    refundedFailedClipIndicesRef.current = {};
    const names = chosen.map((c) => c?.name).filter((n) => typeof n === "string" && n.trim().length > 0) as string[];
    setExportClipNames(names);
    exportClipNamesRef.current = names;

    try {
      dbg("doExport start", { selectedOnly, localFilePath, clipCount: chosen.length });
      // Prepare simulated yt-dlp phase config. We do NOT start bars yet; we only start a clip's
      // simulated 0→50% when we receive its "clip start" event from the backend.
      clipSimRef.current = {};
      if (!localFilePath) {
        const halfDur: Record<number, number> = {};
        for (let i = 0; i < chosen.length; i++) {
          const durSec = Math.max(0, Number(chosen[i]?.end ?? 0) - Number(chosen[i]?.start ?? 0));
          halfDur[i] = Math.max(500, (durSec * 1000) / 2);
        }
        clipHalfDurMsRef.current = halfDur;
      }

      const exportUrl = resolvedUrl && resolvedUrl.trim().length > 0
        ? resolvedUrl
        : videoUrl.trim();

      const result = await downloadAll({
        client_export_id: exportClientIdRef.current,
        source_title: (videoData as any)?.title ? String((videoData as any).title) : null,
        quality_reencode_h264: !localFilePath && exportHQ ? Boolean(qualityReencodeH264) : undefined,
        // Use the resolved URL that produced the current preview, not whatever is currently typed.
        url: localFilePath ? "" : exportUrl,
        local_path: localFilePath ?? undefined,
        clips: chosen,
        mode: localFilePath ? "speed" : exportHQ ? "quality" : "speed",
        // Free exports are capped at 720p max (enforced client + backend).
        fast_max_height: localFilePath
          ? null
          : exportHQ
          ? null
          : hasWatermark
          ? Math.min(720, fastCap ?? 720)
          : fastCap,
        keep_full: keepWholeVideo,
        preview_url: videoData?.preview?.url ?? null,
        video_id: videoData?.id ?? null,
        export_path: sanitizeExportPath(exportPath),
        has_watermark: Boolean(hasWatermark),
        codec: exportCodec,
      });

      if (!result.ok) {
        dbg("downloadAll returned error", result);
        // The HTTP request can drop even while the backend continues exporting.
        // In that case, keep UI open and rely on export-* events to finish.
        if (result.error === "download_fetch_failed") {
          setConnectionLost(true);
          if ((window as any).__exportSafetyTimeout != null) {
            window.clearTimeout((window as any).__exportSafetyTimeout);
            (window as any).__exportSafetyTimeout = null;
          }
          const safetyTimeout = window.setTimeout(() => {
            if (exportInProgressRef.current) {
              clearExportingUI("safety timeout after connection lost");
              alert("Export may have failed. The connection was lost and no completion was received.");
            }
          }, 15 * 60 * 1000); // 15 minutes
          (window as any).__exportSafetyTimeout = safetyTimeout;
          dbg("treating download_fetch_failed as connection lost; waiting for events");
          return;
        }

        clearExportingUI("downloadAll error", result);
        alert("Export failed: " + result.error);
        return;
      }

      dbg("downloadAll returned ok (waiting for events)", result.data);
      // Do NOT toast success here; rely on export-all-done + clip-done/failed events so the UI
      // doesn't say "Exported 0 clips" or get stuck at 50% on failures.
    } catch (e) {
      // Do NOT clear loading here. The HTTP connection may have timed out or dropped
      // while the backend is still exporting (long clips). We only clear when we
      // receive export-all-done.
      console.error("Export request failed (connection may have timed out):", e);
      setConnectionLost(true);
      const safetyTimeout = window.setTimeout(() => {
        if (exportInProgressRef.current) {
          clearExportingUI("safety timeout after connection lost");
          alert("Export may have failed. The connection was lost and no completion was received.");
        }
      }, 15 * 60 * 1000); // 15 minutes
      (window as any).__exportSafetyTimeout = safetyTimeout;
    }
  }

  return (
    <div className="space-y-4">
      {/* CAPABILITIES */}
      {!localFilePath && (
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
      )}

      {localFilePath && (
        <p className="text-xs text-zinc-500">
          Local exports preserve source quality and format (trim only).
        </p>
      )}

      {/* QUALITY TOGGLE */}
      {!localFilePath && (!fastReachesMax || showAdvancedExport) && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <span className={!exportHQ ? "text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-gray-400"}>
              Fast
            </span>

            <button
              type="button"
              onClick={() => {
                if (!canUseQualityMode) {
                  onUpgradeRequested?.();
                  return;
                }
                setExportHQ(!exportHQ);
              }}
              className={`relative w-11 h-6 rounded-full ${
                exportHQ ? "bg-green-500" : "bg-gray-600"
              } ${!canUseQualityMode ? "opacity-60" : ""}`}
              aria-disabled={!canUseQualityMode}
              title={!canUseQualityMode ? "Quality mode is Pro-only" : undefined}
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

          {!canUseQualityMode && (
            <button
              type="button"
              className="text-xs text-zinc-500 underline"
              onClick={() => onUpgradeRequested?.()}
            >
              Quality mode is Pro-only
            </button>
          )}
        </div>
      )}

      {!localFilePath && !exportHQ ? (
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
      ) : !localFilePath ? (
        <div className="space-y-2">
          <label className="text-xs text-gray-400">Quality mode</label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={qualityReencodeH264}
              onChange={() => setQualityReencodeH264(!qualityReencodeH264)}
            />
            Re-encode to H.264 (slower)
          </label>
          <p className="text-xs text-zinc-500">
            Re-encoding improves compatibility but can be much slower on long/high-res videos.
          </p>
        </div>
      ) : null}

      {!localFilePath && !exportHQ && fastMax > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Resolution</label>
          <select
            value={fastCap ?? "auto"}
            onChange={(e) =>
              setFastCap(e.target.value === "auto" ? null : Number(e.target.value))
            }
            className="w-full rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm px-3 py-2 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer"
          >
            <option value="auto">
              Auto (up to {fmtRes(hasWatermark ? Math.min(fastMax, 720) : fastMax)})
            </option>
          {[2160, 1440, 1080, 720, 480, 360]
            .filter((h) => h <= (hasWatermark ? Math.min(fastMax, 720) : fastMax))
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
            <span className="text-sm font-medium text-zinc-900 dark:text-white">
              {exportProgress?.totalClips
                ? (() => {
                    const idx = exportProgress.clipIndex ?? 0;
                    const label = exportClipNames[idx] ?? `Clip ${idx + 1}`;
                    return `Exporting ${label}…`;
                  })()
                : "Preparing export…"}
            </span>
          </div>
          {exportProgress && exportProgress.totalClips > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Exporting clips</p>
              {Array.from({ length: exportProgress.totalClips }, (_, i) => {
                const percent = clipProgress[i];
                const isPending = percent === undefined;
                const label = exportClipNames[i] ?? `Clip ${i + 1}`;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300 w-14 shrink-0">
                      {label}
                    </span>
                    {isPending ? (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">pending</span>
                    ) : (
                      <div className="flex-1 min-w-0 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-violet-500 dark:bg-violet-400 transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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

      {isExporting && exportHQ && qualityGlobal && (
        <div className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 p-3 space-y-2">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {qualityGlobal.phase === "quality_download_video"
              ? "Quality: downloading video…"
              : qualityGlobal.phase === "quality_download_audio"
              ? "Quality: downloading audio…"
              : qualityGlobal.phase === "quality_merge"
              ? "Quality: preparing full video…"
              : "Quality: working…"}
          </p>
          <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-violet-500 dark:bg-violet-400 transition-all duration-300"
              style={{ width: `${qualityGlobal.percent}%` }}
            />
          </div>
        </div>
      )}

      {!isExporting && (
        <>
          <button
            disabled={selectedClipIds.length === 0}
            onClick={() => doExport(true)}
            className="btn-brand-green w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>↓</span>
            Export selected {selectedClipIds.length > 0 && `(${selectedClipIds.length})`}
          </button>

          <button
            disabled={clips.length === 0}
            onClick={() => doExport(false)}
            className="btn-brand w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>↓</span>
            Export all {clips.length > 0 && `(${clips.length})`}
          </button>
        </>
      )}
    </div>
  );
}