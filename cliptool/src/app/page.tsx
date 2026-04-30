 "use client";

import { useEffect, useState, useRef, useMemo } from "react";
import posthog from "posthog-js";
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
import AccessModal from "@/components/AccessModal";
import WatermarkInterstitial from "@/components/WatermarkInterstitial";
import SettingsModal, {
  type ThemePreference,
  type ClipSortOption,
  type DefaultExportFormat,
} from "@/components/SettingsModal";
import type { Capabilities } from "@/lib/capabilities";
import {
  getCurrentMonthlyUsage,
  normalizePlan,
  releaseClipExports,
  reserveClipExports,
} from "@/lib/usage";
import { track, type AnalyticsBase } from "@/lib/analytics";
import {
  fetchAppFeatureFlags,
  clearAppFeatureFlagsCache,
  type AppFeatureFlags,
} from "@/lib/posthog-flags";

const SETTINGS_KEYS = {
  theme: "klipprr-theme",
  clipSort: "klipprr-clip-sort",
  defaultExportFormat: "klipprr-default-export-format",
} as const;
const PENDING_EXPORT_RESERVATION_KEY = "klipprr-pending-export-reservation";

export default function HomePage() {
  const [videoUrl, setVideoUrl] = useState("");
  const [localFilePath, setLocalFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** 0–100; advances while loading (simulated to ~90), then 100 when done. */
  const [loadProgress, setLoadProgress] = useState(0);
  const [videoData, setVideoData] = useState<ResolvedVideo | null>(null);
  // Normalized URL actually used for resolve/export. Stays stable even if the user edits the URL input afterwards.
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"feature_locked" | "clip_limit_reached" | null>(null);
  const [session, setSession] = useState<any>(null);
  const [license, setLicense] = useState<{ plan: string; active: boolean } | null>(null);

  const [email, setEmail] = useState<string | null>(null);
  const [plan, setPlan] = useState<"Free" | "Pro" | "Max">("Free");
  const [accountLoading, setAccountLoading] = useState(true);
  const [abFlags, setAbFlags] = useState<AppFeatureFlags>({
    subscribeCtaVariant: "control",
    pricingProCtaVariant: "control",
  });
  const [usage, setUsage] = useState<{ used: number; limit: number; remaining: number } | null>(null);

  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "latest" | "available" | "downloading" | "error"
  >("idle");
  const [updateInfo, setUpdateInfo] = useState<{ version: string; body?: string } | null>(null);
  const updateRef = useRef<Awaited<ReturnType<typeof checkForUpdate>> | null>(null);
  const [showUpdateToast, setShowUpdateToast] = useState(false);

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
  const [watermarkInterstitial, setWatermarkInterstitial] = useState<{
    count: number;
    exportDir: string;
  } | null>(null);

  function clearSupabaseLocalAuthStorage() {
    if (typeof window === "undefined") return;
    try {
      const keysToDelete: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (key === "supabase.auth.token" || (key.startsWith("sb-") && key.endsWith("-auth-token"))) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        window.localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn("[Auth] Failed to clear local Supabase auth storage:", e);
    }
  }

  async function loadAuthAndPlan() {
    if (suppressAutoSessionRestoreRef.current) {
      setSession(null);
      setLicense(null);
      setEmail(null);
      setPlan("Free");
      setAccountLoading(false);
      return;
    }

    // 1) Source of truth for plan + email is the desktop license (backend).
    let planFromLicense: "Free" | "Pro" | "Max" | null = null;
    let emailFromLicense: string | null = null;
    try {
      const status: any = await invoke("get_license_status");
      if (status && status.Ok) {
        const ok = status.Ok as any;
        const rawPlan = String(ok.plan ?? ok?.claims?.plan ?? "free").toLowerCase();
        if (rawPlan === "max") planFromLicense = "Max";
        else if (rawPlan === "pro") planFromLicense = "Pro";
        else planFromLicense = "Free";
        if (ok.claims?.email && typeof ok.claims.email === "string") {
          emailFromLicense = ok.claims.email;
        }
      }
    } catch (e) {
      console.error("Failed to get license status", e);
    }

    // 2) Frontend Supabase session (used for showing the account and redeeming codes).
    const { data } = await supabase.auth.getSession();
    const supaSession = data.session;
    setSession(supaSession ?? null);
    const email =
      emailFromLicense ??
      (supaSession?.user?.email ? String(supaSession.user.email) : null);
    setEmail(email);

    // 3) Plan: prefer license; fall back to capabilities if license is missing.
    if (planFromLicense) {
      setPlan(planFromLicense);
    } else {
      try {
        const caps = await invoke<any>("get_capabilities");
        const isPro =
          caps?.canRenameClips ||
          caps?.canSetCustomExportPath ||
          caps?.can_rename_clips ||
          caps?.can_set_custom_export_path;
        setPlan(isPro ? "Pro" : "Free");
      } catch (e) {
        console.error("Failed to get capabilities", e);
      }
    }

    setAccountLoading(false);
  }

  useEffect(() => {
    const platform = navigator.userAgent.toLowerCase().includes("win") ? "windows" : "mac";
    track({ externalId: null, email: null, plan: "free" }, "session_started", { platform });
    sessionStartRef.current = Date.now();

    let ended = false;
    const handleSessionEnd = () => {
      if (ended) return;
      ended = true;
      const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
      track(analyticsBaseRef.current, "session_ended", { session_duration_seconds: duration });
    };
    window.addEventListener("beforeunload", handleSessionEnd);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") handleSessionEnd();
    };
    document.addEventListener("visibilitychange", onVisibility);

    loadAuthAndPlan();

    const sub = supabase.auth.onAuthStateChange(() => {
      loadAuthAndPlan();
    });

    const unlistenPromise = listen("license-updated", () => {
      loadAuthAndPlan();
    });

    return () => {
      window.removeEventListener("beforeunload", handleSessionEnd);
      document.removeEventListener("visibilitychange", onVisibility);
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
      console.log("[FRONTEND] consume_auth_tokens completed");

      if (cancelled) return;
      if (tokens) {
        const [accessToken, refreshToken] = tokens;
        console.log("[FRONTEND] Tokens received, setting session");
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
  const [qualityReencodeH264, setQualityReencodeH264] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  /** Local path to a yt-dlp–downloaded preview for platforms like TikTok whose CDN
   *  URLs cannot be fetched directly by WKWebView (cookie/CORS barrier). */
  const [ytPreviewPath, setYtPreviewPath] = useState<string | null>(null);
  const [ytPreviewLoading, setYtPreviewLoading] = useState(false);
  /** Path to the smooth HQ proxy (720p H.264) generated in background for PCM local files.
   *  Null while encoding; set when /local-proxy-status reports "ready". */
  const [pcmHqProxyUrl, setPcmHqProxyUrl] = useState<string | null>(null);
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
  const suppressAutoSessionRestoreRef = useRef(false);
  const analyticsBaseRef = useRef<AnalyticsBase>({ externalId: null, email: null, plan: "free" });
  const sessionStartRef = useRef(Date.now());
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
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
    onProgrammaticSeek: (t) => {
      programmaticSeekAtRef.current = Date.now();
      currentTimeRef.current = t;
      setCurrentTime(t);
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

// Keep analyticsBase ref in sync so event handlers closed over it use current values.
// eslint-disable-next-line react-hooks/rules-of-hooks
useEffect(() => {
  analyticsBaseRef.current = {
    externalId: session?.user?.id ?? null,
    email,
    plan: plan.toLowerCase() as "free" | "pro" | "max",
  };
}, [session, email, plan]);

function trackEvent(event: string, extra: Record<string, unknown> = {}) {
  track(analyticsBaseRef.current, event, extra);
}

async function fetchCapabilitiesHttp(): Promise<Capabilities | null> {
  try {
    const res = await fetch("http://localhost:4000/capabilities", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;

    return normalizeCapabilities(json);
  } catch {
    return null;
  }
}

function normalizeCapabilities(json: any): Capabilities {
  return {
    canRenameClips: Boolean(json?.canRenameClips ?? json?.can_rename_clips),
    canEditClipRange: Boolean(json?.canEditClipRange ?? json?.can_edit_clip_range),
    canSetCustomExportPath: Boolean(
      json?.canSetCustomExportPath ?? json?.can_set_custom_export_path
    ),
    hasWatermark: Boolean(json?.hasWatermark ?? json?.has_watermark),
  };
}

async function refreshCapabilities() {
  // 1) Prefer Tauri (when running inside the desktop app)
  try {
    const backendCaps = await tauriInvoke<any>("get_capabilities");
    if (backendCaps) {
      const normalized = normalizeCapabilities(backendCaps);
      setCaps(normalized);
      setPlan((prev) =>
        prev === "Max"
          ? "Max"
          : normalized.canRenameClips || normalized.canSetCustomExportPath
            ? "Pro"
            : "Free"
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
    setPlan((prev) =>
      prev === "Max"
        ? "Max"
        : httpCaps.canRenameClips || httpCaps.canSetCustomExportPath
          ? "Pro"
          : "Free"
    );
  }
}

async function reserveExportQuota(clipCount: number): Promise<boolean> {
  if (!session?.user?.id) {
    trackEvent("paywall_hit", { feature: "sign_in" });
    setUpgradeFeature("sign_in");
    setUpgradeReason("feature_locked");
    setShowUpgrade(true);
    return false;
  }

  const planKey = normalizePlan(plan);
  const result = await reserveClipExports({ plan: planKey, requested: clipCount });
  if (!result.ok) {
    alert(result.error || "Could not verify your clip quota.");
    return false;
  }

  if (!result.result.allowed) {
    trackEvent("export_limit_reached");
    setUpgradeFeature("clip_limit");
    setUpgradeReason("clip_limit_reached");
    setShowUpgrade(true);
    return false;
  }
  await refreshUsage();
  return true;
}

async function refreshUsage() {
  if (!session?.user?.id) {
    setUsage(null);
    return;
  }
  const planKey = normalizePlan(plan);
  const result = await getCurrentMonthlyUsage(planKey, session.user.id);
  if (!result.ok) {
    console.warn("[Usage] failed to fetch usage", result.error);
    return;
  }
  setUsage(result.result);
}

function savePendingReservation(remaining: number) {
  if (typeof window === "undefined") return;
  if (remaining <= 0) {
    window.localStorage.removeItem(PENDING_EXPORT_RESERVATION_KEY);
    return;
  }
  window.localStorage.setItem(
    PENDING_EXPORT_RESERVATION_KEY,
    JSON.stringify({
      remaining,
      updatedAt: Date.now(),
    })
  );
}

function readPendingReservation(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(PENDING_EXPORT_RESERVATION_KEY);
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { remaining?: number };
    return Math.max(0, Number(parsed?.remaining ?? 0));
  } catch {
    return 0;
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
    setLoadProgress(0);
    setShowAdvancedExport(false);
    setResolveError(null);
    setFastCap(null);
    setEditTarget(null);
    setLocalFilePath(null);
    // We're starting a new resolve for this normalized URL; clear previous resolvedUrl until we succeed.
    setResolvedUrl(null);
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
        setResolvedUrl(normalized);
        trackEvent("source_added", { source_type: "url" });
        if (!localStorage.getItem("klipprr-onboarding-import-first-video")) {
          localStorage.setItem("klipprr-onboarding-import-first-video", "1");
          trackEvent("onboarding_step_completed", { step: "import_first_video" });
        }
      }
    } catch (err) {
      console.error(err);
      alert("Could not reach ClipAgent.");
    }

    setLoadProgress(100);
    setTimeout(() => setLoading(false), 400);
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
      setLoadProgress(0);
      setLocalFilePath(selected);
      const [duration, _codec, audioCodec] = await invoke<[number, string | null, string | null]>("get_local_video_info", {
        path: selected,
      });
      const title = selected.split(/[/\\]/).pop() ?? "Local video";
      const localId = "local-" + selected.replace(/[/\\:]/g, "_").slice(-64);
      // Use backend stream URL so video works on Windows (convertFileSrc is unreliable there)
      const ac = typeof audioCodec === "string" ? audioCodec.toLowerCase() : "";
      const needsPcmFix =
        ac.startsWith("pcm") || ac === "lpcm" || ac === "alac" || ac === "flac";
      const previewUrlForVideo = `${CLIPAGENT_HTTP}/local-preview?path=${encodeURIComponent(selected)}${needsPcmFix ? "&pcm_fix=1" : ""}`;
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
          // Non-standard field; used only for in-app diagnostics when local preview fails.
          audio_codec: audioCodec,
          capabilities: { fast_max_height: 1080, true_max_height: 1080, true_max_requires_reencode: false },
        },
      };
      setVideoData(data);
      trackEvent("source_added", { source_type: "file" });
      if (!localStorage.getItem("klipprr-onboarding-import-first-video")) {
        localStorage.setItem("klipprr-onboarding-import-first-video", "1");
        trackEvent("onboarding_step_completed", { step: "import_first_video" });
      }
    } catch (e) {
      console.warn("Load local file failed:", e);
      setResolveError("Could not load the selected file.");
      setVideoData(null);
      setLocalFilePath(null);
    } finally {
      setLoadProgress(100);
      setTimeout(() => setLoading(false), 400);
    }
  }

  // For TikTok (and similar platforms where WKWebView can't fetch CDN URLs directly):
  // trigger a backend yt-dlp preview download and serve it via /local-preview.
  useEffect(() => {
    // Reset yt preview state whenever the resolved video changes
    setYtPreviewPath(null);
    setYtPreviewLoading(false);

    if (!resolvedUrl || !videoData || !isTauri) return;
    // Only TikTok needs this; other platforms either work via proxy or HLS natively
    const needsYtPreview =
      resolvedUrl.includes("tiktok.com") || resolvedUrl.includes("tiktokcdn.com");
    if (!needsYtPreview) return;

    setYtPreviewLoading(true);
    fetch(`${CLIPAGENT_HTTP}/yt-preview-cache?url=${encodeURIComponent(resolvedUrl)}`)
      .then((r) => r.json())
      .then((data: any) => {
        if (data?.ok && data?.path) {
          setYtPreviewPath(data.path as string);
        } else {
          console.warn("[TikTok preview] yt-preview-cache failed:", data);
          setYtPreviewPath(null);
        }
      })
      .catch((e) => {
        console.warn("[TikTok preview] fetch error:", e);
        setYtPreviewPath(null);
      })
      .finally(() => setYtPreviewLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUrl, videoData?.id]);

  // Background HQ proxy polling: after a PCM local file loads (stream-copy phase 1 may lag
  // on large ProRes/DNxHD files), the backend encodes a smooth 720p H.264 proxy in a
  // background thread. Poll every 4s and silently swap the video src when ready.
  useEffect(() => {
    setPcmHqProxyUrl(null);
    if (!localFilePath || !isTauri) return;
    // Only poll when a pcm_fix was applied (URL carries pcm_fix=1 param)
    if (!videoData?.previewUrl?.includes("pcm_fix=1")) return;

    let active = true;
    let intervalId: number | null = null;

    const check = async () => {
      if (!active) return;
      try {
        const res = await fetch(
          `${CLIPAGENT_HTTP}/local-proxy-status?path=${encodeURIComponent(localFilePath)}`
        );
        const data = (await res.json()) as { status: string; path?: string };
        if (!active) return;
        if (data.status === "ready" && data.path) {
          setPcmHqProxyUrl(
            `${CLIPAGENT_HTTP}/local-preview?path=${encodeURIComponent(data.path)}`
          );
          if (intervalId !== null) clearInterval(intervalId);
        }
      } catch {
        // Ignore transient polling errors; keep retrying
      }
    };

    // Check once immediately (file may already be cached from a prior session), then every 4s
    check();
    intervalId = window.setInterval(check, 4000);
    return () => {
      active = false;
      if (intervalId !== null) clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localFilePath, videoData?.id]);

  // Advance load progress while loading: fast start, exponential deceleration toward 90%.
  useEffect(() => {
    if (!loading) return;
    const cap = 90;
    const interval = setInterval(() => {
      setLoadProgress((p) => {
        if (p >= cap) return cap;
        const remaining = cap - p;
        // Jump shrinks as we approach cap: fast early, crawl near 90
        const jump = Math.max(0.6, remaining * 0.11);
        return Math.min(p + jump, cap);
      });
    }, 180);
    return () => clearInterval(interval);
  }, [loading]);

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

useEffect(() => {
  refreshUsage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [session?.user?.id, plan]);

// Fetch PostHog feature flags once per session when the user is identified.
useEffect(() => {
  const uid = session?.user?.id;
  if (!uid) return;
  fetchAppFeatureFlags(uid).then(setAbFlags).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [session?.user?.id]);

useEffect(() => {
  const recoverPendingReservation = async () => {
    const pending = readPendingReservation();
    if (pending <= 0) return;
    const result = await releaseClipExports({ count: pending });
    if (!result.ok) {
      console.warn("[Usage] failed to recover pending reservation refund", result.error);
      return;
    }
    savePendingReservation(0);
    await refreshUsage();
  };
  recoverPendingReservation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// Shared handler: set Supabase session from tokens and refresh license/caps
async function handleAuthTokens(access_token: string, refresh_token: string) {
  if (!access_token || !refresh_token) return;
  suppressAutoSessionRestoreRef.current = false;

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
  let syncTimers: number[] = [];
  const clearSyncTimers = () => {
    syncTimers.forEach((id) => window.clearTimeout(id));
    syncTimers = [];
  };

  // Checkout/webhook can finish a few seconds after the app regains focus.
  // Retry sync briefly so Pro unlocks without requiring manual "Sync".
  const queuePostReturnSync = () => {
    if (!(window as any).__TAURI__) return;
    if (suppressAutoSessionRestoreRef.current) return;
    clearSyncTimers();
    const delays = [0, 3000, 12000];
    for (const d of delays) {
      const id = window.setTimeout(async () => {
        try {
          await syncLicenseFromSupabase();
          await refreshCapabilities();
          await loadAuthAndPlan();
        } catch (e) {
          console.warn("[License][SYNC] post-return retry failed:", e);
        }
      }, d);
      syncTimers.push(id);
    }
  };

  const tryConsumePendingAuth = async () => {
    if (!(window as any).__TAURI__) return;
    if (suppressAutoSessionRestoreRef.current) return;
    try {
      let tokens = await invoke<[string, string] | null>("consume_auth_tokens");
      if (!tokens) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          // Already logged in: still run license sync (e.g. user just returned from Stripe checkout).
          queuePostReturnSync();
          return;
        }
        tokens = await invoke<[string, string] | null>("get_stored_session_tokens");
      }
      if (!tokens) {
        queuePostReturnSync();
        return;
      }
      const [accessToken, refreshToken] = tokens;
      suppressAutoSessionRestoreRef.current = false;
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      await invoke("set_supabase_session", { accessToken, refreshToken });
      await invoke("sync_license_from_supabase", getSupabaseConfigForBackend());
      await syncLicenseFromSupabase();
      await refreshCapabilities();
      await loadAuthAndPlan();
      console.log("[FRONTEND] Auth completed from focus fallback (pending tokens)");
      queuePostReturnSync();
    } catch (e) {
      console.error("[FRONTEND] Focus fallback consume_auth_tokens failed:", e);
      queuePostReturnSync();
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
    clearSyncTimers();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onWindowFocus);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  // --- License enforcement (Supabase → local ClipAgent) ---
  // Extracted license sync logic
async function syncLicenseFromSupabase() {
  if (suppressAutoSessionRestoreRef.current) {
    return;
  }
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

  const canUseQualityMode = Boolean(caps.canSetCustomExportPath || caps.canRenameClips);

  // Enforce Free = Fast only
  useEffect(() => {
    if (!canUseQualityMode && exportHQ) {
      setExportHQ(false);
    }
  }, [canUseQualityMode, exportHQ]);

  // Reset Quality-only toggles when leaving Quality
  useEffect(() => {
    if (!exportHQ) setQualityReencodeH264(false);
  }, [exportHQ]);

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
      try {
        await relaunch();
      } catch (relaunchErr) {
        console.error("Update installed but relaunch failed:", relaunchErr);
        setUpdateStatus("latest");
        setShowUpdateToast(false);
        alert("Update installed successfully. Please restart Klipprr manually to finish applying it.");
      }
    } catch (err) {
      console.error("Update install failed:", err);
      setUpdateStatus("error");
      setTimeout(() => setUpdateStatus("idle"), 4000);
    }
  }

  const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI__;

  // Check for updates on startup (desktop only). If an update exists, show a toast bottom-right.
  useEffect(() => {
    if (!isTauri) return;
    handleCheckForUpdates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTauri]);

  useEffect(() => {
    if (!isTauri) return;
    if (updateStatus === "available" && updateInfo?.version) {
      setShowUpdateToast(true);
    }
  }, [isTauri, updateStatus, updateInfo?.version]);

  return (
  <div className="h-screen min-h-dvh flex overflow-hidden bg-zinc-950 text-zinc-200">
    <LeftSidebar
      onOpenSettings={() => setShowSettings(true)}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
      email={email}
      plan={plan}
      usage={usage}
      accountLoading={accountLoading}
      isTauri={isTauri}
      updateStatus={updateStatus}
      updateInfo={updateInfo}
      onSync={async () => {
        await invoke("sync_license_from_supabase", getSupabaseConfigForBackend());
        await loadAuthAndPlan();
        await refreshCapabilities();
        await refreshUsage();
      }}
      onCheckForUpdates={handleCheckForUpdates}
      onInstallUpdate={handleInstallUpdate}
      onLogout={async () => {
        suppressAutoSessionRestoreRef.current = true;
        clearAppFeatureFlagsCache();
        setAbFlags({ subscribeCtaVariant: "control", pricingProCtaVariant: "control" });
        setSession(null);
        setLicense(null);
        setEmail(null);
        setPlan("Free");
        setAccountLoading(false);
        clearSupabaseLocalAuthStorage();
        await supabase.auth.signOut({ scope: "local" } as any);
        await invoke("clear_license_cmd");
        await refreshCapabilities();
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

    {isTauri &&
      showUpdateToast &&
      (updateStatus === "available" || updateStatus === "downloading") &&
      updateInfo?.version && (
      <div className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] rounded-md border border-zinc-800 bg-zinc-900 text-white shadow-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">
              {updateStatus === "downloading" ? "Downloading update…" : "Update available"}
            </div>
            <div className="text-xs text-zinc-300 mt-1">
              Version <span className="font-mono">{updateInfo.version}</span> is ready to install.
            </div>
          </div>
          <button
            type="button"
            className="text-zinc-400 hover:text-white text-sm"
            onClick={() => setShowUpdateToast(false)}
            aria-label="Dismiss update notification"
          >
            ✕
          </button>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 transition"
            onClick={() => setShowUpdateToast(false)}
            disabled={updateStatus === "downloading"}
          >
            Later
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-semibold text-white disabled:opacity-50 transition"
            onClick={handleInstallUpdate}
            disabled={updateStatus === "downloading"}
          >
            {updateStatus === "downloading" ? "Downloading…" : "Download & restart"}
          </button>
        </div>
        {updateInfo.body && (
          <div className="mt-3 text-xs text-zinc-300 max-h-24 overflow-auto whitespace-pre-wrap">
            {updateInfo.body}
          </div>
        )}
      </div>
    )}

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
          className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm shadow-xl"
        >
          <svg className="w-3.5 h-3.5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          <span className="flex-1 truncate text-zinc-200 font-medium text-xs" title={t.clipName}>
            {t.clipName}
          </span>
          <button
            type="button"
            onClick={() => {
              openExportFolder(t.exportDir);
              dismissExportToast(t.id);
            }}
            className="shrink-0 rounded px-2.5 py-1 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => dismissExportToast(t.id)}
            className="shrink-0 text-zinc-600 hover:text-zinc-300 p-0.5 rounded transition"
            aria-label="Dismiss"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
    </div>

    {watermarkInterstitial && (
      <WatermarkInterstitial
        open={true}
        count={watermarkInterstitial.count}
        exportDir={watermarkInterstitial.exportDir}
        onUpgrade={() => {
          setWatermarkInterstitial(null);
          trackEvent("paywall_hit", { feature: "watermark_removal" });
          setUpgradeFeature("watermark_removal");
          setUpgradeReason("feature_locked");
          setShowUpgrade(true);
        }}
        onOpenFolder={() => openExportFolder(watermarkInterstitial.exportDir)}
        onClose={() => setWatermarkInterstitial(null)}
      />
    )}

    <AccessModal
  open={showUpgrade}
  reason={upgradeReason}
  upgradeFeature={upgradeFeature}
  abFlags={abFlags}
  onClose={() => {
    setShowUpgrade(false);
    setUpgradeReason(null);
    setUpgradeFeature(null);
  }}
  onUpgraded={async () => {
    await refreshCapabilities();
    await refreshUsage();
    setShowUpgrade(false);
    setUpgradeReason(null);
    setUpgradeFeature(null);
  }}
  onUpgradeClicked={(feature) => {
    trackEvent("upgrade_clicked", { feature });
  }}
  isLoggedIn={!!session?.user?.id}
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
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-md text-sm text-zinc-300 animate-toast">
        {undoToast}
      </div>
    )}
    {exportCompleteToast && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 shadow-xl">
        <svg className="w-4 h-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
        <span className="text-zinc-200 font-medium text-sm">
          {exportCompleteToast.count} clip{exportCompleteToast.count !== 1 ? "s" : ""} exported
        </span>
        <button
          type="button"
          onClick={() => {
            openExportFolder(exportCompleteToast.exportDir);
            setExportCompleteToast(null);
          }}
          className="shrink-0 rounded px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
        >
          Open folder
        </button>
        <button
          type="button"
          onClick={() => setExportCompleteToast(null)}
          className="shrink-0 text-zinc-600 hover:text-zinc-300 p-0.5 rounded transition"
          aria-label="Dismiss"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    )}
    {/* URL bar */}
    <div className="shrink-0 px-4 py-3 border-b border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {videoData && (
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest px-2 py-1 rounded bg-zinc-800 shrink-0">
              LIVE
            </span>
          )}
          <span className="text-zinc-600 text-sm shrink-0">URL</span>
          <input
            type="text"
            placeholder="YouTube, Twitch clips, X, Instagram, or video URL…"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!loading) {
                  loadVideo();
                }
              }
            }}
            className="flex-1 min-w-0 max-w-xl px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder-zinc-600 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 outline-none transition"
            suppressHydrationWarning
          />
        </div>
        <button
          onClick={loadVideo}
          disabled={loading}
          className="px-4 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm disabled:opacity-40 transition"
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
            className="px-4 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium text-sm disabled:opacity-40 transition"
          >
            Load local file
          </button>
        )}
      </div>
      {loading && (
        <div className="max-w-5xl mx-auto mt-2 space-y-1.5">
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${loadProgress}%`,
                background: "linear-gradient(90deg, #7c3cff 0%, #c935ff 60%, #ff2e92 100%)",
              }}
            />
          </div>
          <p className="text-xs text-zinc-500">Resolving video…</p>
        </div>
      )}
      <p className="text-[11px] text-zinc-600 mt-1.5">YouTube · Twitch clips · X · Instagram Reels · Vimeo · Direct video URLs</p>
    </div>

    {resolveError && (
      <div className="mx-4 mt-3 rounded-md border border-zinc-700 bg-zinc-900 p-3 text-sm">
        <div className="font-semibold text-zinc-300 mb-1">Can’t load this video</div>
        <div className="text-zinc-400 text-xs">{resolveError}</div>
        <div className="mt-2 text-xs text-zinc-600">
          Workaround: record your screen with OBS or macOS screen recording, then use Load local file.
        </div>
      </div>
    )}

    {/* Skeleton workspace — shown while resolving a URL for the first time */}
    {loading && !videoData && (
      <div className="flex-1 min-h-0 flex flex-row min-w-0 overflow-hidden">
        <div className="flex flex-col min-[1200px]:flex-row gap-4 p-4 flex-1 min-h-0 min-w-0">
          {/* Video + timeline skeleton */}
          <div className="flex flex-col min-h-[280px] min-[1200px]:min-h-0 min-w-0 flex-1 min-[1200px]:min-w-[300px] rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden shrink-0">
            {/* Title bar */}
            <div className="px-3 pt-2.5 pb-2 shrink-0">
              <div className="h-2.5 w-44 rounded-full bg-zinc-800 skeleton-shimmer" />
            </div>
            {/* Video area */}
            <div className="flex-1 min-h-0 bg-zinc-900 skeleton-shimmer flex items-center justify-center">
              <svg className="w-10 h-10 text-zinc-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            {/* Timeline skeleton */}
            <div className="shrink-0 p-2 border-t border-zinc-800">
              <div className="h-8 rounded bg-zinc-900 skeleton-shimmer" />
            </div>
            {/* Controls skeleton */}
            <div className="shrink-0 p-3 border-t border-zinc-800 flex gap-2">
              <div className="h-7 w-24 rounded bg-zinc-800 skeleton-shimmer" />
              <div className="h-7 w-16 rounded bg-zinc-800 skeleton-shimmer" />
            </div>
          </div>
          {/* Clips panel skeleton */}
          <div className="w-72 flex flex-col rounded-md border border-zinc-800 bg-zinc-950 shrink-0 overflow-hidden">
            <div className="px-3 pt-3 pb-2 border-b border-zinc-800 shrink-0">
              <div className="h-2.5 w-16 rounded-full bg-zinc-800 skeleton-shimmer" />
            </div>
            <div className="flex-1 p-3 space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-8 flex-1 rounded bg-zinc-900 skeleton-shimmer" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Workspace: fill height; export panel fixed on right when open (never clipped); clips panel can shrink */}
    {videoData && (
      <div className="flex-1 min-h-0 flex flex-row min-w-0 overflow-hidden">
        {/* Content area: video + clips; scrolls horizontally when export open and narrow */}
        <div className="flex flex-col min-[1200px]:flex-row gap-4 p-4 flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-hidden min-[1200px]:min-w-0">
          {/* Video + timeline: fills space */}
          <div className="flex flex-col min-h-[280px] min-[1200px]:min-h-0 min-w-0 flex-1 min-[1200px]:min-w-[300px] rounded-md border border-zinc-800 bg-zinc-950 shrink-0">
            <h2 className="text-xs font-medium text-zinc-600 px-3 pt-2 truncate shrink-0" title={videoData.title}>
              {videoData.title}
            </h2>
            <div className="relative flex-1 min-h-0 w-full">
              {/* TikTok preview: show spinner while yt-dlp downloads the cached preview */}
              {ytPreviewLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-900 rounded gap-2">
                  <svg className="w-5 h-5 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                  <span className="text-xs text-zinc-400">Preparing preview…</span>
                </div>
              )}
              <VideoViewport
                src={(() => {
                  if (!isTauri || !videoData.previewUrl) return videoData.previewUrl;
                  const isRemote =
                    videoData.previewUrl.startsWith("http://") ||
                    videoData.previewUrl.startsWith("https://");
                  const isAlreadyLocal = videoData.previewUrl.includes("/local-preview");

                  // PCM local file: when the background HQ proxy (720p H.264) is ready,
                  // swap to it so seeks and scrubbing are smooth instead of laggy.
                  if (
                    isAlreadyLocal &&
                    videoData.previewUrl.includes("pcm_fix=1") &&
                    pcmHqProxyUrl
                  ) {
                    return pcmHqProxyUrl;
                  }

                  if (!isRemote || isAlreadyLocal) return videoData.previewUrl;

                  // TikTok: use locally-cached yt-dlp preview (CDN URLs fail in WKWebView)
                  const isTikTok =
                    resolvedUrl?.includes("tiktok.com") || resolvedUrl?.includes("tiktokcdn.com");
                  if (isTikTok) {
                    if (!ytPreviewPath) return null; // loading or failed → VideoViewport shows placeholder
                    return `${CLIPAGENT_HTTP}/local-preview?path=${encodeURIComponent(ytPreviewPath)}`;
                  }

                  // HLS: WKWebView handles .m3u8 natively; proxying breaks segment resolution
                  if (videoData.previewUrl.includes("m3u8")) return videoData.previewUrl;

                  // Everything else: proxy through ClipAgent so WKWebView can seek (Range support)
                  return `${CLIPAGENT_HTTP}/preview-stream?url=${encodeURIComponent(videoData.previewUrl)}`;
                })()}
                videoKey={videoData.id}
                currentTime={currentTime}
                debugInfo={{
                  isLocal: Boolean(localFilePath),
                  audioCodec: (videoData as any)?.raw?.audio_codec ?? null,
                }}
                onTimeUpdate={(t) => {
                  if (Date.now() - programmaticSeekAtRef.current < 250) return;
                  if (t === 0 && currentTimeRef.current > 1) return;
                  setCurrentTime(t);
                }}
              />
            </div>
            <div className="shrink-0 p-2 border-t border-zinc-800">
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
            <div className="shrink-0 p-3 flex flex-wrap gap-2 border-t border-zinc-800">
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
                      const clipDuration = Math.abs(t - markIn);
                      trackEvent("clip_created", {
                        source_type: localFilePath ? "file" : "url",
                        clip_duration_seconds: Math.round(clipDuration),
                      });
                      if (!localStorage.getItem("klipprr-onboarding-first-trim")) {
                        localStorage.setItem("klipprr-onboarding-first-trim", "1");
                        trackEvent("onboarding_step_completed", { step: "first_trim" });
                      }
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
                  className={`px-4 py-1.5 rounded font-semibold text-sm transition ${
                    editTarget
                      ? "bg-zinc-700 cursor-not-allowed text-zinc-500"
                      : markIn === null && markOut === null
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : markIn !== null && markOut === null
                      ? "bg-red-600 hover:bg-red-500 text-white"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
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
                      className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition"
                    >
                      Apply {editTarget.field.toUpperCase()} (Enter)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditTarget(null)}
                      className="px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm transition"
                    >
                      Cancel (Esc)
                    </button>
                  </div>
                )}
              </div>
          </div>

          {/* Clips panel: fills height in column mode (no gap below); can shrink (min 200px) in row so Export never clipped */}
          <div className={`flex flex-col min-w-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 flex-1 min-h-0 min-[1200px]:flex-initial min-[1200px]:shrink-0 ${exportPanelOpen ? "min-[1200px]:w-80 min-[1200px]:min-w-[200px] min-[1200px]:max-w-[320px]" : "min-[1200px]:w-80"}`}>
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
                onUpgradeRequested={() => {
                  trackEvent("paywall_hit", { feature: "rename_clips" });
                  setUpgradeFeature("rename_clips");
                  setUpgradeReason("feature_locked");
                  setShowUpgrade(true);
                }}
              />
            </div>
            {!exportPanelOpen && (
              <div className="shrink-0 p-3 pt-0 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setExportPanelOpen(true)}
                  className="btn-brand w-full py-2.5 rounded flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Export
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Export panel: fixed on the right, never clipped (clips panel shrinks first on narrow screens) */}
        {exportPanelOpen && (
          <div className="w-96 flex-shrink-0 flex flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 self-stretch">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <span className="text-sm font-semibold text-zinc-200">Export Settings</span>
              <button
                type="button"
                onClick={() => setExportPanelOpen(false)}
                className="p-1.5 rounded text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 transition"
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
                resolvedUrl={resolvedUrl}
                localFilePath={localFilePath}
                videoData={videoData}
                exportHQ={exportHQ}
                setExportHQ={setExportHQ}
                canUseQualityMode={canUseQualityMode}
                qualityReencodeH264={qualityReencodeH264}
                setQualityReencodeH264={setQualityReencodeH264}
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
                hasWatermark={caps.hasWatermark && plan === "Free"}
                clipsRemaining={plan === "Free" ? (usage?.remaining ?? null) : null}
                onExportPathChosen={async (path) => {
                  try {
                    await invoke("set_export_path", { path });
                  } catch (e) {
                    console.warn("Persist export path failed:", e);
                  }
                }}
                onUpgradeRequested={(feature) => {
                  trackEvent("paywall_hit", { feature });
                  setUpgradeFeature(feature);
                  setUpgradeReason("feature_locked");
                  setShowUpgrade(true);
                }}
                onBeforeExport={reserveExportQuota}
                onExportReservationStart={(clipCount) => {
                  savePendingReservation(clipCount);
                }}
                onExportClipSettled={() => {
                  const pending = readPendingReservation();
                  if (pending <= 0) return;
                  savePendingReservation(pending - 1);
                }}
                onExportReservationComplete={() => {
                  savePendingReservation(0);
                  refreshUsage();
                }}
                onExportComplete={(count, exportDir, hadWatermark, totalDurationSeconds) => {
                  posthog.capture("clip_exported", {
                    clip_count: count,
                    had_watermark: hadWatermark,
                    plan: plan,
                  });
                  const quality = exportHQ ? "quality" : "speed";
                  trackEvent("clip_exported", {
                    clip_count: count,
                    quality,
                    clip_duration_seconds: Math.round(totalDurationSeconds),
                  });
                  if (!localStorage.getItem("klipprr-first-export-done")) {
                    localStorage.setItem("klipprr-first-export-done", "1");
                    trackEvent("first_export", {
                      clip_count: count,
                      quality,
                      clip_duration_seconds: Math.round(totalDurationSeconds),
                    });
                  }
                  if (hadWatermark) {
                    setWatermarkInterstitial({ count, exportDir });
                  } else {
                    setExportCompleteToast({ count, exportDir });
                    setTimeout(() => setExportCompleteToast(null), 12000);
                  }
                }}
                onExportFailed={(errorType) => {
                  trackEvent("export_failed", { error_type: errorType });
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
