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

  return (
    <div
      ref={timelineRef}
      className={`relative h-5 bg-gray-800 rounded select-none ${
        isDragging ? "cursor-grabbing" : "cursor-pointer"
      }`}
      onMouseDown={(e) => {
        // clicking timeline seeks immediately
        seekFromClientX(e.clientX);
      }}
    >
      <div className="relative h-5">
        {/* PLAYHEAD */}
        <div
          className="absolute left-0 flex flex-col items-center cursor-ew-resize"
          style={{
            left: `${(currentTime / duration) * 100}%`,
            top: 0,
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
            seekFromClientX(e.clientX);
          }}
        >
          {/* line (inside track) */}
          <div
            className="absolute top-0 w-0.5 h-5 bg-white shadow-sm pointer-events-none"
          />

          {/* handle (below track) */}
          <div
            ref={playheadRef}
            className={`absolute top-[20px] w-2 h-2 rounded-full bg-white shadow ${
              isDragging ? "cursor-grabbing" : "cursor-grab"
            }`}
          />
        </div>

        {/* IN MARKER */}
        {markIn !== null && (
          <div
            className="absolute top-0 w-1 h-5 bg-green-400"
            style={{
              left: `${(markIn / duration) * 100}%`,
            }}
          />
        )}

        {/* OUT MARKER */}
        {markOut !== null && (
          <div
            className="absolute top-0 w-1 h-5 bg-red-400"
            style={{
              left: `${(markOut / duration) * 100}%`,
            }}
          />
        )}

        {/* ACTIVE RANGE */}
        {markIn !== null && markOut !== null && (
          <div
            className="absolute top-0 h-5 bg-blue-500/40 rounded"
            style={{
              left: `${(markIn / duration) * 100}%`,
              width: `${((markOut - markIn) / duration) * 100}%`,
            }}
          />
        )}

        {/* CLIPS */}
        {clips.map((c) => {
          const selected = selectedClipIds.includes(c.id);
          return (
            <div
              key={c.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectClip(c.id, e.metaKey || e.ctrlKey);
              }}
              className={`absolute top-0 h-5 rounded ${
                selected
                  ? "bg-blue-400 ring-2 ring-yellow-400"
                  : "bg-blue-700/60"
              }`}
              style={{
                left: `${(c.start / duration) * 100}%`,
                width: `${((c.end - c.start) / duration) * 100}%`,
              }}
            />
          );
        })}
      </div>

      {/* TIME DISPLAY */}
      <div className="pointer-events-none absolute bottom-0 right-1 text-[10px] text-gray-300/80">
        {formatTimeSimple(
          isDragging && dragTimeRef.current !== null
            ? dragTimeRef.current
            : currentTime
        )}{" "}
        / {formatTimeSimple(duration)}
      </div>
    </div>
  );
}