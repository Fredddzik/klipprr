import { useEffect } from "react";

export function useKeyboardShortcuts({
  videoRef,
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
}: {
  videoRef: () => HTMLVideoElement | null;
  clips: any[];
  markIn: number | null;
  setMarkIn: (v: number | null) => void;
  setMarkOut: (v: number | null) => void;
  setClips: (fn: (prev: any[]) => any[]) => void;
  editTarget: any;
  setEditTarget: (v: any) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  showUndoToast: (msg: string) => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isTyping =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA");

      // Undo / Redo (allowed everywhere)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }

      // Apply / Cancel edit (works even if input lost focus)
      if (editTarget) {
        if (e.key === "Escape") {
          e.preventDefault();
          setEditTarget(null);
          showUndoToast("Edit cancelled");
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();

          const video = videoRef();
          if (video && editTarget?.clipId && editTarget?.field) {
            const t = video.currentTime;
            pushHistory();
            setClips(prev =>
              prev
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
                .sort((a, b) => a.start - b.start)
            );
          }

          // Force commit by blurring active input (rename, etc.)
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }

          setEditTarget(null);
          showUndoToast("Edit applied");
          return;
        }
      }

      // If typing and not editing, ignore shortcuts
      if (isTyping) return;

      const video = videoRef();
      if (!video) return;

      const stepSize = 5;
      // Treat "1 frame" as ~30fps for deterministic stepping
      const frameStep = 1 / 30;

      // Play / Pause
      if (e.code === "Space") {
        e.preventDefault();
        video.paused ? video.play() : video.pause();
        return;
      }

      // Seek
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        video.currentTime = Math.max(
          0,
          video.currentTime - (e.metaKey || e.ctrlKey ? frameStep : stepSize)
        );
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        video.currentTime = Math.min(
          video.duration,
          video.currentTime + (e.metaKey || e.ctrlKey ? frameStep : stepSize)
        );
        return;
      }

     // Mark IN / OUT toggle (M)
if (!editTarget && e.key.toLowerCase() === "m") {
  e.preventDefault();

  const t = video.currentTime;

  // No marks → set IN
  if (markIn === null) {
    pushHistory();
    setMarkIn(t);
    showUndoToast("Mark IN");
    return;
  }

  // IN exists → set OUT + create clip
  pushHistory();
  setClips(prev => {
    const start = Math.min(markIn, t);
    const end = Math.max(markIn, t);

    return [...prev, {
      id: crypto.randomUUID(),
      start,
      end,
      name: `Clip ${prev.length + 1}`,
    }].sort((a, b) => a.start - b.start);
  });

  setMarkIn(null);
  setMarkOut(null);
  showUndoToast("Clip created");
  return;
}
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [
    markIn,
    editTarget,
    undo,
    redo,
    pushHistory,
    setClips,
    setMarkIn,
    setMarkOut,
    setEditTarget,
    showUndoToast,
  ]);
}