"use client";

import { useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { supabase } from "@/lib/supabase";
import {
  ANALYTICS_AVAILABLE,
  analyticsAllowed,
  identifyUser,
  onAnalyticsConsentChange,
  setAnalyticsContext,
  startAnalytics,
  track,
} from "@/lib/analytics";

/** Starts analytics once the user has opted in, and ties events to the signed-in account. */
function AnalyticsBridge() {
  useEffect(() => {
    if (!ANALYTICS_AVAILABLE) return;
    let cancelled = false;
    const platform = navigator.userAgent.toLowerCase().includes("win") ? "windows" : "mac";
    setAnalyticsContext({ platform });

    const identifyCurrent = () =>
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) identifyUser({ id: session.user.id, email: session.user.email ?? null });
      });

    const begin = async () => {
      if (!analyticsAllowed()) return;
      try {
        const version = await getVersion();
        if (!cancelled) setAnalyticsContext({ app_version: version });
      } catch {
        // Not in Tauri (dev in a browser): no version.
      }
      startAnalytics();
      await identifyCurrent();
    };

    begin().then(() => track("app_opened"));
    const offConsent = onAnalyticsConsentChange(() => {
      if (analyticsAllowed()) void begin();
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      identifyUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
    });
    return () => {
      cancelled = true;
      offConsent();
      subscription.unsubscribe();
    };
  }, []);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnalyticsBridge />
      {children}
    </>
  );
}
