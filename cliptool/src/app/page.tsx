 "use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { supabase, getSupabaseConfigForBackend } from "@/lib/supabase";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

import {
  resolveVideo,
  downloadAll,
  CLIPAGENT_HTTP,
  type ResolvedVideo,
} from "@/lib/clipagent";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { tauriInvoke } from "@/lib/tauri";
import VideoViewport from "@/components/VideoViewport";
import Timeline from "@/components/Timeline";
import ClipsPanel from "@/components/ClipsPanel";
import ExportPanel from "@/components/ExportPanel";
import LeftSidebar from "@/components/LeftSidebar";
import UpgradeModal from "@/components/UpgradeModal";
import SettingsModal, {
  type ThemePreference,
  type ClipSortOption,
  type DefaultExportFormat,
} from "@/components/SettingsModal";
import type { Capabilities } from "@/lib/capabilities";

const SETTINGS_KEYS = {
  theme: "klipprr-theme",
  clipSort: "klipprr-clip-sort",
  defaultExportFormat: "klipprr-default-export-format",
} as const;

export default function HomePage() {
  const [videoUrl, setVideoUrl] = useState("");
  const [localFilePath, setLocalFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [videoData, setVideoData] = useState<ResolvedVideo | null>(null);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [license, setLicense] = useState<{ plan: string; active: boolean } | null>(null);

  const [email, setEmail] = useState<string | null>(null);
  const [plan, setPlan] = useState<"Free" | "Pro">("Free");
  const [accountLoading, setAccountLoading] = useState(true);

  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "latest" | "available" | "downloading" | "error"
  >("idle");
  const [updateInfo, setUpdateInfo] = useState<{ version: string; body?: string } | null>(null);
  const updateRef = useRef<Awaited<ReturnType<typeof checkForUpdate>> | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setThemeState] = useState<ThemePreference>("dark");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
  const [clipSort, setClipSortState] = useState<ClipSortOption>("timeline");
  const [defaultExportFormat, setDefaultExportFormatState] = useState<DefaultExportFormat>("universal");
  const [exportCompleteToast, setExportCompleteToast] = useState<{
    count: number;
    exportDir: string;
  } | null>(null);

  async function loadAuthAndPlan() {
    const { data } = await supabase.auth.getSession();
    const session = data.session;

    if (session?.user?.email) {
      setEmail(session.user.email);
    } else {
      setEmail(null);
    }

    try {
      const caps = await invoke<any>("get_capabilities");
      const isPro =
        caps?.canRenameClips || caps?.canSetCustomExportPath || caps?.can_rename_clips || caps?.can_set_custom_export_path;
      setPlan(isPro ? "Pro" : "Free");
    } catch (e) {
      console.error("Failed to get capabilities", e);
    }

    setAccountLoading(false);
  }

  useEffect(() => {
    loadAuthAndPlan();

    const sub = supabase.auth.onAuthStateChange(() => {
      loadAuthAndPlan();
    });

    const unlistenPromise = listen("license-updated", () => {
      loadAuthAndPlan();
    });

    return () => {
      sub.data.subscription.unsubscribe();
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

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

  // Run consume first so cold-start from magic link doesn't get cleared by sync (no session yet)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      console.log("[FRONTEND] Checking for pending auth tokens...");
      let tokens: [string, string] | null = null;
      try {
        tokens = await invoke<[string, string] | null>("consume_auth_tokens");
      } catch (err) {
        console.error("[FRONTEND] consume_auth_tokens error:", err);
      }
      console.log("[FRONTEND] consume_auth_tokens result:", tokens);

      if (cancelled) return;
      if (tokens) {
        const [accessToken, refreshToken] = tokens;
        console.log("[FRONTEND] Tokens received, setting session...");
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        await invoke("set_supabase_session", { accessToken, refreshToken });
        await invoke("sync_license_from_supabase", getSupabaseConfigForBackend());
        await refreshCapabilities();
        await loadAuthAndPlan();
        console.log("[FRONTEND] Auth flow finished (from pending tokens)");
        return;
      }
      // No pending tokens: sync from current session (or clear if not logged in)
      await syncLicenseFromSupabase();
    })().catch((err) => {
      console.error("[FRONTEND] Error in auth/sync flow:", err);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

useEffect(() => {
  const video = (window as any).__CLIPTOOL_VIDEO__ as HTMLVideoElement | null;
  if (!video) return;

  const syncTime = () => {
    if (Date.now() - programmaticSeekAtRef.current < 250) return;
    const t = video.currentTime;
    // Ignore stale 0 when we were at a later time (video not loaded or broken)
    if (t === 0 && currentTimeRef.current > 1) return;
    setCurrentTime(t);
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
  const [exportCodec, setExportCodec] = useState<"universal" | "original">("universal");
  // Load settings from localStorage and sync exportCodec with default format
  useEffect(() => {
    const t = localStorage.getItem(SETTINGS_KEYS.theme) as ThemePreference | null;
    if (t === "light" || t === "dark" || t === "system") setThemeState(t);
    const s = localStorage.getItem(SETTINGS_KEYS.clipSort) as ClipSortOption | null;
    if (s === "timeline" || s === "created") setClipSortState(s);
    const f = localStorage.getItem(SETTINGS_KEYS.defaultExportFormat) as DefaultExportFormat | null;
    if (f === "universal" || f === "original") {
      setDefaultExportFormatState(f);
      setExportCodec(f);
    }
  }, []);
  // Resolved theme for "system" preference
  useEffect(() => {
    if (theme !== "system") {
      setResolvedTheme(theme);
      return;
    }
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setResolvedTheme(m.matches ? "dark" : "light");
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, [theme]);
  // Persist theme and apply to document
  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(resolvedTheme);
  }, [resolvedTheme]);
  const setTheme = (v: ThemePreference) => {
    setThemeState(v);
    localStorage.setItem(SETTINGS_KEYS.theme, v);
  };
  const setClipSort = (v: ClipSortOption) => {
    setClipSortState(v);
    localStorage.setItem(SETTINGS_KEYS.clipSort, v);
  };
  const setDefaultExportFormat = (v: DefaultExportFormat) => {
    setDefaultExportFormatState(v);
    setExportCodec(v);
    localStorage.setItem(SETTINGS_KEYS.defaultExportFormat, v);
  };
  const sortedClips = useMemo(() => {
    if (clipSort === "timeline") {
      return [...clips].sort((a, b) => a.start - b.start);
    }
    return clips;
  }, [clips, clipSort]);
  const [keepWholeVideo, setKeepWholeVideo] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  // Remove resolveRequestId state, use ref instead for request tracking
  const resolveReqRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  /** Set when we programmatically seek (timeline/arrow); skip overwriting state from video for a short window to avoid reset to 0 */
  const programmaticSeekAtRef = useRef(0);
  /** Track state so we can ignore stale video.currentTime===0 when we know we're at a later time */
  const currentTimeRef = useRef(0);
  const [showAdvancedExport, setShowAdvancedExport] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    clipId: string;
    field: "in" | "out";
  } | null>(null);
  // Fast resolution picker state
  const [fastCap, setFastCap] = useState<number | null>(null); // null = Auto
  const [exportPath, setExportPath] = useState("");
  const [defaultExportDir, setDefaultExportDir] = useState("");
  const [exportToasts, setExportToasts] = useState<{ id: number; clipName: string; exportDir: string }[]>([]);
  const exportToastIdRef = useRef(0);
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
    videoRef: () => (window as any).__CLIPTOOL_VIDEO__ as HTMLVideoElement | null,
    onProgrammaticSeek: () => {
      programmaticSeekAtRef.current = Date.now();
    },
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
      setPlan(
        backendCaps.canRenameClips || backendCaps.canSetCustomExportPath ? "Pro" : "Free"
      );
      return;
    }
  } catch {
    // ignore
  }

  // 2) Fallback to local HTTP agent (works even when Tauri invoke is stale/broken)
  const httpCaps = await fetchCapabilitiesHttp();
  if (httpCaps) {
    setCaps(httpCaps);
    setPlan(
      httpCaps.canRenameClips || httpCaps.canSetCustomExportPath ? "Pro" : "Free"
    );
  }
}

  // Load video metadata from ClipAgent
  async function loadVideo() {
    // Normalize video URLs (accept many; UI only promises YouTube, Twitch clips, X, Instagram, Vimeo)
    function normalizeVideoUrl(input: string): string | null {
      input = input.trim();
      if (!input) return null;

      // Already a full URL — accept any http(s) URL (yt-dlp supports many sites)
      if (input.startsWith("http://") || input.startsWith("https://")) {
        try {
          return new URL(input).toString();
        } catch {
          return null;
        }
      }

      // Known domains without protocol — prepend https
      const knownPrefixes = [
        "youtu.be/",
        "youtube.com/",
        "www.youtube.com/",
        "twitch.tv/",
        "www.twitch.tv/",
        "x.com/",
        "twitter.com/",
        "www.twitter.com/",
        "tiktok.com/",
        "www.tiktok.com/",
        "vm.tiktok.com/",
        "instagram.com/",
        "www.instagram.com/",
        "vimeo.com/",
        "www.vimeo.com/",
      ];
      const lower = input.toLowerCase();
      for (const prefix of knownPrefixes) {
        if (lower.startsWith(prefix)) return "https://" + input;
      }

      // Bare YouTube video ID (11 chars)
      const ytIdPattern = /^[a-zA-Z0-9_-]{11}$/;
      if (ytIdPattern.test(input)) {
        return `https://www.youtube.com/watch?v=${input}`;
      }

      return null;
    }

    if (!videoUrl.trim()) {
      alert("Paste a video URL first.");
      return;
    }

    const normalized = normalizeVideoUrl(videoUrl);
    if (!normalized) {
      alert("Please enter a valid video link (YouTube, Twitch clips, X, Instagram, Vimeo, or direct video URL).");
      return;
    }

    setLoading(true);
    setShowAdvancedExport(false);
    setResolveError(null);
    setFastCap(null);
    setEditTarget(null);
    setLocalFilePath(null);
    setClips([]);
    setMarkIn(null);
    setMarkOut(null);
    setCurrentTime(0);

    try {
      const reqId = ++resolveReqRef.current;

      const res = await resolveVideo(normalized);

      // Ignore stale responses
      if (reqId !== resolveReqRef.current) return;
      if (!res.ok) {
        const code = res.error || "unknown_error";
        const details = "details" in res ? (res as { details?: string }).details : undefined;
        const lower = code.toLowerCase();

        let message: string;
        if (code === "cookies_not_accessible") {
          message =
            "Klipprr can't access browser cookies on this system (macOS restriction). Use \"Load local file\" or record your screen, then load that file.";
        } else if (code === "youtube_bot_block") {
          message =
            "YouTube is blocking automated access. Use \"Load local file\" or record your screen, then load that file.";
        } else if (code === "login_or_private") {
          message =
            "This video is private or requires login. We can't access it directly. Use \"Load local file\" or screen recording instead.";
        } else if (code === "no_progressive_preview") {
          message =
            "This video doesn't provide a format we can preview (e.g. some live or protected streams). Try \"Load local file\" or screen recording.";
        } else if (
          lower.includes("drm") ||
          lower.includes("widevine") ||
          lower.includes("protected") ||
          lower.includes("license") ||
          lower.includes("m3u8") ||
          lower.includes("403") ||
          lower.includes("forbidden") ||
          lower.includes("unauthorized")
        ) {
          message =
            "This platform appears to use protected/DRM streams (e.g., UFC Fight Pass, Netflix). Direct downloading/clipping won't work. Use Screen Capture mode instead.";
        } else if (details) {
          message = `Could not resolve this video. Technical details: ${details}`;
        } else {
          message = `Could not resolve this video. (${code})`;
        }
        setVideoData(null);
        setResolveError(message);
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

  async function loadLocalFile() {
    if (typeof window === "undefined" || !(window as any).__TAURI__) return;
    setResolveError(null);
    try {
      const selected = await openFileDialog({
        directory: false,
        multiple: false,
        filters: [
          { name: "Video", extensions: ["mp4", "mov", "avi", "webm", "mkv", "m4v"] },
        ],
      });
      if (!selected) return;
      setLoading(true);
      setLocalFilePath(selected);
      const [duration, _codec] = await invoke<[number, string | null]>("get_local_video_info", {
        path: selected,
      });
      const title = selected.split(/[/\\]/).pop() ?? "Local video";
      const localId = "local-" + selected.replace(/[/\\:]/g, "_").slice(-64);
      // Use backend stream URL so video works on Windows (convertFileSrc is unreliable there)
      const previewUrlForVideo = `${CLIPAGENT_HTTP}/local-preview?path=${encodeURIComponent(selected)}`;
      const data: ResolvedVideo = {
        id: localId,
        title,
        duration: Number(duration) || 0,
        thumbnail: null,
        previewUrl: previewUrlForVideo,
        capabilities: {
          fastMaxHeight: 1080,
          trueMaxHeight: 1080,
          trueMaxRequiresReencode: false,
        },
        raw: {
          id: localId,
          title,
          duration: Number(duration) || 0,
          preview: { url: previewUrlForVideo },
          capabilities: { fast_max_height: 1080, true_max_height: 1080, true_max_requires_reencode: false },
        },
      };
      setVideoData(data);
    } catch (e) {
      console.warn("Load local file failed:", e);
      setResolveError("Could not load the selected file.");
      setVideoData(null);
      setLocalFilePath(null);
    } finally {
      setLoading(false);
    }
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

// Shared handler: set Supabase session from tokens and refresh license/caps
async function handleAuthTokens(access_token: string, refresh_token: string) {
  if (!access_token || !refresh_token) return;

  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error || !data.session) {
    console.error("Failed to set Supabase session:", error);
    return;
  }

  await invoke("set_supabase_session", {
    accessToken: access_token,
    refreshToken: refresh_token,
  });

  await invoke("sync_license_from_supabase", getSupabaseConfigForBackend());
  await syncLicenseFromSupabase();
  await refreshCapabilities();
  await loadAuthAndPlan();
}

// auth-success: emitted when backend hands off tokens (e.g. second instance)
useEffect(() => {
  const unlistenAuth = listen<any>("auth-success", async (event) => {
    const { access_token, refresh_token } = event.payload ?? {};
    await handleAuthTokens(access_token, refresh_token);
  });

  return () => {
    unlistenAuth.then((fn) => fn());
  };
}, []);

// deep-link: second instance receives URL string; parse fragment and run same flow
useEffect(() => {
  const unlistenDeep = listen<string>("deep-link", async (event) => {
    const url = event.payload;
    if (!url || typeof url !== "string") return;
    const hashIndex = url.indexOf("#");
    if (hashIndex === -1) return;
    const fragment = url.slice(hashIndex + 1);
    const params = new URLSearchParams(fragment);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (access_token && refresh_token) {
      await handleAuthTokens(access_token, refresh_token);
    }
  });

  return () => {
    unlistenDeep.then((fn) => fn());
  };
}, []);

// When the window gains focus (e.g. after user clicked "Open Klipprr" in the browser),
// consume any pending auth tokens so login completes even if auth-success/deep-link was missed.
// Also run once on mount (delayed) so cold-start deep links are picked up when the backend
// filled PENDING_AUTH before the frontend was ready.
useEffect(() => {
  const tryConsumePendingAuth = async () => {
    if (!(window as any).__TAURI__) return;
    try {
      let tokens = await invoke<[string, string] | null>("consume_auth_tokens");
      if (!tokens) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) return;
        tokens = await invoke<[string, string] | null>("get_stored_session_tokens");
      }
      if (!tokens) return;
      const [accessToken, refreshToken] = tokens;
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      await invoke("set_supabase_session", { accessToken, refreshToken });
      await invoke("sync_license_from_supabase", getSupabaseConfigForBackend());
      await syncLicenseFromSupabase();
      await refreshCapabilities();
      await loadAuthAndPlan();
      console.log("[FRONTEND] Auth completed from focus fallback (pending tokens)");
    } catch (e) {
      console.error("[FRONTEND] Focus fallback consume_auth_tokens failed:", e);
    }
  };

  // Cold start: deep link was handled before frontend loaded; PENDING_AUTH is set. Run once after
  // a short delay so the backend has finished processing the URL.
  const t = setTimeout(() => tryConsumePendingAuth(), 800);

  let wasHidden = false;
  const onVisibility = () => {
    const visible = document.visibilityState === "visible";
    if (visible && wasHidden) {
      wasHidden = false;
      tryConsumePendingAuth();
    } else if (!visible) {
      wasHidden = true;
    }
  };
  const onWindowFocus = () => tryConsumePendingAuth();

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onWindowFocus);
  return () => {
    clearTimeout(t);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onWindowFocus);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  // --- License enforcement (Supabase → local ClipAgent) ---
  // Extracted license sync logic
async function syncLicenseFromSupabase() {
  console.log("[License][SYNC] invoked");

  let {
    data: { session: currentSession },
  } = await supabase.auth.getSession();

  // If frontend lost the session (e.g. after focus when refreshSession failed and cleared storage),
  // restore from backend-stored tokens so we stay logged in and keep Pro.
  if (!currentSession?.user && (window as any).__TAURI__) {
    try {
      const tokens = await invoke<[string, string] | null>("get_stored_session_tokens");
      if (tokens) {
        const [accessToken, refreshToken] = tokens;
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        const next = await supabase.auth.getSession();
        currentSession = next.data.session;
        console.log("[License][SYNC] Restored session from backend");
        await loadAuthAndPlan();
      }
    } catch (e) {
      console.warn("[License][SYNC] get_stored_session_tokens failed:", e);
    }
  }

  if (!currentSession?.user) {
    // Still no session: try backend sync for caps only, then clear
    if ((window as any).__TAURI__) {
      try {
        await invoke("sync_license_from_supabase", getSupabaseConfigForBackend());
        const caps = await tauriInvoke<Capabilities>("get_capabilities");
        if (caps && (caps.canRenameClips || caps.canSetCustomExportPath)) {
          setCaps(caps);
          // Backend has Pro but frontend had no session — restore session so UI shows logged in
          const tokens = await invoke<[string, string] | null>("get_stored_session_tokens");
          if (tokens) {
            const [accessToken, refreshToken] = tokens;
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            await loadAuthAndPlan();
          }
          return;
        }
      } catch {
        // Backend not logged in or sync failed
      }
    }
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
    // Don't call refreshSession() here: on failure it can clear the session and cause "logout" on next focus.

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
    // 🔓 POSITIVE CASE — active license → push fresh session so backend has latest tokens, then sync
    console.log("[License][SYNC] Active license found → syncing backend and refreshing caps");
    if ((window as any).__TAURI__) {
      await invoke("set_supabase_session", {
        accessToken: currentSession.access_token,
        refreshToken: currentSession.refresh_token ?? "",
      });
      await invoke("sync_license_from_supabase", getSupabaseConfigForBackend());
    }
    const caps = await tauriInvoke<Capabilities>("get_capabilities");
    if (caps) {
      setCaps(caps);
    }
  } catch (err) {
    console.error("[License][SYNC] Failed:", err);
  }
}

  // Startup sync is done inside the consume effect above (after consume, if no tokens).
  // No sync on window focus; use the Sync button or re-login to refresh license.

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

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

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
      if ((window as any).__TAURI__) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          try {
            await invoke("set_supabase_session", {
              accessToken: session.access_token,
              refreshToken: session.refresh_token ?? "",
            });
            await invoke("sync_license_from_supabase", getSupabaseConfigForBackend());
          } catch {
            // Backend may be unavailable or sync failed; still refresh caps
          }
        }
      }
      await refreshCapabilities();
    })();
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

  // Resolve default export dir (e.g. ~/Downloads) when running in Tauri for display
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).__TAURI__) {
      invoke<string>("get_default_export_dir")
        .then(setDefaultExportDir)
        .catch(() => setDefaultExportDir(""));
    }
  }, []);

  // Sync persisted export path with plan: load when Pro, clear when Free
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).__TAURI__ || caps == null) return;
    if (caps.canSetCustomExportPath) {
      invoke<string | null>("get_export_path")
        .then((p) => setExportPath(p ?? ""))
        .catch(() => setExportPath(""));
    } else {
      invoke("clear_export_path").catch(() => {});
      setExportPath("");
    }
  }, [caps]);

  // Per-clip export done toasts (top right)
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).__TAURI__) return;
    const unlisten = listen<{ clip_name: string; export_dir: string }>("export-clip-done", (event) => {
      const { clip_name, export_dir } = event.payload ?? {};
      if (!clip_name || !export_dir) return;
      const id = ++exportToastIdRef.current;
      setExportToasts((prev) => [...prev, { id, clipName: clip_name, exportDir: export_dir }]);
      setTimeout(() => {
        setExportToasts((prev) => prev.filter((t) => t.id !== id));
      }, 8000);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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

  async function openExportFolder(path: string) {
    try {
      await invoke("open_export_folder", { path });
    } catch (e) {
      console.warn("Open folder failed:", e);
    }
  }

  function dismissExportToast(id: number) {
    setExportToasts((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleCheckForUpdates() {
    if (typeof window === "undefined" || !(window as any).__TAURI__) return;
    setUpdateStatus("checking");
    setUpdateInfo(null);
    updateRef.current = null;
    try {
      const update = await checkForUpdate();
      if (update) {
        updateRef.current = update;
        setUpdateInfo({ version: update.version, body: update.body ?? undefined });
        setUpdateStatus("available");
      } else {
        setUpdateStatus("latest");
        setTimeout(() => setUpdateStatus("idle"), 3000);
      }
    } catch (err) {
      console.error("Update check failed:", err);
      setUpdateStatus("error");
      setTimeout(() => setUpdateStatus("idle"), 5000);
    }
  }

  async function handleInstallUpdate() {
    const update = updateRef.current;
    if (!update) return;
    setUpdateStatus("downloading");
    try {
      await update.downloadAndInstall(() => {});
      await relaunch();
    } catch (err) {
      console.error("Update install failed:", err);
      setUpdateStatus("error");
      setTimeout(() => setUpdateStatus("idle"), 4000);
    }
  }

  const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI__;

  return (
  <div className="h-screen min-h-dvh flex overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
    <LeftSidebar
      onOpenSettings={() => setShowSettings(true)}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
      email={email}
      plan={plan}
      accountLoading={accountLoading}
      isTauri={isTauri}
      updateStatus={updateStatus}
      updateInfo={updateInfo}
      onSync={async () => {
        await invoke("sync_license_from_supabase", getSupabaseConfigForBackend());
        await refreshCapabilities();
      }}
      onCheckForUpdates={handleCheckForUpdates}
      onInstallUpdate={handleInstallUpdate}
      onLogout={async () => {
        await supabase.auth.signOut();
        await invoke("clear_license_cmd");
        await refreshCapabilities();
        await loadAuthAndPlan();
      }}
      onLogin={async () => {
        try {
          await openExternal(
            "https://klipprr.com/login?redirect=" +
              encodeURIComponent("clipagent://auth-callback")
          );
        } catch (err) {
          console.error("Failed to open login page:", err);
        }
      }}
    />

    {/* Main content — reserve left margin so sidebar never hides content */}
    <main
      className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden transition-[margin-left] duration-200"
      style={{ marginLeft: sidebarCollapsed ? 72 : 256 }}
    >
    {/* Export clip toasts — top right, match app (zinc + violet) */}
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {exportToasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white/95 dark:border-zinc-700 dark:bg-zinc-900/95 backdrop-blur px-3 py-2.5 text-sm shadow-xl"
        >
          <span className="flex-1 truncate text-zinc-900 dark:text-white font-medium" title={t.clipName}>
            {t.clipName}
          </span>
          <span className="shrink-0 text-violet-400" aria-hidden>✓</span>
          <button
            type="button"
            onClick={() => {
              openExportFolder(t.exportDir);
              dismissExportToast(t.id);
            }}
            className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition"
          >
            Open folder
          </button>
          <button
            type="button"
            onClick={() => dismissExportToast(t.id)}
            className="shrink-0 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white p-0.5 rounded"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>

    <UpgradeModal
  open={showUpgrade}
  onClose={() => setShowUpgrade(false)}
  onUpgraded={async () => {
    await refreshCapabilities();
    setShowUpgrade(false);
  }}
  isLoggedIn={!!email}
  onRedeemCode={async (code) => {
    const { error } = await supabase.functions.invoke("redeem_activation_code", {
      body: { code },
    });
    if (error) {
      return { error: error.message ?? "Activation failed." };
    }
    // Redeem succeeded: push session and sync so the app picks up Pro immediately.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      await invoke("set_supabase_session", {
        accessToken: session.access_token,
        refreshToken: session.refresh_token ?? "",
      });
    }
    await invoke("sync_license_from_supabase", getSupabaseConfigForBackend());
    await refreshCapabilities();
    return {};
  }}
/>
    {undoToast && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/95 dark:bg-zinc-900/95 border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-xl text-sm text-zinc-900 dark:text-white animate-toast">
        {undoToast}
      </div>
    )}
    {exportCompleteToast && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-4 py-3 shadow-xl">
        <span className="text-violet-500 dark:text-violet-400 text-lg font-medium" aria-hidden>✓</span>
        <span className="text-zinc-900 dark:text-white font-medium">
          Export complete — {exportCompleteToast.count} clip{exportCompleteToast.count !== 1 ? "s" : ""} saved
        </span>
        <button
          type="button"
          onClick={() => {
            openExportFolder(exportCompleteToast.exportDir);
            setExportCompleteToast(null);
          }}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition"
        >
          Open folder
        </button>
        <button
          type="button"
          onClick={() => setExportCompleteToast(null)}
          className="shrink-0 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white p-0.5 rounded"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    )}
    {/* URL bar */}
    <div className="shrink-0 px-4 py-3 border-b border-zinc-200 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {videoData && (
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider px-2 py-1 rounded-md bg-zinc-800/80 text-white dark:text-zinc-300 shrink-0">
              Preview
            </span>
          )}
          <span className="text-zinc-500 shrink-0">URL</span>
          <input
            type="text"
            placeholder="YouTube, Twitch clips, X, Instagram, or video URL…"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className="flex-1 min-w-0 max-w-xl px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder-zinc-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
            suppressHydrationWarning
          />
        </div>
        <button
          onClick={loadVideo}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm disabled:opacity-50 transition"
        >
          <span className={`inline-flex items-center gap-2 ${loading ? "animate-pulse" : ""}`}>
            {loading && <span className="inline-block w-2 h-2 rounded-full bg-white animate-bounce" />}
            {loading ? "Loading…" : "Load"}
          </span>
        </button>
        {isTauri && (
          <button
            type="button"
            onClick={loadLocalFile}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-medium text-sm disabled:opacity-50 transition"
          >
            Load local file
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500 mt-1.5">YouTube, Twitch clips, X (Twitter), Instagram Reels, Vimeo, and direct video URLs</p>
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

    {/* Workspace: fill height; export panel fixed on right when open (never clipped); clips panel can shrink */}
    {videoData && (
      <div className="flex-1 min-h-0 flex flex-row min-w-0 overflow-hidden">
        {/* Content area: video + clips; scrolls horizontally when export open and narrow */}
        <div className="flex flex-col min-[1200px]:flex-row gap-4 p-4 flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-hidden min-[1200px]:min-w-0">
          {/* Video + timeline: fills space */}
          <div className="flex flex-col min-h-[280px] min-[1200px]:min-h-0 min-w-0 flex-1 min-[1200px]:min-w-[300px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-black shrink-0">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 px-3 pt-2 truncate shrink-0" title={videoData.title}>
              {videoData.title}
            </h2>
            <div className="relative flex-1 min-h-0 w-full">
              <VideoViewport
                src={
                  isTauri &&
                  videoData.previewUrl &&
                  !videoData.previewUrl.includes("/local-preview") &&
                  (videoData.previewUrl.startsWith("http://") || videoData.previewUrl.startsWith("https://"))
                    ? `${CLIPAGENT_HTTP}/preview-stream?url=${encodeURIComponent(videoData.previewUrl)}`
                    : videoData.previewUrl
                }
                videoKey={videoData.id}
                currentTime={currentTime}
                onTimeUpdate={(t) => {
                  if (Date.now() - programmaticSeekAtRef.current < 250) return;
                  if (t === 0 && currentTimeRef.current > 1) return;
                  setCurrentTime(t);
                }}
              />
            </div>
            <div className="shrink-0 p-2 border-t border-zinc-200 dark:border-zinc-800">
              <Timeline
                duration={videoData.duration}
                clips={clips}
                markIn={markIn}
                markOut={markOut}
                selectedClipIds={selectedClipIds}
                currentTime={currentTime}
                onSeek={(t) => {
                  programmaticSeekAtRef.current = Date.now();
                  setCurrentTime(t);
                  const video = (window as any).__CLIPTOOL_VIDEO__ as HTMLVideoElement | null;
                  if (!video) return;
                  if (video.readyState >= 1) video.currentTime = t;
                  else pendingSeekRef.current = t;
                }}
                onSelectClip={(id, multi) => {
                  setSelectedClipIds((prev) =>
                    multi ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]
                  );
                }}
              />
            </div>
            <div className="shrink-0 p-3 flex flex-wrap gap-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
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
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                    editTarget
                      ? "bg-zinc-600 cursor-not-allowed text-zinc-400"
                      : markIn === null && markOut === null
                      ? "text-white"
                      : markIn !== null && markOut === null
                      ? "bg-[#ef4444] hover:bg-[#dc2626] text-white"
                      : "text-white"
                  }`}
                  style={
                    !editTarget && ((markIn === null && markOut === null) || (markIn !== null && markOut !== null))
                      ? { background: "linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)" }
                      : undefined
                  }
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const video = (window as any).__CLIPTOOL_VIDEO__ as HTMLVideoElement | null;
                        if (!video) return;
                        const t = video.currentTime;
                        setClips((prev) => {
                          pushHistory();
                          return prev
                            .map((c) => {
                              if (c.id !== editTarget.clipId) return c;
                              let start = c.start;
                              let end = c.end;
                              if (editTarget.field === "in") start = t;
                              else end = t;
                              if (end < start) [start, end] = [end, start];
                              return { ...c, start, end };
                            })
                            .sort((a, b) => a.start - b.start);
                        });
                        setEditTarget(null);
                      }}
                      className="px-3 py-1 rounded-lg text-white text-sm font-medium"
                      style={{ background: "linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)" }}
                    >
                      Apply {editTarget.field.toUpperCase()} (Enter)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditTarget(null)}
                      className="px-3 py-1 rounded-lg bg-zinc-600 hover:bg-zinc-500 text-sm"
                    >
                      Cancel (Esc)
                    </button>
                  </div>
                )}
              </div>
          </div>

          {/* Clips panel: fills height in column mode (no gap below); can shrink (min 200px) in row so Export never clipped */}
          <div className={`flex flex-col min-w-0 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/80 flex-1 min-h-0 min-[1200px]:flex-initial min-[1200px]:shrink-0 ${exportPanelOpen ? "min-[1200px]:w-80 min-[1200px]:min-w-[200px] min-[1200px]:max-w-[320px]" : "min-[1200px]:w-80"}`}>
            <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto p-4 min-w-0">
              <ClipsPanel
                clips={sortedClips}
                selectedClipIds={selectedClipIds}
                renameDraft={renameDraft}
                editTarget={editTarget}
                undo={undo}
                redo={redo}
                canUndo={history.length > 0}
                canRedo={future.length > 0}
                formatTime={formatTime}
                onToggleSelect={(id, checked) =>
                  setSelectedClipIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
                }
                onPlayClip={playClip}
                onRenameDraftChange={(id, value) => setRenameDraft((d) => ({ ...d, [id]: value }))}
                onCommitRename={(id) => {
                  const v = renameDraft[id];
                  if (v == null) return;
                  setClips((prev) => {
                    pushHistory();
                    showUndoToast("Rename clip");
                    return prev.map((c) => (c.id === id ? { ...c, name: v.trim() || "Clip" } : c));
                  });
                  setRenameDraft((d) => {
                    const { [id]: _, ...rest } = d;
                    return rest;
                  });
                }}
                onEditIn={(id) => setEditTarget({ clipId: id, field: "in" })}
                onEditOut={(id) => setEditTarget({ clipId: id, field: "out" })}
                onDeleteSelected={() => {
                  if (selectedClipIds.length === 0) return;
                  pushHistory();
                  setClips((prev) => prev.filter((c) => !selectedClipIds.includes(c.id)));
                  setSelectedClipIds([]);
                  setEditTarget(null);
                  showUndoToast(selectedClipIds.length > 1 ? "Delete clips" : "Delete clip");
                }}
                canEditClips={caps.canRenameClips}
                onUpgradeRequested={() => setShowUpgrade(true)}
              />
            </div>
            {!exportPanelOpen && (
              <div className="shrink-0 p-4 pt-0 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setExportPanelOpen(true)}
                  className="btn-brand w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
                >
                  <span>↓</span>
                  Export
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Export panel: fixed on the right, never clipped (clips panel shrinks first on narrow screens) */}
        {exportPanelOpen && (
          <div className="w-96 flex-shrink-0 flex flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 self-stretch">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <span className="font-semibold text-zinc-900 dark:text-white">Export Settings</span>
              <button
                type="button"
                onClick={() => setExportPanelOpen(false)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition"
                aria-label="Close export panel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-4">
              <ExportPanel
            clips={sortedClips}
            selectedClipIds={selectedClipIds}
            videoUrl={videoUrl}
            localFilePath={localFilePath}
            videoData={videoData}
            exportHQ={exportHQ}
            setExportHQ={setExportHQ}
            exportCodec={exportCodec}
            setExportCodec={setExportCodec}
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
            defaultExportDir={defaultExportDir}
            sanitizeExportPath={sanitizeExportPath}
            canEditExportPath={caps.canSetCustomExportPath}
            onExportPathChosen={async (path) => {
              try {
                await invoke("set_export_path", { path });
              } catch (e) {
                console.warn("Persist export path failed:", e);
              }
            }}
            onUpgradeRequested={() => setShowUpgrade(true)}
            onExportComplete={(count, exportDir) => {
              setExportCompleteToast({ count, exportDir });
              setTimeout(() => setExportCompleteToast(null), 12000);
            }}
              />
            </div>
          </div>
        )}
      </div>
    )}
    </main>

    <SettingsModal
      isOpen={showSettings}
      onClose={() => setShowSettings(false)}
      theme={theme}
      setTheme={setTheme}
      clipSort={clipSort}
      setClipSort={setClipSort}
      defaultExportFormat={defaultExportFormat}
      setDefaultExportFormat={setDefaultExportFormat}
    />
  </div>
);
}
