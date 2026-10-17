import { useEffect } from "react";

export function useKeyboardShortcuts({
  videoRef,
  onProgrammaticSeek,
  clips,
  markIn,
  markOut,
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
  onProgrammaticSeek?: (t: number) => void;
  clips: any[];
  markIn: number | null;
  /** Set together with markIn after the Mark OUT button made a clip; the range stays on
   *  the timeline, but no clip is open any more. */
  markOut?: number | null;
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

      // Undo / Redo (editor). When typing in an input/textarea, let the browser handle Cmd+Z / Cmd+Y
      if (!isTyping && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (!isTyping && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
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
        const next = Math.max(
          0,
          video.currentTime - (e.metaKey || e.ctrlKey ? frameStep : stepSize)
        );
        video.currentTime = next;
        onProgrammaticSeek?.(next);
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(
          video.duration,
          video.currentTime + (e.metaKey || e.ctrlKey ? frameStep : stepSize)
        );
        video.currentTime = next;
        onProgrammaticSeek?.(next);
        return;
      }

      const plainKey = !e.metaKey && !e.ctrlKey && !e.altKey;
      const openIn = markOut == null ? markIn : null;

      // I / O: the in and out keys every editor uses. I (re)sets the start, O closes the clip.
      if (!editTarget && plainKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        pushHistory();
        setMarkIn(video.currentTime);
        setMarkOut(null);
        showUndoToast("Mark IN");
        return;
      }

      if (!editTarget && plainKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        if (openIn === null) {
          showUndoToast("Press I to mark the start first");
          return;
        }
        const t = video.currentTime;
        if (Math.abs(t - openIn) < 0.05) {
          showUndoToast("Move the playhead past the IN point");
          return;
        }
        pushHistory();
        setClips(prev => {
          const start = Math.min(openIn, t);
          const end = Math.max(openIn, t);
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

     // Mark IN / OUT toggle (M)
if (!editTarget && e.key.toLowerCase() === "m") {
  e.preventDefault();

  const t = video.currentTime;

  // No open IN → set IN
  if (openIn === null) {
    pushHistory();
    setMarkIn(t);
    setMarkOut(null);
    showUndoToast("Mark IN");
    return;
  }

  // IN exists → set OUT + create clip
  pushHistory();
  setClips(prev => {
    const start = Math.min(openIn, t);
    const end = Math.max(openIn, t);

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
    markOut,
    editTarget,
    undo,
    redo,
    pushHistory,
    setClips,
    setMarkIn,
    setMarkOut,
    setEditTarget,
    showUndoToast,
    onProgrammaticSeek,
  ]);
}