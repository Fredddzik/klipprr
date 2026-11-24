"use client";
import { track, describeLink, scrubText, sendErrorReport, ANALYTICS_AVAILABLE } from "@/lib/analytics";
import type { DefaultExportFormat } from "./SettingsModal";

import { useEffect, useState, useRef } from "react";
import { downloadAll, cancelExport as cancelExportRequest, type AgentResult } from "../lib/clipagent";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { offerSupportAfter, contactSupport } from "@/lib/support";

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

  exportCodec: DefaultExportFormat;
  setExportCodec: (v: DefaultExportFormat) => void;
  /** Estimated size of the full-video download, 0 when unknown. */
  fullVideoBytes: number;

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
  /** The access token the agent charges the export to. */
  getAccessToken?: () => Promise<string | null>;
  /** The agent refused to start: not signed in, or the monthly limit is used up. */
  onQuotaRefused?: (reason: "sign_in" | "limit") => void;
  /** An export ended; usage changed. */
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

/** One choice out of a few, like macOS segmented controls. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; locked?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[13px] transition-colors ${
              on ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {o.label}
            {o.locked && <span className="rounded bg-zinc-800 px-1 text-[10px] text-zinc-400">Pro</span>}
          </button>
        );
      })}
    </div>
  );
}

const SELECT =
  "w-full appearance-none rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 text-[13px] pl-3 pr-8 py-2 hover:border-zinc-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 outline-none cursor-pointer transition-colors";
const CHEVRON = (
  <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /></svg>
);
function fmtBytes(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(n / 1e6))} MB`;
}
const FIELD_LABEL = "block text-xs text-zinc-500 mb-1.5";
const HINT = "text-xs text-zinc-500 leading-relaxed mt-1.5";

export default function ExportPanel({
  clips,
  selectedClipIds,
  videoUrl,
  resolvedUrl,
  localFilePath,
  videoData,
  exportHQ,
  canUseQualityMode,
  exportCodec,
  setExportCodec,
  fullVideoBytes,
  keepWholeVideo,
  setKeepWholeVideo,
  fastCap,
  setFastCap,
  fastMax,
  trueMax,
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
  getAccessToken,
  onQuotaRefused,
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
  /** When the running export started and what it was, for the export_finished event. */
  const exportTrackRef = useRef<{ startedAt: number; props: Record<string, unknown> } | null>(null);
  const [exportClipNames, setExportClipNames] = useState<string[]>([]);
  /** Export the clips as video, or as audio only (FR-5: sound effects, quotes, podcast cuts). */
  const [exportKind, setExportKind] = useState<"video" | "audio">("video");
  const [audioFormat, setAudioFormat] = useState<"mp3" | "wav">("mp3");
  const isAudio = exportKind === "audio";
  /** Why each failed clip failed, and what this export was, for a support email. Refs,
   *  because the event listeners below are registered once and would see stale props. */
  const failReasonsRef = useRef<Record<number, string>>({});
  const exportMetaRef = useRef<string>("");
  /** The clips this export was started with, so the failed ones can be retried. */
  const exportClipsRef = useRef<Clip[]>([]);
  /** Shown after an export in which some clips failed: retry them, or email us. */
  const [retryOffer, setRetryOffer] = useState<{
    clips: Clip[];
    names: string[];
    total: number;
    okCount: number;
    context: string;
    /** What "Send error report" sends: the link, the settings and the errors. */
    report: Record<string, unknown> | null;
  } | null>(null);
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  // The offer belongs to the video it was exported from; a retry must not cut a new one.
  useEffect(() => {
    setRetryOffer(null);
  }, [videoUrl, resolvedUrl, localFilePath]);

  /** What support needs to look into a failed export. */
  function exportSupportContext(problem: string): string {
    const rowsNow = rowsRef.current;
    const failed = Object.entries(failReasonsRef.current).map(([i, r]) => `  clip ${Number(i) + 1}: ${r}`);
    return [
      `Export problem: ${problem}`,
      exportMetaRef.current,
      `Clips: ${rowsNow.length}, exported ${exportOkCountRef.current}, failed ${failed.length}`,
      ...(failed.length ? ["Failures:", ...failed] : []),
    ].join("\n");
  }

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

  function clearExportingUI() {
    exportInProgressRef.current = false;
    setIsExporting(false);
    setRowsNow([]);
    setQualityGlobal(null);
    setExportClipNames([]);
    exportClientIdRef.current = null;
    failReasonsRef.current = {};
    exportOkCountRef.current = 0;
    exportDirRef.current = "";
    exportHadWatermarkRef.current = false;
    exportTotalDurationRef.current = 0;
  }

  function finishExport() {
    const okCount = exportOkCountRef.current;
    const exportDir = exportDirRef.current;
    const total = rowsRef.current.length;
    const failedCount = Object.keys(failReasonsRef.current).length;
    const allCancelled = total > 0 && rowsRef.current.every((r) => r.state === "cancelled");
    const hadWatermark = exportHadWatermarkRef.current;
    const totalDuration = exportTotalDurationRef.current;
    const context = failedCount > 0 ? exportSupportContext(okCount > 0 ? "some clips failed" : "all clips failed") : "";
    const failedIdx = Object.keys(failReasonsRef.current)
      .map(Number)
      .filter((i) => !!exportClipsRef.current[i])
      .sort((a, b) => a - b);
    const failedClips = failedIdx.map((i) => exportClipsRef.current[i]);
    const failedNames = failedIdx.map((i) => exportClipsRef.current[i].name?.trim() || `Clip ${i + 1}`);
    const started = exportTrackRef.current;
    exportTrackRef.current = null;
    if (started) {
      track("export_finished", {
        ...started.props,
        export_ms: Math.round(performance.now() - started.startedAt),
        ok_count: okCount,
        failed_count: failedCount,
        cancelled: allCancelled,
        fail_reasons: Object.values(failReasonsRef.current).slice(0, 3).map((r) => scrubText(String(r))),
      });
    }
    onExportReservationComplete?.();
    clearExportingUI();
    // Failed clips stay on screen with a Retry button instead of a dialog: the agent has
    // already retried them, so a failure here is usually a platform refusing for a while.
    if (failedClips.length > 0) {
      setReportState("idle");
      setRetryOffer({
        clips: failedClips,
        names: failedNames,
        total,
        okCount,
        context,
        report: started
          ? {
              ...started.props,
              ok_count: okCount,
              failed_count: failedCount,
              fail_reasons: failedIdx.map((i) => scrubText(String(failReasonsRef.current[i] ?? "failed"))).slice(0, 5),
            }
          : null,
      });
    }
    if (okCount > 0) {
      if (onExportComplete && exportDir) onExportComplete(okCount, exportDir, hadWatermark, totalDuration);
    } else if (!allCancelled) {
      onExportFailed?.("all_clips_failed");
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
      }
    );

    const unlistenFailed = listen<{ clipIndex?: number; client_export_id?: string }>("export-clip-failed", (event) => {
      const p = event.payload;
      if (isStale(p?.client_export_id) || typeof p?.clipIndex !== "number") return;
      failReasonsRef.current = { ...failReasonsRef.current, [p.clipIndex]: (p as { reason?: string }).reason ?? "failed" };
      updateRow(p.clipIndex, () => ({ state: "failed" }));
    });

    const unlistenCancelled = listen<{ clipIndex?: number; client_export_id?: string }>(
      "export-clip-cancelled",
      (event) => {
        const p = event.payload;
        if (isStale(p?.client_export_id) || typeof p?.clipIndex !== "number") return;
        updateRow(p.clipIndex, () => ({ state: "cancelled" }));
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
      const context = exportSupportContext(code);
      onExportReservationComplete?.();
      clearExportingUI();
      onExportFailed?.(code.toLowerCase().replace(/\s+/g, "_").slice(0, 64));
      offerSupportAfter(`Export failed (${code}). No clips were exported.`, "Export failed", context);
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
  async function doExport(selectedOnly: boolean, retryClips?: Clip[]) {
    const chosen = retryClips
      ? retryClips
      : selectedOnly
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

    setRetryOffer(null);
    exportClipsRef.current = chosen;
    exportInProgressRef.current = true;
    exportClientIdRef.current = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    exportOkCountRef.current = 0;
    exportDirRef.current = "";
    setQualityGlobal(null);
    setRowsNow(chosen.map(() => ({ state: "waiting", percent: 0 })));
    setExportClipNames(chosen.map((c, i) => (c?.name && c.name.trim()) || `Clip ${i + 1}`));
    setIsExporting(true);

    exportHadWatermarkRef.current = Boolean(hasWatermark);
    exportTotalDurationRef.current = chosen.reduce((sum, c) => sum + Math.max(0, c.end - c.start), 0);

    const exportUrl = resolvedUrl && resolvedUrl.trim().length > 0 ? resolvedUrl : videoUrl.trim();
    const link = localFilePath ? null : describeLink(exportUrl);
    const exportProps = {
      source: localFilePath ? "local" : link?.source,
      url: link?.url ?? null,
      clip_count: chosen.length,
      clips_total_s: Math.round(exportTotalDurationRef.current),
      kind: exportKind,
      codec: isAudio ? audioFormat : exportCodec,
      max_height: localFilePath ? null : hasWatermark ? Math.min(720, fastCap ?? 720) : fastCap,
      keep_full: !localFilePath && !isAudio && canUseQualityMode && keepWholeVideo,
      has_watermark: Boolean(hasWatermark),
    };
    exportTrackRef.current = { startedAt: performance.now(), props: exportProps };
    track("export_started", exportProps);
    failReasonsRef.current = {};
    exportMetaRef.current = [
      `Source: ${localFilePath ? "a local file" : exportUrl}`,
      `Mode: ${localFilePath ? "local file" : isAudio ? "audio only" : "exact cut"}, codec ${isAudio ? audioFormat : exportCodec}` +
        `${hasWatermark ? ", free plan (watermark)" : ""}`,
    ].join("\n");

    const result = await downloadAll({
      access_token: getAccessToken ? await getAccessToken() : null,
      client_export_id: exportClientIdRef.current,
      source_title: (videoData as any)?.title ? String((videoData as any).title) : null,
      quality_reencode_h264: undefined,
      // Use the resolved URL that produced the current preview, not whatever is currently typed.
      url: localFilePath ? "" : exportUrl,
      local_path: localFilePath ?? undefined,
      clips: chosen,
      // Always the per-clip path: it cuts on the exact frame. The full video is downloaded
      // after the clips when keep_full is set (download.rs).
      mode: "speed",
      // Free exports are capped at 720p max (enforced client + backend).
      fast_max_height: localFilePath
        ? null
        : hasWatermark
        ? Math.min(720, fastCap ?? 720)
        : fastCap,
      keep_full: !localFilePath && !isAudio && canUseQualityMode && keepWholeVideo,
      preview_url: videoData?.preview?.url ?? null,
      video_id: videoData?.id ?? null,
      export_path: sanitizeExportPath(exportPath),
      has_watermark: Boolean(hasWatermark),
      codec: isAudio ? audioFormat : exportCodec,
    });

    // The agent answers as soon as the export has started, so a failure here means it
    // never started (the agent is unreachable); everything after this comes by event.
    if (!result.ok && exportInProgressRef.current) {
      track("export_not_started", { ...exportProps, error: scrubText(String(result.error ?? result.status ?? "unknown")) });
      exportTrackRef.current = null;
      onExportReservationComplete?.();
      clearExportingUI();
      // Refused by the agent's quota check (quota.rs): nothing was charged.
      if (result.status === 401 || result.status === 402) {
        onQuotaRefused?.(result.status === 401 ? "sign_in" : "limit");
        return;
      }
      if (result.error === "quota_unavailable") {
        alert("Couldn't check your monthly clip limit. Check your internet connection and try again.");
        return;
      }
      onExportFailed?.(String(result.error ?? "unknown_error").toLowerCase().replace(/\s+/g, "_").slice(0, 64));
      offerSupportAfter(
        "Export could not start: " + result.error,
        "Export could not start",
        `Export problem: could not start (${result.error})\n${exportMetaRef.current}`
      );
    }
  }

  return (
    <div className="space-y-5">
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
            className="shrink-0 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs transition-colors"
          >
            Upgrade
          </button>
        </div>
      )}

      {/* LOW-CLIP NUDGE — shown when ≤ 3 clips remain this month (used 7+) */}
      {hasWatermark && !isExporting && typeof clipsRemaining === "number" && clipsRemaining <= 3 && clipsRemaining > 0 && (
        <div className="rounded-md border border-zinc-700 bg-zinc-900 flex items-center gap-3 px-3 py-2.5">
          <p className="flex-1 text-xs text-zinc-300 min-w-0 leading-relaxed">
            {clipsRemaining === 1
              ? <>Only <span className="font-semibold">1 clip</span> left this month</>
              : <><span className="font-semibold">{clipsRemaining} clips</span> left this month</>
            }
          </p>
          <button
            type="button"
            onClick={() => onUpgradeRequested?.("clip_limit")}
            className="shrink-0 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs transition-colors"
          >
            Upgrade
          </button>
        </div>
      )}

      {/* CAPABILITIES */}
      {!localFilePath && trueMax > 0 && (
        <p className="text-xs text-zinc-400 leading-relaxed">
          This video is available up to <span className="text-zinc-100">{fmtRes(hasWatermark ? Math.min(trueMax, 720) : trueMax)}</span>
          {hasWatermark && trueMax > 720 ? <> on your plan ({fmtRes(trueMax)} with Pro)</> : null}.
        </p>
      )}

      {/* EXPORT AS */}
      <div>
        <span className={FIELD_LABEL}>Export as</span>
        <Segmented
          label="Export as"
          value={exportKind}
          onChange={setExportKind}
          options={[
            { value: "video", label: "Video" },
            { value: "audio", label: "Audio only" },
          ]}
        />
      </div>

      {isAudio && (
        <div>
          <span className={FIELD_LABEL}>Audio format</span>
          <Segmented
            label="Audio format"
            value={audioFormat}
            onChange={setAudioFormat}
            options={[
              { value: "mp3", label: "MP3" },
              { value: "wav", label: "WAV" },
            ]}
          />
          <p className={HINT}>
            {audioFormat === "mp3"
              ? "MP3, 320 kbps: small files for sharing, voice and podcast cuts."
              : "WAV, 48 kHz / 24-bit: lossless, best for sound effects going into an editor."}
          </p>
        </div>
      )}

      {!isAudio && !localFilePath && trueMax > 0 && (
        <div>
          <label className={FIELD_LABEL} htmlFor="export-resolution">Resolution</label>
          <div className="relative">
          <select
            id="export-resolution"
            value={fastCap ?? "auto"}
            onChange={(e) =>
              setFastCap(e.target.value === "auto" ? null : Number(e.target.value))
            }
            className={SELECT}
          >
            <option value="auto">
              Best available ({fmtRes(hasWatermark ? Math.min(trueMax, 720) : trueMax)})
            </option>
          {[4320, 2160, 1440, 1080, 720, 480, 360]
            .filter((h) => h <= (hasWatermark ? Math.min(trueMax, 720) : trueMax))
            .map((h) => (
              <option key={h} value={h}>
                {h}p
              </option>
            ))}
          </select>
          {CHEVRON}
          </div>
        </div>
      )}

      {!isAudio && (
        <div>
          <label className={FIELD_LABEL} htmlFor="export-format">Format</label>
          <div className="relative">
            <select
              id="export-format"
              value={exportCodec}
              onChange={(e) => setExportCodec(e.target.value as DefaultExportFormat)}
              className={SELECT}
            >
              <option value="universal">MP4 · H.264</option>
              <option value="hevc">MP4 · HEVC (H.265)</option>
              <option value="prores">MOV · ProRes 422</option>
            </select>
            {CHEVRON}
          </div>
          <p className={HINT}>
            {exportCodec === "hevc"
              ? "About half the file size of H.264 at the same quality. Plays on Macs, iPhones and in Premiere; some older Windows PCs need an extra codec."
              : exportCodec === "prores"
              ? "For editing: scrubs smoothly in Premiere, Resolve and Final Cut. Very large files, about 3 GB per minute at 4K."
              : "Plays everywhere. The safe choice for posting and sharing."}
          </p>
        </div>
      )}

      {!isAudio && !localFilePath && (
        <div>
          <label className={`flex items-start gap-2.5 text-[13px] ${canUseQualityMode ? "text-zinc-200 cursor-pointer" : "text-zinc-500"}`}>
            <input
              type="checkbox"
              className="mt-0.5 accent-violet-500"
              checked={canUseQualityMode && keepWholeVideo}
              onChange={() => {
                if (!canUseQualityMode) {
                  onUpgradeRequested?.("quality_mode");
                  return;
                }
                setKeepWholeVideo(!keepWholeVideo);
              }}
            />
            <span>
              Also save the full video
              {!canUseQualityMode && <span className="ml-1.5 rounded bg-zinc-800 px-1 text-[10px] text-zinc-400">Pro</span>}
              {fullVideoBytes > 0 && <span className="ml-1.5 text-zinc-500">about {fmtBytes(fullVideoBytes)}</span>}
            </span>
          </label>
          {canUseQualityMode && keepWholeVideo && (
            <p className={HINT}>
              Saved in the best quality there is. If this Mac can&apos;t play that format (AV1 needs an M3 or
              newer), Klipprr converts it to H.264 afterwards, which adds time.
              {fullVideoBytes > 1_000_000_000 && (
                <span className="mt-1.5 block rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-amber-200">
                  This is a big download. Depending on your connection and your Mac it can take a long time. If you
                  only need parts of the video, mark them as clips and export just those.
                </span>
              )}
            </p>
          )}
        </div>
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
            {(qualityGlobal?.phase === "quality_full_video" || qualityGlobal?.phase === "quality_full_convert") && (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>{qualityGlobal.phase === "quality_full_convert" ? "Converting the full video for this Mac" : "Saving the full video"}</span>
                  <span className="tabular-nums">{Math.round(qualityGlobal.percent)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-violet-500 transition-[width] duration-300 ease-linear" style={{ width: `${qualityGlobal.percent}%` }} />
                </div>
              </div>
            )}

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
                    className="h-full transition-[width] duration-300 ease-linear"
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
                        className={`h-full transition-[width] duration-300 ease-linear ${
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

      <div className="relative group">
        <span className={FIELD_LABEL}>Export folder</span>

        <div
          className="flex gap-2 items-center rounded-md border border-zinc-800 bg-zinc-950 p-1 pl-0 min-w-0 max-w-full"
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
              className="shrink-0 py-1 px-2.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
            >
              Change
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

      {!isExporting && retryOffer && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <p className="flex-1 min-w-0 text-sm text-zinc-200">
              {retryOffer.okCount > 0
                ? `${retryOffer.clips.length} of ${retryOffer.total} clips failed. The others were saved.`
                : retryOffer.clips.length === 1
                ? "The clip failed to export."
                : "No clips were exported."}
              <span className="block text-xs text-zinc-500 truncate" title={retryOffer.names.join(", ")}>
                {retryOffer.names.join(", ")}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setRetryOffer(null)}
              className="shrink-0 p-0.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
              aria-label="Dismiss"
              title="Dismiss"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => doExport(false, retryOffer.clips)}
              className="flex-1 py-1.5 rounded text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-white transition"
            >
              {retryOffer.clips.length === 1 ? "Retry" : `Retry ${retryOffer.clips.length} clips`}
            </button>
            <button
              type="button"
              onClick={() => void contactSupport("Some clips failed to export", retryOffer.context)}
              className="py-1.5 px-3 rounded text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
            >
              Email us
            </button>
          </div>
          {ANALYTICS_AVAILABLE && retryOffer.report && (
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                disabled={reportState === "sending" || reportState === "sent"}
                onClick={async () => {
                  setReportState("sending");
                  const ok = await sendErrorReport(retryOffer.report ?? {});
                  setReportState(ok ? "sent" : "failed");
                }}
                className="shrink-0 py-1 px-2 rounded text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-60 disabled:hover:bg-transparent transition"
              >
                {reportState === "sent" ? "Report sent, thank you" : reportState === "sending" ? "Sending…" : "Send error report"}
              </button>
              <span className="text-zinc-500">
                {reportState === "failed"
                  ? "Could not send. Check your connection."
                  : localFilePath
                  ? "Sends the error and export settings, never the file name."
                  : "Sends this video's link and the error. Nothing else."}
              </span>
            </div>
          )}
        </div>
      )}

      {!isExporting && (
        <>
          {selectedClipIds.length > 0 && (
            <button
              onClick={() => doExport(true)}
              className="w-full py-2 rounded-md text-[13px] font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 flex items-center justify-center gap-2 transition-colors"
            >
              Export selected ({selectedClipIds.length})
            </button>
          )}

          <button
            disabled={clips.length === 0}
            onClick={() => doExport(false)}
            className="btn-brand w-full py-2.5 rounded flex items-center justify-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            {clips.length === 1 ? "Export 1 clip" : `Export ${clips.length} clips`}
          </button>
        </>
      )}
    </div>
  );
}