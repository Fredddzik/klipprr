import { invoke } from "@tauri-apps/api/core";

export const SUPPORT_EMAIL = "hello@klipprr.com";

/**
 * Opens a draft email to support with the app version, OS and yt-dlp version filled in
 * (built by the agent, support.rs). `context` is what was on screen: the error and the
 * link that failed. Nothing is sent until the user sends it themselves.
 */
export async function contactSupport(subject?: string, context?: string): Promise<void> {
  try {
    await invoke("open_support_email", { subject: subject ?? null, context: context ?? null });
  } catch {
    // Outside the desktop app (or an agent too old to have the command): a plain draft.
    const body = context ? `\n\n\n---\n${context}` : "";
    window.location.href =
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject ?? "Klipprr support")}` +
      `&body=${encodeURIComponent(body)}`;
  }
}

/** Offers to email support after an export problem. alert() cannot hold a link, so this
 *  asks instead, and opens the pre-filled email on OK. */
export function offerSupportAfter(message: string, subject: string, context: string): void {
  if (window.confirm(`${message}\n\nEmail us about it? We'll get the details we need to fix it.`)) {
    void contactSupport(subject, context);
  }
}
