 "use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

import {
  resolveVideo,
  downloadAll,
  type ResolvedVideo,
} from "@/lib/clipagent";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { tauriInvoke } from "@/lib/tauri";
import VideoViewport from "@/components/VideoViewport";
import Timeline from "@/components/Timeline";
import ClipsPanel from "@/components/ClipsPanel";
import ExportPanel from "@/components/ExportPanel";
import UpgradeModal from "@/components/UpgradeModal";
import type { Capabilities } from "@/lib/capabilities";

export default function HomePage() {
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [videoData, setVideoData] = useState<ResolvedVideo | null>(null);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [license, setLicense] = useState<{ plan: string; active: boolean } | null>(null);
  useEffect(() => {
    if (!session?.user?.id) return;

    supabase
      .from("licenses")
      .select("plan, active")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setLicense(data ?? null);
      });
  }, [session]);

useEffect(() => {
  const video = (window as any).__CLIPTOOL_VIDEO__ as HTMLVideoElement | null;
  if (!video) return;

  const syncTime = () => {
    setCurrentTime(video.currentTime);
  };

  const onLoadedMetadata = () => {
    if (pendingSeekRef.current != null) {
      video.currentTime = pendingSeekRef.current;
      pendingSeekRef.current = null;
    }
    setCurrentTime(video.currentTime);
  };

  video.addEventListener("timeupdate", syncTime);
  video.addEventListener("seeked", syncTime);
  video.addEventListener("loadedmetadata", onLoadedMetadata);

  return () => {
    video.removeEventListener("timeupdate", syncTime);
    video.removeEventListener("seeked", syncTime);
    video.removeEventListener("loadedmetadata", onLoadedMetadata);
  };
}, [videoData?.id]);

  const [clips, setClips] = useState<{ id: string; start: number; end: number; name: string }[]>([]);
  // --- Rename batching state ---
  const [renameDraft, setRenameDraft] = useState<Record<string, string>>({});
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [prevVideoId, setPrevVideoId] = useState<string | null>(null);
  const [exportHQ, setExportHQ] = useState(false);
  const [keepWholeVideo, setKeepWholeVideo] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  // Remove resolveRequestId state, use ref instead for request tracking
  const resolveReqRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  const [showAdvancedExport, setShowAdvancedExport] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    clipId: string;
    field: "in" | "out";
  } | null>(null);
  // Fast resolution picker state
  const [fastCap, setFastCap] = useState<number | null>(null); // null = Auto
  const [exportPath, setExportPath] = useState("");
  const {
    undo,
    redo,
    pushHistory,
    undoToast,
    showUndoToast,
    history,
    future,
  } = useUndoRedo({
    clips,
    markIn,
    markOut,
    setClips,
    setMarkIn,
    setMarkOut,
    setSelectedClipIds,
    setEditTarget,
  });

  useKeyboardShortcuts({
    videoRef: () => document.querySelector("video"),
    clips,
    markIn,
    setMarkIn,
    setMarkOut,
    setClips,
    editTarget,
    setEditTarget,
    pushHistory,
    undo,
    redo,
    showUndoToast,
  }); 

