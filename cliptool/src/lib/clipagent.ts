// src/lib/clipagent.ts
// Single source of truth for talking to the local ClipAgent

export const CLIPAGENT_HTTP = "http://localhost:4000";
export const CLIPAGENT_HTTPS = "https://localhost:4001";


// Dev UI detection: allow HTTP in dev (localhost), require HTTPS in prod (Vercel)
const IS_DEV_UI =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

export type AgentState = "checking" | "offline" | "untrusted" | "online";

export type AgentResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; agentState?: AgentState; status?: number; details?: string };

type FetchOpts = RequestInit & { timeoutMs?: number; signal?: AbortSignal };

async function fetchWithTimeout(url: string, opts: FetchOpts = {}) {
  const { timeoutMs = 4000, signal: externalSignal, ...rest } = opts;
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);

  // If an external signal is provided, also abort our controller when it fires.
  let externalAbortListener: (() => void) | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      window.clearTimeout(t);
      ctrl.abort();
    } else {
      externalAbortListener = () => ctrl.abort();
      externalSignal.addEventListener("abort", externalAbortListener);
    }
  }

  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal });
    return res;
  } finally {
    window.clearTimeout(t);
    if (externalSignal && externalAbortListener) {
      externalSignal.removeEventListener("abort", externalAbortListener);
    }
  }
}

/**
 * Prefer HTTPS, but allow HTTP fallback (dev / older agents).
 * Note: If HTTPS is not trusted by the browser yet, requests may fail with a network error.
 */
export function getClipAgentBases() {
  return [CLIPAGENT_HTTPS] as const;
}

// HTTPS is used ONLY for trust UI (window.open), never for fetch()
export function getPrimaryClipAgentBase() {
  return CLIPAGENT_HTTPS;
}

// For *detection* we must try HTTP first to distinguish "not running" from "untrusted TLS".
export function getPingBases() {
  return [CLIPAGENT_HTTP, CLIPAGENT_HTTPS] as const;
}


/**
 * --- Agent health ---
 * Returns a richer state than boolean:
 * - online: reachable via HTTPS or HTTP
 * - untrusted: likely HTTPS cert not trusted yet
 * - offline: agent not running
 */
export async function pingAgent(): Promise<{
  ok: boolean;
  state: AgentState;
  base?: string;
  error?: string;
}> {
  try {
    const res = await fetchWithTimeout(`${CLIPAGENT_HTTP}/ping`, {
      method: "GET",
      cache: "no-store",
      timeoutMs: 1500,
    });

    if (!res.ok) {
      return { ok: false, state: "offline", error: `ping_http_${res.status}` };
    }

    return { ok: true, state: "online", base: CLIPAGENT_HTTP };
  } catch {
    return { ok: false, state: "offline", error: "ping_failed" };
  }
}

/**
 * --- Resolve video metadata + preview ---
 */
export interface ResolveResponse {
  id: string;
  title: string;
  duration: number;
  thumbnail?: string;
  preview?: {
    url: string;
    /** Set when the source has no muxed format (YouTube is DASH-only as of 2026) and
     *  the preview must be merged locally via /yt-preview-cache instead of streamed. */
    requires_local_preview?: boolean;
    /** Height of a locally merged preview worth fetching in the background, or 0 when
     *  `url` already is the best preview the source offers. Non-zero on YouTube, whose
     *  only muxed rendition is 360p while separate H.264 streams reach 720p+. */
    local_upgrade_height?: number;
  };
  best?: { url: string };
  /** Local-only diagnostic: detected audio codec from ffprobe (e.g. pcm_s16le, lpcm). */
  audio_codec?: string | null;
  capabilities?: {
    fast_max_height: number;
    true_max_height: number;
    true_max_requires_reencode: boolean;
  };
  error?: string;
  details?: any;
}

export interface ResolvedVideo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string | null;
  previewUrl: string;
  /** True when previewUrl is empty because no directly playable format exists and the
   *  preview has to be built locally. */
  requiresLocalPreview: boolean;
  /** Height to fetch a better preview at in the background, or 0 when previewUrl is
   *  already the best available. */
  localUpgradeHeight: number;
  capabilities: {
    fastMaxHeight: number;
    trueMaxHeight: number;
    trueMaxRequiresReencode: boolean;
  } | null;
  raw: ResolveResponse;
}

