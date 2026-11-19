import posthog from "posthog-js";

/**
 * Product analytics for the desktop app (PostHog, the same project as klipprr.com).
 *
 * Opt-in only. Nothing loads and nothing is sent until the user says yes on the consent
 * card (ConsentCard) or in Settings; "No" is as easy as "Yes" and can be changed any
 * time. The privacy policy (klipprr-web, section 3) describes exactly what is sent:
 *
 *  - what the user does: links loaded, clips marked, exports, upgrades, errors;
 *  - links with their query string and fragment removed (YouTube keeps v and t), so
 *    share ids, tracking tags and signed tokens never leave the Mac;
 *  - for local files only the extension, length and codecs, never a path or file name;
 *  - timings (how long a link took to resolve, the preview to show, an export to run);
 *  - the account id, email and plan once signed in.
 *
 * Release builds get the key from the NEXT_PUBLIC_POSTHOG_KEY repository variable
 * (release.yml); without it every call here does nothing.
 */

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const CONSENT_KEY = "klipprr-analytics-consent";
const CONSENT_EVENT = "klipprr-analytics-consent-changed";

export type AnalyticsConsent = "granted" | "denied" | null;

/** False in builds without a PostHog key: no consent card, no Settings switch. */
export const ANALYTICS_AVAILABLE = POSTHOG_KEY.length > 0;

let started = false;
let superProps: Record<string, unknown> = {};

export function getAnalyticsConsent(): AnalyticsConsent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function analyticsAllowed(): boolean {
  return ANALYTICS_AVAILABLE && getAnalyticsConsent() === "granted";
}

export function setAnalyticsConsent(consent: "granted" | "denied"): void {
  try {
    localStorage.setItem(CONSENT_KEY, consent);
  } catch {
    // Storage blocked: the choice lasts for this launch only.
  }
  if (consent === "granted") {
    startAnalytics();
    track("analytics_opted_in");
  } else if (started) {
    posthog.opt_out_capturing();
    posthog.reset();
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function onAnalyticsConsentChange(cb: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, cb);
  return () => window.removeEventListener(CONSENT_EVENT, cb);
}

/** Loads PostHog, only after consent. Safe to call more than once. */
export function startAnalytics(): void {
  if (typeof window === "undefined" || !analyticsAllowed()) return;
  if (started) {
    posthog.opt_in_capturing();
    return;
  }
  started = true;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    persistence: "localStorage",
    // Only the events below. No clicks, page views, replays or surveys.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_external_dependency_loading: true,
  });
  posthog.opt_in_capturing();
  posthog.register({ app: "desktop", ...superProps });
}

/** Properties sent with every event (app version, platform, plan). */
export function setAnalyticsContext(props: Record<string, unknown>): void {
  superProps = { ...superProps, ...props };
  if (started && analyticsAllowed()) posthog.register(props);
}

export function identifyUser(user: { id: string; email: string | null; plan?: string } | null): void {
  if (!started || !analyticsAllowed()) return;
  if (!user) {
    posthog.reset();
    posthog.register({ app: "desktop", ...superProps });
    return;
  }
  posthog.identify(user.id, { email: user.email, ...(user.plan ? { plan: user.plan } : {}) });
}

export function track(event: string, props: Record<string, unknown> = {}): void {
  if (!started || !analyticsAllowed()) return;
  posthog.capture(event, props);
}

export type LinkSource = "youtube" | "twitch" | "x" | "instagram" | "tiktok" | "vimeo" | "kick" | "other";

/** Which platform a link is from, and the link without anything personal in it. */
export function describeLink(raw: string): { source: LinkSource; url: string | null } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { source: "other", url: null };
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const is = (...domains: string[]) => domains.some((d) => host === d || host.endsWith("." + d));
  const source: LinkSource = is("youtube.com", "youtu.be")
    ? "youtube"
    : is("twitch.tv")
    ? "twitch"
    : is("x.com", "twitter.com")
    ? "x"
    : is("instagram.com")
    ? "instagram"
    : is("tiktok.com")
    ? "tiktok"
    : is("vimeo.com")
    ? "vimeo"
    : is("kick.com")
    ? "kick"
    : "other";
  const keep = new URLSearchParams();
  if (source === "youtube") {
    for (const k of ["v", "t"]) {
      const v = u.searchParams.get(k);
      if (v) keep.set(k, v);
    }
  }
  const q = keep.toString();
  return { source, url: `${u.protocol}//${u.host}${u.pathname}${q ? "?" + q : ""}` };
}

/** A local file's extension, lower case, without the path or name. */
export function fileExtension(path: string): string {
  const name = path.split(/[/\\]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase().slice(0, 8) : "";
}

/** An error message with home folders and file names taken out, cut to 160 characters. */
export function scrubText(text: string): string {
  return text
    .replace(/\/(Users|home)\/[^/\s"']+/g, "~")
    .replace(/[A-Za-z]:\\Users\\[^\\\s"']+/g, "~")
    .replace(/~[/\\][^"'\n]*?\.(mp4|mov|m4v|mkv|webm|avi|mp3|wav|m4a)\b/gi, "~/<file>.$1")
    .replace(/[^/\\\s"']+\.(mp4|mov|m4v|mkv|webm|avi|mp3|wav|m4a)\b/gi, "<file>.$1")
    .slice(0, 160);
}
