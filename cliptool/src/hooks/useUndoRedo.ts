import { useState } from "react";

export type EditorSnapshot<TClip> = {
  clips: TClip[];
  markIn: number | null;
  markOut: number | null;
};

export function useUndoRedo<TClip>({
  clips,
  markIn,
  markOut,
  setClips,
  setMarkIn,
  setMarkOut,
  setSelectedClipIds,
  setEditTarget,
}: {
  clips: TClip[];
  markIn: number | null;
  markOut: number | null;
  setClips: (v: TClip[]) => void;
  setMarkIn: (v: number | null) => void;
  setMarkOut: (v: number | null) => void;
  setSelectedClipIds: (v: string[]) => void;
  setEditTarget: (v: any) => void;
}) {
  const [history, setHistory] = useState<EditorSnapshot<TClip>[]>([]);
  const [future, setFuture] = useState<EditorSnapshot<TClip>[]>([]);
  const [undoToast, setUndoToast] = useState<string | null>(null);

  function showUndoToast(msg: string) {
    setUndoToast(msg);
    setTimeout(() => setUndoToast(null), 1200);
  }

  function pushHistory() {
    setHistory(prev => {
      const next = [...prev, { clips, markIn, markOut }];
      return next.length > 20 ? next.slice(1) : next;
    });
    setFuture([]);
  }

  function undo() {
    setHistory(prev => {
      if (prev.length === 0) return prev;

      const last = prev[prev.length - 1];

      setFuture(f => [{ clips, markIn, markOut }, ...f]);

      setClips(last.clips);
      setMarkIn(last.markIn);
      setMarkOut(last.markOut);
      setSelectedClipIds([]);
      setEditTarget(null);

      showUndoToast("Undo");
      return prev.slice(0, -1);
    });
  }

  function redo() {
    setFuture(prev => {
      if (prev.length === 0) return prev;

      const [next, ...rest] = prev;

      setHistory(h => [...h, { clips, markIn, markOut }]);

      setClips(next.clips);
      setMarkIn(next.markIn);
      setMarkOut(next.markOut);
      setSelectedClipIds([]);
      setEditTarget(null);

      showUndoToast("Redo");
      return rest;
    });
  }

  return {
   undo,
   redo,
    pushHistory,
   undoToast,
   showUndoToast,
   history,
   future,
 };
}