function normalizeResolve(raw: ResolveResponse): ResolvedVideo | null {
  const previewUrl =
    raw.preview?.url ??
    raw.best?.url ??
    null;

  const requiresLocalPreview = Boolean(raw.preview?.requires_local_preview);
  const localUpgradeHeight = Number(raw.preview?.local_upgrade_height ?? 0) || 0;

  // An empty preview URL is expected when the source is DASH-only: the app builds a
  // merged preview locally instead. Only bail out when there is no fallback either.
  if (!previewUrl && !requiresLocalPreview) return null;
  if (!raw.id || !raw.title || typeof raw.duration !== "number") return null;

  const caps = raw.capabilities
    ? {
        fastMaxHeight: Number(raw.capabilities.fast_max_height ?? 0),
        trueMaxHeight: Number(raw.capabilities.true_max_height ?? 0),
        trueMaxRequiresReencode: Boolean(raw.capabilities.true_max_requires_reencode),
      }
    : null;

  return {
    id: String(raw.id),
    title: String(raw.title),
    duration: Number(raw.duration),
    thumbnail: raw.thumbnail ? String(raw.thumbnail) : null,
    previewUrl: previewUrl ? String(previewUrl) : "",
    requiresLocalPreview,
    localUpgradeHeight,
    capabilities: caps,
    raw,
  };
}

export async function resolveVideo(url: string): Promise<AgentResult<ResolvedVideo>> {
  try {
    // Always use HTTPS base for resolve, unless in dev UI
    const base = CLIPAGENT_HTTP;
    const res = await fetchWithTimeout(
      `${base}/resolve?url=${encodeURIComponent(url)}`,
      // A cookie-less YouTube resolve enumerates every client's formats and regularly
      // takes 15-20s on its own. At the old 20s budget those aborted and were reported as
      // "ClipAgent is offline", which sent people looking in entirely the wrong place.
      { method: "GET", timeoutMs: 45000 }
    );

    const status = res.status;
    const text = await res.text();

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: "resolve_bad_json" };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: json?.error ?? `resolve_http_${status}`,
        status,
        agentState: "offline",
      };
    }

    if (json?.error) {
      return {
        ok: false,
        error: String(json.error),
        details: typeof json.details === "string" ? json.details : undefined,
      };
    }

    const normalized = normalizeResolve(json as ResolveResponse);
    if (!normalized) {
      return { ok: false, error: "resolve_bad_payload" };
    }

    return { ok: true, data: normalized };
  } catch {
    return { ok: false, error: "resolve_fetch_failed", agentState: "offline" };
  }
}

/**
 * --- Export clips ---
 */
export interface ClipSpec {
  id: string;
  start: number;
  end: number;
  name: string;
}

export interface DownloadAllPayload {
  /** Client-generated export id to correlate progress events. */
  client_export_id?: string | null;
  /** Video title for naming whole-video export (when keep_full). */
  source_title?: string | null;
  /** Quality mode: force re-encode to H.264 for maximum compatibility (slower). */
  quality_reencode_h264?: boolean;
  url: string;
  /** When set, backend uses this file as source instead of url (local file clipping). */
  local_path?: string | null;
  clips: ClipSpec[];
  mode: "speed" | "quality";
  fast_max_height: number | null;
  keep_full: boolean;
  preview_url: string | null;
  video_id: string | null;
  export_path: string | null;
  has_watermark?: boolean;
  codec?: "universal" | "original";
}

export interface DownloadAllResponse {
  ok?: boolean;
  error?: string;
  results?: any[];
  /** Export folder path (when ok). */
  export_dir?: string | null;
}

export async function downloadAll(
  payload: DownloadAllPayload,
  opts?: { signal?: AbortSignal }
): Promise<AgentResult<DownloadAllResponse>> {
  try {
    const base = CLIPAGENT_HTTP;
    // Quality mode can take a long time (full download + merge + cut). Keep the request alive
    // to avoid UI flipping to "connection lost" even though the backend continues.
    const timeoutMs =
      payload.mode === "quality" ? 45 * 60 * 1000 : 15 * 60 * 1000;
    const res = await fetchWithTimeout(`${base}/download-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs,
      signal: opts?.signal,
    });

    const status = res.status;
    const text = await res.text();

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: "download_bad_json" };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: json?.error ?? `download_http_${status}`,
        status,
      };
    }

    if (json?.error) {
      return { ok: false, error: String(json.error), status };
    }

    return { ok: true, data: json as DownloadAllResponse };
  } catch {
    return { ok: false, error: "download_fetch_failed", agentState: "offline" };
  }
}

/**
 * --- TLS trust helper ---
 * Used only to intentionally trigger browser trust UI
 */
export function openTrustPage() {
  window.open(`${getPrimaryClipAgentBase()}/ping`, "_blank", "noopener,noreferrer");
}