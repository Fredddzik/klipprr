"use client";

import { downloadAll, type AgentResult } from "../lib/clipagent";

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
  videoData: VideoData | null;

  exportHQ: boolean;
  setExportHQ: (v: boolean) => void;

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

  sanitizeExportPath: (input: string) => string | null;

  canEditExportPath: boolean;

  onUpgradeRequested?: () => void;

  onBeforeExport?: () => Promise<boolean>;
}

function fmtRes(h: number) {
  return h > 0 ? `${h}p` : "—";
}

export default function ExportPanel({
  clips,
  selectedClipIds,
  videoUrl,
  videoData,
  exportHQ,
  setExportHQ,
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
  sanitizeExportPath,
  canEditExportPath,
  onUpgradeRequested,
  onBeforeExport,
}: ExportPanelProps) {
  async function doExport(selectedOnly: boolean) {
    const chosen = selectedOnly
      ? clips.filter((c) => selectedClipIds.includes(c.id))
      : clips;

    if (chosen.length === 0) return;

    if (!videoData) {
      alert("Video data not available.");
      return;
    }

    if (shouldWarnQuality) {
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
      url: videoUrl.trim(),
      clips: chosen,
      mode: exportHQ ? "quality" : "speed",
      fast_max_height: exportHQ ? null : fastCap,
      keep_full: keepWholeVideo,
      preview_url: videoData?.preview?.url ?? null,
      video_id: videoData?.id ?? null,
      export_path: sanitizeExportPath(exportPath),
      has_watermark: !canEditExportPath,
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
      <p className="text-xs text-gray-400">
        Files will save to:
        <br />
        <span className="text-white font-mono">~/Downloads/ClipTool</span>
      </p>

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

        <input
          type="text"
          value={exportPath}
          disabled={!canEditExportPath}
          onChange={(e) => canEditExportPath && setExportPath(e.target.value)}
          className={`w-full rounded px-2 py-1 text-sm font-mono
            ${canEditExportPath
              ? "bg-gray-800 border border-gray-700"
              : "bg-gray-900 border border-gray-800 text-gray-500 cursor-not-allowed"
            }`}
        />

        {!canEditExportPath && (
          <button
            type="button"
            onClick={() => onUpgradeRequested?.()}
            className="absolute inset-0 hidden group-hover:flex
              items-center justify-center bg-black/40 rounded
              text-sm cursor-pointer"
          >
            🔒 Pro feature
          </button>
        )}
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