"use client";

import { downloadAll, type AgentResult } from "../lib/clipagent";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";

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
}: ExportPanelProps) {
  const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI__;
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

    setIsExporting(true);

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

    setIsExporting(false);

    if (!result.ok) {
      alert("Export failed: " + result.error);
      return;
    }

    alert(selectedOnly ? "Export successful!" : "All clips exported!");
  }

  return (
    <div className="bg-gray-900 p-4 rounded border border-gray-700 space-y-4">
      {/* CAPABILITIES */}
      <div className="text-xs text-gray-300/80 space-y-1">
        <div>
          Fast max: <span className="text-white">{fmtRes(fastMax)}</span>{" "}
          • Max possible: <span className="text-white">{fmtRes(trueMax)}</span>
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
          <span className={!exportHQ ? "text-white" : "text-gray-400"}>
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

          <span className={exportHQ ? "text-white" : "text-gray-400"}>
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
            className={`flex-1 py-1 rounded text-sm ${
              exportCodec === "universal"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 border border-gray-700"
            }`}
          >
            MP4 – Universal
          </button>

          <button
            type="button"
            onClick={() => setExportCodec("original")}
            className={`flex-1 py-1 rounded text-sm ${
              exportCodec === "original"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 border border-gray-700"
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
        <select
          value={fastCap ?? "auto"}
          onChange={(e) =>
            setFastCap(e.target.value === "auto" ? null : Number(e.target.value))
          }
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
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

      <div className="space-y-1 relative group">
        <label className="text-xs text-gray-400">Export folder</label>

        <div
          className={`flex gap-2 items-center rounded border min-w-0 max-w-full
            ${canEditExportPath
              ? "bg-gray-800 border-gray-700"
              : "bg-gray-900 border-gray-800"
            }`}
        >
          <span
            className={`flex-1 min-w-0 max-w-[14rem] py-1 px-2 text-sm font-mono block overflow-hidden text-ellipsis whitespace-nowrap
              ${canEditExportPath ? "text-white" : "text-gray-500"}
            `}
            title={displayPath}
          >
            {truncatePathEnd(displayPath)}
          </span>
          {canEditExportPath && isTauri ? (
            <button
              type="button"
              onClick={chooseExportFolder}
              className="shrink-0 py-1 px-2 rounded text-sm bg-gray-700 hover:bg-gray-600 text-white"
            >
              Choose folder…
            </button>
          ) : !canEditExportPath ? (
            <button
              type="button"
              onClick={() => onUpgradeRequested?.()}
              className="shrink-0 py-1 px-2 rounded text-sm bg-gray-700 hover:bg-gray-600"
            >
              🔒 Pro
            </button>
          ) : null}
        </div>
      </div>

      <button
        disabled={selectedClipIds.length === 0 || isExporting}
        onClick={() => doExport(true)}
        className="w-full py-2 rounded font-semibold bg-yellow-500 text-black disabled:opacity-40"
      >
        Export selected
      </button>

      <button
        disabled={clips.length === 0 || isExporting}
        onClick={() => doExport(false)}
        className="w-full py-2 rounded font-semibold bg-green-600 disabled:opacity-40"
      >
        Export all
      </button>
    </div>
  );
}