async function fetchCapabilitiesHttp(): Promise<Capabilities | null> {
  try {
    const res = await fetch("http://localhost:4000/capabilities", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;

    // Accept both snake_case (backend) and camelCase (frontend) just in case
    const normalized: Capabilities = {
      canRenameClips: Boolean(json.canRenameClips ?? json.can_rename_clips),
      canEditClipRange: Boolean(json.canEditClipRange ?? json.can_edit_clip_range),
      canSetCustomExportPath: Boolean(
        json.canSetCustomExportPath ?? json.can_set_custom_export_path
      ),
      hasWatermark: Boolean(json.hasWatermark ?? json.has_watermark),
    };

    return normalized;
  } catch {
    return null;
  }
}

async function refreshCapabilities() {
  // 1) Prefer Tauri (when running inside the desktop app)
  try {
    const backendCaps = await tauriInvoke<Capabilities>("get_capabilities");
    if (backendCaps) {
      setCaps(backendCaps);
      return;
    }
  } catch {
    // ignore
  }

  // 2) Fallback to local HTTP agent (works even when Tauri invoke is stale/broken)
  const httpCaps = await fetchCapabilitiesHttp();
  if (httpCaps) setCaps(httpCaps);
}

  // Load video metadata from ClipAgent
  async function loadVideo() {
    // Normalize YouTube URLs / IDs for best UX
    function normalizeYouTubeUrl(input: string): string | null {
      input = input.trim();

      // If it's already a full URL
      if (input.startsWith("http://") || input.startsWith("https://")) {
        try {
          return new URL(input).toString();
        } catch {
          return null;
        }
      }

      // If user pasted a youtu.be short link without protocol
      if (input.startsWith("youtu.be/")) {
        return "https://" + input;
      }

      // If user pasted only the ID (most common case)
      const ytIdPattern = /^[a-zA-Z0-9_-]{11}$/;
      if (ytIdPattern.test(input)) {
        return `https://www.youtube.com/watch?v=${input}`;
      }

      // If they pasted something like youtube.com/... without protocol
      if (input.startsWith("youtube.com/") || input.startsWith("www.youtube.com/")) {
        return "https://" + input;
      }

      return null;
    }

    if (!videoUrl.trim()) {
      alert("Paste a YouTube URL first.");
      return;
    }

    const normalized = normalizeYouTubeUrl(videoUrl);
    if (!normalized) {
      alert("Please enter a valid YouTube link or video ID.");
      return;
    }

    setLoading(true);
    setShowAdvancedExport(false);
    setResolveError(null);
    setFastCap(null);
    setEditTarget(null);

    try {
      const reqId = ++resolveReqRef.current;

      const res = await resolveVideo(normalized);

      // Ignore stale responses
      if (reqId !== resolveReqRef.current) return;
      if (!res.ok) {
        const msg = res.error || "unknown_error";

        // Treat fetch / connectivity failures as Agent issues
        const lower = msg.toLowerCase();
const looksProtected =
  lower.includes("drm") ||
  lower.includes("widevine") ||
  lower.includes("protected") ||
  lower.includes("license") ||
  lower.includes("m3u8") ||
  lower.includes("403") ||
  lower.includes("forbidden") ||
  lower.includes("unauthorized");


        setVideoData(null);
        setResolveError(
          looksProtected
            ? "This platform appears to use protected/DRM streams (e.g., UFC Fight Pass, Netflix). Direct downloading/clipping won’t work. Use Screen Capture mode instead."
            : `Could not resolve this video. (${msg})`
        );
      } else {
        setResolveError(null);
        setVideoData(res.data);
      }
    } catch (err) {
      console.error(err);
      alert("Could not reach ClipAgent.");
    }

    setLoading(false);
  }

useEffect(() => {
  // Pick up session after magic-link redirect
  supabase.auth.getSession().then(({ data }) => {
    setSession(data.session);
  });

  // Listen for future auth changes
  const { data: listener } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      setSession(session);
    }
  );

  return () => {
    listener.subscription.unsubscribe();
  };
}, []);


  // --- License enforcement (Supabase → local ClipAgent) ---
  // Extracted license sync logic
