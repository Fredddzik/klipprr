import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check as checkForUpdate } from "@tauri-apps/plugin-updater";

export type UpdateStatus = "idle" | "checking" | "latest" | "available" | "downloading" | "error";
export type UpdateInfo = { version: string; body?: string };
export type UpdateProgress = { phase: string; received: number; total: number };

/** Checks for an update on launch and installs it through the agent (updates.rs). */
export function useAppUpdate(isTauri: boolean) {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const updateRef = useRef<Awaited<ReturnType<typeof checkForUpdate>> | null>(null);
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  /** Live progress of an update download, reported by the agent (updates.rs). */
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);

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
    if (!updateRef.current) return;
    setUpdateStatus("downloading");
    setUpdateProgress(null);
    setShowUpdateToast(true);
    // Downloaded and installed by the agent, which reports progress, restarts a stalled
    // download, and relaunches the app itself when done.
    const unlisten = await listen<UpdateProgress>("update-progress", (e) =>
      setUpdateProgress(e.payload)
    );
    try {
      await invoke("install_update");
    } catch (err) {
      console.error("Update install failed:", err);
      setUpdateStatus("error");
      setUpdateProgress(null);
    } finally {
      unlisten();
    }
  }

  // Check for updates on startup (desktop only). If an update exists, show a toast bottom-right.
  useEffect(() => {
    if (!isTauri) return;
    handleCheckForUpdates();
  }, [isTauri]);

  useEffect(() => {
    if (!isTauri) return;
    if (updateStatus === "available" && updateInfo?.version) {
      setShowUpdateToast(true);
    }
  }, [isTauri, updateStatus, updateInfo?.version]);

  return {
    updateStatus,
    updateInfo,
    updateProgress,
    showUpdateToast,
    setShowUpdateToast,
    handleCheckForUpdates,
    handleInstallUpdate,
  };
}
