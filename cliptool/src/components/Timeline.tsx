"use client";

import { useEffect, useRef, useState } from "react";

function formatTimeSimple(t: number) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${m}:${String(s).padStart(2, "0")}`;
}

const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400];

interface Clip {
  id: string;
  start: number;
  end: number;
  name: string;
}

interface TimelineProps {
  duration: number;
  clips: Clip[];
  markIn: number | null;
  markOut: number | null;
  selectedClipIds: string[];
  currentTime: number;
  onSeek: (t: number) => void;
  onSelectClip: (id: string, multi: boolean) => void;
}

export default function Timeline({
  duration,
  clips,
  markIn,
  markOut,
  selectedClipIds,
  currentTime,
  onSeek,
  onSelectClip,
}: TimelineProps) {
  const [isDragging, setIsDragging] = useState(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const dragTimeRef = useRef<number | null>(null);

  function seekFromClientX(clientX: number) {
    const el = timelineRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));

    const t = pct * duration;

    // store exact drag time for UI
    dragTimeRef.current = t;

    // keep video roughly in sync (may lag slightly, acceptable)
    onSeek(t);
  }

  useEffect(() => {
    if (!isDragging) return;

    function onMove(e: MouseEvent) {
      seekFromClientX(e.clientX);
    }

    function onUp(e?: MouseEvent) {
      setIsDragging(false);
      dragTimeRef.current = null;

      if (e && timelineRef.current) {
        seekFromClientX(e.clientX);
      }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  // Tick spacing: the smallest "round" step that keeps the ruler to about eight labels,
  // so a 30-second clip and an 8-hour VOD both get a readable scale.
  const step = TICK_STEPS.find((x) => duration / x <= 8) ?? 28800;
  const ticks: number[] = [];
  if (duration > 0) {
    for (let t = 0; t < duration; t += step) ticks.push(t);
  }
  const pct = (t: number) => (duration > 0 ? `${(t / duration) * 100}%` : "0%");

  return (
    <div className="select-none">
      {/* RULER */}
      <div className="relative h-4 mb-2 font-mono text-[10px] tabular-nums text-zinc-500 pointer-events-none">
        {ticks.map((t) =>
          // A label this close to the end would run into the total on the right.
          t / duration > 0.92 ? null : (
            <span key={t} className="absolute top-0" style={{ left: pct(t) }}>
              {formatTimeSimple(t)}
            </span>
          )
        )}
        <span className="absolute top-0 right-0">{formatTimeSimple(duration)}</span>
      </div>

      <div
        ref={timelineRef}
        className={`relative h-7 bg-zinc-800 rounded-md ${
          isDragging ? "cursor-grabbing" : "cursor-pointer"
        }`}
        onMouseDown={(e) => {
          // Pressing anywhere on the track grabs the playhead: seek now, follow the drag.
          if (e.button !== 0) return;
          // preventDefault keeps the drag from selecting text, but it also keeps focus
          // where it was: in the URL field, which then swallowed I, O and Space.
          e.preventDefault();
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          setIsDragging(true);
          seekFromClientX(e.clientX);
        }}
      >
        {/* TICKS */}
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-0 h-1.5 w-px bg-zinc-600 pointer-events-none"
            style={{ left: pct(t) }}
          />
        ))}

        {/* ACTIVE RANGE */}
        {markIn !== null && markOut !== null && (
          <div
            className="absolute inset-y-1 bg-blue-500/25 rounded-[3px]"
            style={{
              left: pct(markIn),
              width: pct(markOut - markIn),
            }}
          />
        )}

        {/* CLIPS: blue, with a yellow outline on the selected one. */}
        {clips.map((c) => {
          const selected = selectedClipIds.includes(c.id);
          return (
            <div
              key={c.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectClip(c.id, e.metaKey || e.ctrlKey);
              }}
              className={`absolute inset-y-1 rounded-[3px] ${
                selected ? "bg-blue-400 ring-2 ring-yellow-400 z-[5]" : "bg-blue-600/70 hover:bg-blue-500/80"
              }`}
              style={{
                left: pct(c.start),
                width: pct(c.end - c.start),
                // A 30-second clip on a multi-hour VOD is under a pixel wide.
                minWidth: 6,
              }}
            />
          );
        })}

        {/* IN MARKER (open clip: I pressed, O not yet) */}
        {markIn !== null && markOut === null && (
          <div className="absolute top-0 w-0.5 h-7 bg-emerald-400" style={{ left: pct(markIn) }} />
        )}

        {/* PLAYHEAD. The line ignores the mouse so clicks reach the track; the handle on top
            can be grabbed and dragged without the playhead jumping to the click point. */}
        <div
          ref={playheadRef}
          className="absolute -top-1.5 bottom-0 pointer-events-none z-10"
          style={{ left: pct(currentTime) }}
        >
          <div className="absolute top-0 bottom-0 -ml-px w-0.5 bg-white" />
          <div
            className={`absolute -top-1.5 -ml-[9px] h-[18px] w-[18px] flex items-start justify-center pointer-events-auto ${
              isDragging ? "cursor-grabbing" : "cursor-grab"
            }`}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
              setIsDragging(true);
            }}
            title="Drag to scrub"
          >
            <div className="mt-1.5 h-2.5 w-2.5 rounded-[3px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
