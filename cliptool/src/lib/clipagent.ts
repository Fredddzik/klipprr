// src/lib/clipagent.ts
// Single source of truth for talking to the local ClipAgent

export const CLIPAGENT_HTTP = "http://localhost:4000";
export const CLIPAGENT_HTTPS = "https://localhost:4001";


let ACTIVE_BASE: string | null = null;

// Dev UI detection: allow HTTP in dev (localhost), require HTTPS in prod (Vercel)
const IS_DEV_UI =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

export type AgentState = "checking" | "offline" | "untrusted" | "online";

export type AgentResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; agentState?: AgentState; status?: number };

type FetchOpts = RequestInit & { timeoutMs?: number };

async function fetchWithTimeout(url: string, opts: FetchOpts = {}) {
  const { timeoutMs = 4000, ...rest } = opts;
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal });
    return res;
  } finally {
    window.clearTimeout(t);
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
  // --- Correct detection order ---
  // HTTP answers the only question we can reliably ask:
  //   "Is anything listening on localhost?"
  // Only after HTTP succeeds does it make sense to talk about HTTPS trust.

  // 1) Try HTTP first
  try {
    const httpRes = await fetchWithTimeout(`${CLIPAGENT_HTTP}/ping`, {
      method: "GET",
      cache: "no-store",
      timeoutMs: 1500,
    });

    if (!httpRes.ok) {
      // Something is listening, but it isn't a healthy agent.
      return {
        ok: false,
        state: "offline",
        base: CLIPAGENT_HTTP,
        error: `ping_http_${httpRes.status}`,
      };
    }

    // Agent is definitely running (at least via HTTP). Now test HTTPS.

    try {
      const httpsRes = await fetchWithTimeout(`${CLIPAGENT_HTTPS}/ping`, {
        method: "GET",
        cache: "no-store",
        timeoutMs: 1200,
      });

      if (httpsRes.ok) {
        ACTIVE_BASE = CLIPAGENT_HTTPS;
        return { ok: true, state: "online", base: CLIPAGENT_HTTPS };
      }

      // HTTPS reachable but not OK — treat as offline-ish, but we still know agent is running.
      // In practice this should be rare; keep state offline to avoid misleading "trust" prompts.
      return {
        ok: false,
        state: "offline",
        base: CLIPAGENT_HTTPS,
        error: `ping_https_${httpsRes.status}`,
      };
    } catch {
      // HTTPS threw (very commonly: cert not trusted). Since HTTP was OK, the agent IS running.
      return {
        ok: false,
        state: "untrusted",
        base: CLIPAGENT_HTTPS,
        error: "https_untrusted_or_blocked",
      };
    }
  } catch {
    // 2) If HTTP fails, still allow HTTPS-only agents (edge case)
    try {
      const httpsRes = await fetchWithTimeout(`${CLIPAGENT_HTTPS}/ping`, {
        method: "GET",
        cache: "no-store",
        timeoutMs: 1500,
      });

      if (httpsRes.ok) {
        ACTIVE_BASE = CLIPAGENT_HTTPS;
        return { ok: true, state: "online", base: CLIPAGENT_HTTPS };
      }

      return {
        ok: false,
        state: "offline",
        base: CLIPAGENT_HTTPS,
        error: `ping_https_${httpsRes.status}`,
      };
    } catch {
      // Both failed: nothing is listening.
      return { ok: false, state: "offline", error: "ping_failed" };
    }
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
  preview?: { url: string };
  best?: { url: string };
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

  if (!previewUrl) return null;
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
    previewUrl: String(previewUrl),
    capabilities: caps,
    raw,
  };
}

export async function resolveVideo(url: string): Promise<AgentResult<ResolvedVideo>> {
  try {
    // Always use HTTPS base for resolve, unless in dev UI
    const base = IS_DEV_UI ? CLIPAGENT_HTTP : CLIPAGENT_HTTPS;
    const res = await fetchWithTimeout(
      `${base}/resolve?url=${encodeURIComponent(url)}`,
      { method: "GET", timeoutMs: 20000 }
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
      return { ok: false, error: String(json.error) };
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
  url: string;
  clips: ClipSpec[];
  mode: "speed" | "quality";
  fast_max_height: number | null;
  keep_full: boolean;
  preview_url: string | null;
  video_id: string | null;
  export_path: string | null;
  has_watermark?: boolean;
}

export interface DownloadAllResponse {
  ok?: boolean;
  error?: string;
  results?: any[];
}

export async function downloadAll(
  payload: DownloadAllPayload
): Promise<AgentResult<DownloadAllResponse>> {
  try {
    const base = IS_DEV_UI ? CLIPAGENT_HTTP : CLIPAGENT_HTTPS;
    const res = await fetchWithTimeout(`${base}/download-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 120000,
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