async function syncLicenseFromSupabase() {
  console.log("[License][SYNC] invoked");

  const {
    data: { session: currentSession },
    error: sessionError,
  } = await supabase.auth.getSession();

  console.log("[License][SYNC] current session:", currentSession);

  // 🔒 Logout = revoke
  if (!currentSession?.user) {
    console.log("[License][SYNC] No Supabase session → clearing local license");

    if ((window as any).__TAURI__) {
      await tauriInvoke("clear_license_cmd");
    }

    setCaps({
      canRenameClips: false,
      canEditClipRange: false,
      canSetCustomExportPath: false,
      hasWatermark: true,
    });

    return;
  }

  console.log(
    "[License][SYNC] About to query Supabase for user:",
    currentSession.user.id
  );

  try {
    console.log("[License][SYNC] Checking Supabase license…");

    await supabase.auth.refreshSession();

    const { data, error } = await supabase
      .from("licenses")
      .select("plan, active", { count: "exact" })
      .eq("user_id", currentSession.user.id)
      .maybeSingle();

    console.log("[License][SYNC] RAW data:", JSON.stringify(data));
    console.log("[License][SYNC] RAW error:", error);
    console.log("[License][SYNC] currentSession.user.id:", currentSession.user.id);

    console.log("[License][SYNC] Supabase result:", data);

    if (error) {
      console.error("[License][SYNC] Supabase error:", error);
      return;
    }

    // 🔒 NEGATIVE CASE — no active license → CLEAR
    if (!data || data.active !== true) {
      console.log("[License][SYNC] No active license → clearing local license");

      // Only call native if available
      if ((window as any).__TAURI__) {
        await tauriInvoke("clear_license_cmd");
      }

      setCaps({
        canRenameClips: false,
        canEditClipRange: false,
        canSetCustomExportPath: false,
        hasWatermark: true,
      });

      return;
    }
    // 🔓 POSITIVE CASE — active license → INSTALL / REFRESH
    console.log("[License][SYNC] Active license found → installing");

    const caps = await tauriInvoke<Capabilities>("get_capabilities");
    if (caps) {
      setCaps(caps);
    }
  } catch (err) {
    console.error("[License][SYNC] Failed:", err);
  }
}

  useEffect(() => {
  console.log("[License][SYNC] startup enforcement");
  syncLicenseFromSupabase();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


  useEffect(() => {
    if (!videoData) return;

    // First load: just remember the video
    if (!prevVideoId) {
      setPrevVideoId(videoData.id);
      return;
    }

    // New video loaded → hard reset all timeline state
    if (videoData.id !== prevVideoId) {
      setClips([]);
      setSelectedClipIds([]);
      setMarkIn(null);
      setMarkOut(null);
      setEditTarget(null);
      setCurrentTime(0);
      pendingSeekRef.current = 0;

      const vid = document.querySelector("video") as HTMLVideoElement | null;
      if (vid) vid.currentTime = 0;

      setPrevVideoId(videoData.id);
      return;
    }

    // Same video, keep ID in sync
    setPrevVideoId(videoData.id);
  }, [videoData?.id]);

  // Capabilities helpers (computed from videoData, after it's set)
  const videoCaps = videoData?.capabilities;
  const fastMax = videoCaps?.fastMaxHeight ?? 0;
  const trueMax = videoCaps?.trueMaxHeight ?? 0;
  const needsReencode = videoCaps?.trueMaxRequiresReencode ?? false;
  const fastReachesMax = fastMax > 0 && trueMax > 0 && fastMax === trueMax;

function fmtRes(h: number) {
  return h > 0 ? `${h}p` : "—";
}


  // --- Quality warning helper ---
  const shouldWarnQuality: boolean = Boolean(
  exportHQ &&
  videoData &&
  videoData.duration >= 45 * 60
);

  const [caps, setCaps] = useState<Capabilities>({
    canRenameClips: false,
    canEditClipRange: false,
    canSetCustomExportPath: false,
    hasWatermark: true,
  });

  useEffect(() => {
    (window as any).__DEBUG_CAPS__ = caps;
  }, [caps]);


  useEffect(() => {
    (async () => {
      await refreshCapabilities();
    })();
  }, []);

  useEffect(() => {
  async function onFocus() {
    console.log("[License][SYNC] focus enforcement");

    if (typeof window === "undefined" || !(window as any).__TAURI__) {
      return;
    }

    await syncLicenseFromSupabase();
    await refreshCapabilities();
  }

  window.addEventListener("focus", onFocus);
  return () => window.removeEventListener("focus", onFocus);
}, []);

  // Helper to format timestamps for UI: hides leading zero hours/minutes, no ms
  function formatTime(t: number) {
    if (!isFinite(t)) return "0:00";

    const totalSeconds = Math.max(0, t);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  // --- Play a clip from IN to OUT ---
  function playClip(start: number, end: number) {
    const video = (window as any).__CLIPTOOL_VIDEO__ as HTMLVideoElement | null;
    if (!video) return;

    const EPSILON = 0.03; // ~30ms safety margin

    video.currentTime = start;
    video.play();

    let rafId: number;

    const tick = () => {
      if (!video || video.paused) return;

      if (video.currentTime >= end - EPSILON) {
        video.pause();
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  }

  // Safety: auto-disable keepWholeVideo when switching back to Fast
  useEffect(() => {
    if (!exportHQ) {
      setKeepWholeVideo(false);
    }
  }, [exportHQ]);

useEffect(() => {
  setSelectedClipIds([]);
  setEditTarget(null);
}, [clips]);

  // --- Sanitize export path for macOS quoted path handling ---
  function sanitizeExportPath(input: string): string | null {
    if (!input) return null;

    let p = input.trim();

    // Strip surrounding single or double quotes (macOS Finder copy)
    if (
      (p.startsWith('"') && p.endsWith('"')) ||
      (p.startsWith("'") && p.endsWith("'"))
    ) {
      p = p.slice(1, -1).trim();
    }

    return p || null;
  }

  // Helper for locked features to open upgrade modal
  function openUpgrade() {
    if (license?.active) return;
    setShowUpgrade(true);
  }

  return (
  <div className="min-h-screen bg-black text-white p-6">
    <UpgradeModal
  open={showUpgrade}
  onClose={() => setShowUpgrade(false)}
  onUpgraded={async () => {
    await refreshCapabilities();
    setShowUpgrade(false);
  }}
/>
    {undoToast && (
      <div className="
        fixed bottom-6 left-1/2 -translate-x-1/2 z-50
        bg-black/80 border border-gray-700 px-4 py-2 rounded text-sm
        animate-toast
      ">
        {undoToast}
      </div>
    )}
    <h1 className="text-3xl font-bold mb-6 text-center">ClipTool</h1>

    {/* URL BAR */}
    <div className="max-w-5xl mx-auto flex gap-4 mb-6">
      <input
        type="text"
        placeholder="Paste YouTube URL…"
        defaultValue=""
        onChange={(e) => setVideoUrl(e.target.value)}
        className="flex-1 p-3 rounded bg-gray-900 border border-gray-700"
        suppressHydrationWarning
      />
      <button
        onClick={loadVideo}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded font-semibold"
      >
        <span className={`inline-flex items-center gap-2 ${loading ? "animate-pulse" : ""}`}>
          {loading && <span className="inline-block w-2 h-2 rounded-full bg-white animate-bounce" />}
          {loading ? "Loading…" : "Load"}
        </span>
      </button>
    </div>

    {resolveError && (
      <div className="max-w-5xl mx-auto mb-4 rounded border border-yellow-700 bg-yellow-900/20 p-4 text-sm text-yellow-200">
        <div className="font-semibold mb-1">Can’t load this video directly</div>
        <div className="opacity-90">{resolveError}</div>
        <div className="mt-2 text-xs text-yellow-200/80">
          Quick workaround: record your screen (OBS / macOS screen recording) while playing, then clip the local file.
        </div>
      </div>
    )}

    {/* MAIN WORKSPACE only when agent is not offline AND video loaded */}
    {videoData && (
      <div className="max-w-6xl mx-auto grid grid-cols-[2fr_1fr] gap-6 mt-6">
        {/* LEFT SIDE */}
        <div>
          {/* VIDEO PLAYER */}
          <h2 className="text-xl mb-2">{videoData.title}</h2>


          <VideoViewport
            src={videoData.previewUrl}
            videoKey={videoData.id}
          />

          <Timeline
            duration={videoData.duration}
            clips={clips}
            markIn={markIn}
            markOut={markOut}
            selectedClipIds={selectedClipIds}
            currentTime={currentTime}

            onSeek={(t) => {
	      setCurrentTime(t);
	      const video = (window as any).__CLIPTOOL_VIDEO__ as HTMLVideoElement | null;
	      if (!video) return;

	      if (video.readyState >= 1) {
	        video.currentTime = t;
	      } else {
 	        pendingSeekRef.current = t;
  	      }
	    }}

            onSelectClip={(id, multi) => {
              setSelectedClipIds((prev) => {
                if (multi) {
                  return prev.includes(id)
                    ? prev.filter((x) => x !== id)
                    : [...prev, id];
                }
                return [id];
              });
            }}
          />

          {/* MARK BUTTONS */}
          <div className="space-y-3 mt-6">
            {/* M BUTTON */}
            <button
              onClick={() => {
                const video = (window as any).__CLIPTOOL_VIDEO__ as HTMLVideoElement | null;
                if (!video) return;
                const t = video.currentTime;
                if (markIn === null && markOut === null) {
  pushHistory();
  setMarkIn(t);
} else if (markIn !== null && markOut === null) {
                  setMarkOut(t);
                  setClips((prev) => {
                    pushHistory();
                    const next = [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        start: markIn,
                        end: t,
                        name: `Clip ${prev.length + 1}`,
                      },
                    ];
                    return next.sort((a, b) => a.start - b.start);
                  });
                } else {
                  setMarkIn(t);
                  setMarkOut(null);
                }
              }}
              className={`px-6 py-2 rounded font-bold ${
  editTarget
    ? "bg-gray-700 cursor-not-allowed"
    : markIn === null && markOut === null
    ? "bg-green-600"
    : markIn !== null && markOut === null
    ? "bg-red-600"
    : "bg-green-600"
}`}
            >
              {editTarget
  ? `Editing ${editTarget.field.toUpperCase()}`
  : markIn === null && markOut === null
  ? "Mark IN (M)"
  : markIn !== null && markOut === null
  ? "Mark OUT (M)"
  : "Mark IN (M)"}
            </button>

		{editTarget && (
  <div className="flex gap-2 mt-2">
    <button
      onClick={() => {
        const video = (window as any).__CLIPTOOL_VIDEO__ as HTMLVideoElement | null;
        if (!video) return;
        const t = video.currentTime;
        setClips(prev => {
          pushHistory();
          return prev
            .map(c => {
              if (c.id !== editTarget.clipId) return c;
              let start = c.start;
              let end = c.end;
              if (editTarget.field === "in") start = t;
              else end = t;
              // Auto-swap if crossed
              if (end < start) {
                const tmp = start;
                start = end;
                end = tmp;
              }
              return { ...c, start, end };
            })
            .sort((a, b) => a.start - b.start);
        });
        setEditTarget(null);
      }}
      className="px-4 py-1 bg-green-600 rounded font-semibold hover:brightness-110"
    >
      Apply {editTarget.field.toUpperCase()} (Enter)
    </button>

    <button
      onClick={() => setEditTarget(null)}
      className="px-4 py-1 bg-gray-600 rounded hover:bg-gray-700"
    >
      Cancel (Esc)
    </button>
  </div>
)}

          </div>
        </div>

        {/* RIGHT SIDE — CLIP LIST + EXPORTS */}
        <div className="space-y-6">
          <ClipsPanel
            clips={clips}
            selectedClipIds={selectedClipIds}
            renameDraft={renameDraft}
            editTarget={editTarget}
            undo={undo}
            redo={redo}
            canUndo={history.length > 0}
            canRedo={future.length > 0}
            formatTime={formatTime}
            onToggleSelect={(id, checked) => {
              setSelectedClipIds((prev) =>
                checked ? [...prev, id] : prev.filter((x) => x !== id)
              );
            }}
            onPlayClip={playClip}
            onRenameDraftChange={(id, value) => {
              setRenameDraft((d) => ({ ...d, [id]: value }));
            }}
            onCommitRename={(id) => {
              const v = renameDraft[id];
              if (v == null) return;

              setClips((prev) => {
                pushHistory();
                showUndoToast("Rename clip");
                return prev.map((c) =>
                  c.id === id ? { ...c, name: v.trim() || "Clip" } : c
                );
              });

              setRenameDraft((d) => {
                const { [id]: _, ...rest } = d;
                return rest;
              });
            }}
            onEditIn={(id) =>
              setEditTarget({ clipId: id, field: "in" })
            }
            onEditOut={(id) =>
              setEditTarget({ clipId: id, field: "out" })
            }
            onDeleteSelected={() => {
              if (selectedClipIds.length === 0) return;

              pushHistory();
              setClips((prev) =>
                prev.filter((c) => !selectedClipIds.includes(c.id))
              );
              setSelectedClipIds([]);
              setEditTarget(null);

              showUndoToast(
                selectedClipIds.length > 1
                  ? "Delete clips"
                  : "Delete clip"
              );
            }}
            canEditClips={caps.canRenameClips}
            onUpgradeRequested={() => setShowUpgrade(true)}
          />

          <ExportPanel
            clips={clips}
            selectedClipIds={selectedClipIds}
            videoUrl={videoUrl}
            videoData={videoData}
            exportHQ={exportHQ}
            setExportHQ={setExportHQ}
            keepWholeVideo={keepWholeVideo}
            setKeepWholeVideo={setKeepWholeVideo}
            fastCap={fastCap}
            setFastCap={setFastCap}
            fastMax={fastMax}
            trueMax={trueMax}
            fastReachesMax={fastReachesMax}
            needsReencode={needsReencode}
            showAdvancedExport={showAdvancedExport}
            setShowAdvancedExport={setShowAdvancedExport}
            shouldWarnQuality={shouldWarnQuality}
            isExporting={isExporting}
            setIsExporting={setIsExporting}
            exportPath={exportPath}
            setExportPath={setExportPath}
            sanitizeExportPath={sanitizeExportPath}
            canEditExportPath={caps.canSetCustomExportPath}
            onUpgradeRequested={() => setShowUpgrade(true)}
          />
        </div>
      </div>
    )}
  </div>
);
}
