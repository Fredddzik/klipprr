"use client";

import { useEffect, useState, useRef } from "react";
import { downloadAll, cancelExport as cancelExportRequest, type AgentResult } from "../lib/clipagent";
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
  /** Monthly clips remaining for the current user (Free plan). Null = unknown/Pro. */
  clipsRemaining?: number | null;

  /** When user picks a folder (Pro), persist it via Tauri. */
  onExportPathChosen?: (path: string) => void;

  onUpgradeRequested?: (feature: string) => void;

  onBeforeExport?: (clipCount: number) => Promise<boolean>;
  onExportReservationStart?: (clipCount: number) => void;
  onExportClipSettled?: () => void;
  onExportReservationComplete?: () => void;

  /** Called when export finishes successfully. hadWatermark reflects what was actually sent to the backend. */
  onExportComplete?: (count: number, exportDir: string, hadWatermark: boolean, totalDurationSeconds: number) => void;
  /** Called when export fails (all clips failed or request error). */
  onExportFailed?: (errorType: string) => void;
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
  clipsRemaining,
  onExportPathChosen,
  onUpgradeRequested,
  onExportFailed,
  onBeforeExport,
  onExportReservationStart,
  onExportClipSettled,
  onExportReservationComplete,
  onExportComplete,
}: ExportPanelProps) {
  const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI__;
  /** One row per clip being exported. Driven only by the agent's events: no simulated
   *  progress, and nothing is inferred from the /download-all request, which now returns
   *  as soon as the export has started (FR-11). */
  type ClipState = "waiting" | "running" | "encoding" | "finishing" | "done" | "cancelling" | "cancelled" | "failed";
  type ClipRow = { state: ClipState; percent: number };
  const [rows, setRows] = useState<ClipRow[]>([]);
  const rowsRef = useRef<ClipRow[]>([]);
  const [qualityGlobal, setQualityGlobal] = useState<{ phase: string; percent: number } | null>(null);
  const exportInProgressRef = useRef(false);
  const exportClientIdRef = useRef<string | null>(null);
  const exportOkCountRef = useRef(0);
  const exportDirRef = useRef<string>("");
  const exportHadWatermarkRef = useRef(false);
  const exportTotalDurationRef = useRef(0);
  const refundedClipIndicesRef = useRef<Record<number, true>>({});
  const [exportClipNames, setExportClipNames] = useState<string[]>([]);

  const isSettled = (s: ClipState) => s === "done" || s === "cancelled" || s === "failed";

  function setRowsNow(next: ClipRow[]) {
    rowsRef.current = next;
    setRows(next);
  }

  function updateRow(idx: number, patch: (r: ClipRow) => Partial<ClipRow> | null) {
    const cur = rowsRef.current;
    const r = cur[idx];
    if (!r) return;
    const p = patch(r);
    if (!p) return;
    const next = cur.slice();
    next[idx] = { ...r, ...p };
    setRowsNow(next);
  }

  /** A failed or cancelled clip gives its reserved export back to the monthly quota. */
  function refundClip(idx: number) {
    if (refundedClipIndicesRef.current[idx]) return;
    refundedClipIndicesRef.current[idx] = true;
    releaseClipExports({ count: 1 }).then((res) => {
      if (!res.ok) console.warn("[Export] Failed to refund quota", { idx, error: res.error });
    });
  }

  function clearExportingUI() {
    exportInProgressRef.current = false;
    setIsExporting(false);
    setRowsNow([]);
    setQualityGlobal(null);
    setExportClipNames([]);
    exportClientIdRef.current = null;
    exportOkCountRef.current = 0;
    exportDirRef.current = "";
    exportHadWatermarkRef.current = false;
    exportTotalDurationRef.current = 0;
    refundedClipIndicesRef.current = {};
  }

  function finishExport() {
    const okCount = exportOkCountRef.current;
    const exportDir = exportDirRef.current;
    const allCancelled = rowsRef.current.length > 0 && rowsRef.current.every((r) => r.state === "cancelled");
    const hadWatermark = exportHadWatermarkRef.current;
    const totalDuration = exportTotalDurationRef.current;
    onExportReservationComplete?.();
    clearExportingUI();
    if (okCount > 0) {
      if (onExportComplete && exportDir) onExportComplete(okCount, exportDir, hadWatermark, totalDuration);
    } else if (!allCancelled) {
      onExportFailed?.("all_clips_failed");
      alert("Export failed. No clips were exported.");
    }
  }

  useEffect(() => {
    if (!isTauri) return;
    const isStale = (id?: string) => !!id && !!exportClientIdRef.current && id !== exportClientIdRef.current;

    const unlistenProgress = listen<{
      clipIndex?: number;
      phase?: string;
      clipPercent?: number;
      globalPercent?: number;
      client_export_id?: string;
    }>("export-progress", (event) => {
      const p = event.payload;
      if (isStale(p?.client_export_id) || !exportInProgressRef.current) return;
      if (typeof p?.phase === "string" && p.phase.startsWith("quality_") && typeof p.globalPercent === "number") {
        setQualityGlobal({ phase: p.phase, percent: Math.min(100, Math.max(0, p.globalPercent)) });
      }
      if (typeof p?.clipIndex !== "number") return;
      const pct = typeof p.clipPercent === "number" ? Math.min(100, Math.max(0, p.clipPercent)) : 0;
      const state: ClipState =
        p.phase === "encoding" ? "encoding" : p.phase === "finishing" ? "finishing" : "running";
      updateRow(p.clipIndex, (r) =>
        isSettled(r.state) || r.state === "cancelling"
          ? null
          : { state, percent: Math.max(r.state === "waiting" ? 0 : r.percent, pct) }
      );
    });

    const unlistenDone = listen<{ clipIndex?: number; export_dir?: string; client_export_id?: string }>(
      "export-clip-done",
      (event) => {
        const p = event.payload;
        if (isStale(p?.client_export_id) || typeof p?.clipIndex !== "number") return;
        if (typeof p.export_dir === "string") exportDirRef.current = p.export_dir;
        exportOkCountRef.current += 1;
        updateRow(p.clipIndex, () => ({ state: "done", percent: 100 }));
        onExportClipSettled?.();
      }
    );

    const unlistenFailed = listen<{ clipIndex?: number; client_export_id?: string }>("export-clip-failed", (event) => {
      const p = event.payload;
      if (isStale(p?.client_export_id) || typeof p?.clipIndex !== "number") return;
      refundClip(p.clipIndex);
      updateRow(p.clipIndex, () => ({ state: "failed" }));
      onExportClipSettled?.();
    });

    const unlistenCancelled = listen<{ clipIndex?: number; client_export_id?: string }>(
      "export-clip-cancelled",
      (event) => {
        const p = event.payload;
        if (isStale(p?.client_export_id) || typeof p?.clipIndex !== "number") return;
        refundClip(p.clipIndex);
        updateRow(p.clipIndex, () => ({ state: "cancelled" }));
        onExportClipSettled?.();
      }
    );

    const unlistenAllDone = listen<{ export_dir?: string; client_export_id?: string }>("export-all-done", (event) => {
      const p = event.payload;
      if (isStale(p?.client_export_id) || !exportInProgressRef.current) return;
      if (typeof p?.export_dir === "string") exportDirRef.current = p.export_dir;
      finishExport();
    });

    // The export stopped before any clip could run: the source file vanished, the full
    // download failed, and similar.
    const unlistenError = listen<{ error?: string; client_export_id?: string }>("export-error", (event) => {
      const p = event.payload;
      if (isStale(p?.client_export_id) || !exportInProgressRef.current) return;
      const code = String(p?.error ?? "unknown_error");
      onExportReservationComplete?.();
      rowsRef.current.forEach((r, i) => {
        if (!isSettled(r.state)) refundClip(i);
      });
      clearExportingUI();
      onExportFailed?.(code.toLowerCase().replace(/\s+/g, "_").slice(0, 64));
      alert(`Export failed (${code}). No clips were exported.`);
    });

    return () => {
      [unlistenProgress, unlistenDone, unlistenFailed, unlistenCancelled, unlistenAllDone, unlistenError].forEach(
        (u) => u.then((fn) => fn())
      );
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTauri]);

  /** Stops one clip, or every clip when `idx` is undefined. The agent kills that clip's
   *  yt-dlp/ffmpeg and reports it cancelled; rows show "Cancelling…" until it does. */
  async function cancelExport(idx?: number) {
    const id = exportClientIdRef.current;
    if (!id) return;
    if (idx === undefined) {
      setRowsNow(rowsRef.current.map((r) => (isSettled(r.state) ? r : { ...r, state: "cancelling" })));
    } else {
      updateRow(idx, (r) => (isSettled(r.state) ? null : { state: "cancelling" }));
    }
    const res = await cancelExportRequest(id, idx);
    // The agent no longer knows this export (it finished a moment ago, or the app was
    // restarted): nothing will report back, so close the panel here.
    if (idx === undefined && (!res.ok || !res.data.running) && exportInProgressRef.current) {
      finishExport();
    }
  }

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
    exportOkCountRef.current = 0;
    exportDirRef.current = "";
    refundedClipIndicesRef.current = {};
    setQualityGlobal(null);
    setRowsNow(chosen.map(() => ({ state: "waiting", percent: 0 })));
    setExportClipNames(chosen.map((c, i) => (c?.name && c.name.trim()) || `Clip ${i + 1}`));
    setIsExporting(true);

    exportHadWatermarkRef.current = Boolean(hasWatermark);
    exportTotalDurationRef.current = chosen.reduce((sum, c) => sum + Math.max(0, c.end - c.start), 0);

    const exportUrl = resolvedUrl && resolvedUrl.trim().length > 0 ? resolvedUrl : videoUrl.trim();

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

    // The agent answers as soon as the export has started, so a failure here means it
    // never started (the agent is unreachable); everything after this comes by event.
    if (!result.ok && exportInProgressRef.current) {
      onExportReservationComplete?.();
      rowsRef.current.forEach((_, i) => refundClip(i));
      clearExportingUI();
      onExportFailed?.(String(result.error ?? "unknown_error").toLowerCase().replace(/\s+/g, "_").slice(0, 64));
      alert("Export could not start: " + result.error);
    }
  }

  return (
    <div className="space-y-4">
      {/* WATERMARK BANNER — shown when on Free plan */}
      {hasWatermark && !localFilePath && (
        <div className="rounded-md border border-zinc-700 bg-zinc-900 flex items-center gap-3 px-3 py-2.5">
          <p className="flex-1 text-xs text-zinc-400 min-w-0 leading-relaxed">
            {fastMax > 720 ? (
              <>
                This video is available at up to{" "}
                <span className="text-white font-medium">{fastMax}p</span>
                {" "}— free mode caps at{" "}
                <span className="text-zinc-300">720p</span> with a watermark
              </>
            ) : (
              <>Free exports include a <span className="text-zinc-300">watermark</span></>
            )}
          </p>
          <button
            type="button"
            onClick={() => onUpgradeRequested?.("watermark_removal")}
            className="shrink-0 px-3 py-1.5 rounded btn-brand text-xs"
          >
            Upgrade
          </button>
        </div>
      )}

      {/* LOW-CLIP NUDGE — shown when ≤ 3 clips remain this month (used 7+) */}
      {hasWatermark && !isExporting && typeof clipsRemaining === "number" && clipsRemaining <= 3 && clipsRemaining > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 flex items-center gap-3 px-3 py-2.5">
          <p className="flex-1 text-xs text-amber-300 min-w-0 leading-relaxed">
            {clipsRemaining === 1
              ? <>Only <span className="font-semibold">1 clip</span> left this month</>
              : <><span className="font-semibold">{clipsRemaining} clips</span> left this month</>
            }
          </p>
          <button
            type="button"
            onClick={() => onUpgradeRequested?.("clip_limit")}
            className="shrink-0 px-3 py-1.5 rounded btn-brand text-xs"
          >
            Upgrade
          </button>
        </div>
      )}

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
                  onUpgradeRequested?.("quality_mode");
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
              onClick={() => onUpgradeRequested?.("quality_mode")}
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
              className={`flex-1 py-2 rounded text-sm font-medium transition ${
                exportCodec === "universal"
                  ? "btn-brand"
                  : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
            >
              H.264 – Universal
            </button>

            <button
              type="button"
              onClick={() => setExportCodec("original")}
              className={`flex-1 py-2 rounded text-sm font-medium transition ${
                exportCodec === "original"
                  ? "btn-brand"
                  : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
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
            className="w-full rounded bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 outline-none cursor-pointer"
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

      {isExporting && rows.length > 0 && (() => {
        const total = rows.length;
        const doneCount = rows.filter((r) => r.state === "done").length;
        const active = rows.some((r) => !isSettled(r.state) && r.state !== "cancelling");
        const anyClipStarted = rows.some((r) => r.state !== "waiting");
        const title = total === 1 ? `Exporting ${exportClipNames[0] ?? "clip"}` : `Exporting ${total} clips`;
        const statusText = (r: ClipRow) =>
          r.state === "waiting" ? "Waiting"
          : r.state === "running" ? (r.percent > 0 ? `${Math.round(r.percent)}%` : localFilePath ? "Cutting…" : "Starting…")
          : r.state === "encoding" ? `Encoding ${Math.round(r.percent)}%`
          : r.state === "finishing" ? "Finishing…"
          : r.state === "done" ? "Done"
          : r.state === "cancelling" ? "Cancelling…"
          : r.state === "cancelled" ? "Cancelled"
          : "Failed";
        const barStyle = (r: ClipRow) => {
          if (r.state === "done") return { width: "100%", background: "#10b981" };
          if (r.state === "failed") return { width: "100%", background: "#ef4444" };
          if (r.state === "cancelled" || r.state === "cancelling") return { width: `${r.percent}%`, background: "#52525b" };
          return {
            width: `${Math.max(r.percent, r.state === "waiting" ? 0 : 3)}%`,
            background: "linear-gradient(90deg, #7c3cff 0%, #c935ff 60%, #ff2e92 100%)",
          };
        };
        return (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-block w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate" title={title}>{title}</p>
                {total > 1 && <p className="text-xs text-zinc-500">{doneCount} of {total} done</p>}
              </div>
              {active && (
                <button
                  type="button"
                  onClick={() => cancelExport()}
                  className="shrink-0 px-2 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                >
                  {total === 1 ? "Cancel" : "Cancel all"}
                </button>
              )}
            </div>

            {/* High Quality mode fetches the whole video once before any clip is cut. */}
            {exportHQ && qualityGlobal && !anyClipStarted && (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>
                    {qualityGlobal.phase === "quality_download_video"
                      ? "Downloading full video"
                      : qualityGlobal.phase === "quality_download_audio"
                      ? "Downloading audio"
                      : "Preparing video"}
                  </span>
                  <span className="tabular-nums">{Math.round(qualityGlobal.percent)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-linear"
                    style={{ width: `${qualityGlobal.percent}%`, background: "linear-gradient(90deg, #7c3cff 0%, #c935ff 60%, #ff2e92 100%)" }}
                  />
                </div>
              </div>
            )}

            <ul className="mt-3 space-y-2">
              {rows.map((r, i) => {
                const label = exportClipNames[i] ?? `Clip ${i + 1}`;
                const canCancel = total > 1 && !isSettled(r.state) && r.state !== "cancelling";
                return (
                  <li key={i} className="flex items-center gap-2 min-w-0">
                    <span className="w-24 min-w-0 shrink-0 truncate text-xs text-zinc-300" title={label}>
                      {label}
                    </span>
                    <div className="flex-1 min-w-0 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ease-linear ${
                          r.state === "running" && r.percent === 0 ? "animate-pulse" : ""
                        }`}
                        style={barStyle(r)}
                      />
                    </div>
                    <span
                      className={`w-24 shrink-0 text-right text-xs tabular-nums ${
                        r.state === "done" ? "text-emerald-400" : r.state === "failed" ? "text-red-400" : "text-zinc-400"
                      }`}
                    >
                      {statusText(r)}
                    </span>
                    {total > 1 && (
                      <button
                        type="button"
                        onClick={() => cancelExport(i)}
                        disabled={!canCancel}
                        className={`shrink-0 p-0.5 rounded transition ${
                          canCancel ? "text-zinc-500 hover:text-white hover:bg-zinc-800" : "invisible"
                        }`}
                        aria-label={`Cancel ${label}`}
                        title={`Cancel ${label}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            <p className="mt-3 text-xs text-zinc-500">Keep Klipprr open until the export finishes.</p>
          </div>
        );
      })()}

      <div className="space-y-1 relative group">
        <label className="text-xs text-zinc-500 dark:text-gray-400">Export folder</label>

        <div
          className={`flex gap-2 items-center rounded border min-w-0 max-w-full
            ${canEditExportPath
              ? "bg-zinc-800 border-zinc-700"
              : "bg-zinc-900 border-zinc-800"
            }`}
        >
          <span
            className={`flex-1 min-w-0 max-w-[14rem] py-1 px-2 text-xs font-mono block overflow-hidden text-ellipsis whitespace-nowrap
              ${canEditExportPath ? "text-zinc-300" : "text-zinc-600"}
            `}
            title={displayPath}
          >
            {truncatePathEnd(displayPath)}
          </span>
          {canEditExportPath && isTauri ? (
            <button
              type="button"
              onClick={chooseExportFolder}
              className="shrink-0 py-1 px-2 rounded text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition"
            >
              Browse
            </button>
          ) : !canEditExportPath ? (
            <button
              type="button"
              onClick={() => onUpgradeRequested?.("custom_export_path")}
              className="shrink-0 py-1 px-2 rounded text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition"
            >
              Pro
            </button>
          ) : null}
        </div>
      </div>

      {!isExporting && (
        <>
          <button
            disabled={selectedClipIds.length === 0}
            onClick={() => doExport(true)}
            className="btn-brand-green w-full py-2.5 rounded font-semibold text-white flex items-center justify-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export selected {selectedClipIds.length > 0 && `(${selectedClipIds.length})`}
          </button>

          <button
            disabled={clips.length === 0}
            onClick={() => doExport(false)}
            className="btn-brand w-full py-2.5 rounded flex items-center justify-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export all {clips.length > 0 && `(${clips.length})`}
          </button>
        </>
      )}
    </div>
  );
}