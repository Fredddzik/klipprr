"use client";

import { useEffect, useRef, useState } from "react";

interface VideoViewportProps {
  src: string | null;
  videoKey?: string;
  currentTime?: number;
  onTimeUpdate?: (t: number) => void;
}

export default function VideoViewport({ src, videoKey, currentTime, onTimeUpdate }: VideoViewportProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bindVideoRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el) {
      (window as any).__CLIPTOOL_VIDEO__ = el;
    }
  };
  const pendingSeekRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  /** Video intrinsic size so we can size the preview to the video (no letterboxing). */
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  const hideTimer = useRef<number | null>(null);
  function clearHideTimer() {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  function scheduleHide() {
    clearHideTimer();
    hideTimer.current = window.setTimeout(() => {
      setShowControls(false);
      setShowVolume(false);
    }, 2000);
  }

  function onMouseActivity() {
    setShowControls(true);
    scheduleHide();
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setIsMuted(next);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  }

  function onVolumeChange(next: number) {
    const v = videoRef.current;
    setVolume(next);
    if (v) v.volume = next;
  }


  // Keep overlay UI in sync with the <video> element
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleVolume = () => {
      setVolume(v.volume);
      setIsMuted(v.muted || v.volume === 0);
    };

    // Initialize from element
    setIsPlaying(!v.paused);
    setVolume(v.volume);
    setIsMuted(v.muted || v.volume === 0);

    v.addEventListener("play", handlePlay);
    v.addEventListener("pause", handlePause);
    v.addEventListener("volumechange", handleVolume);

    return () => {
      v.removeEventListener("play", handlePlay);
      v.removeEventListener("pause", handlePause);
      v.removeEventListener("volumechange", handleVolume);
    };
  }, [src, videoKey]);

  // Reset aspect when video source changes so we recalc on new load
  useEffect(() => {
    setAspectRatio(null);
  }, [src, videoKey]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || currentTime == null) return;

    // If metadata is not loaded yet, store the seek and apply later
    if (v.readyState < 1) {
      pendingSeekRef.current = currentTime;
      return;
    }

    if (Math.abs(v.currentTime - currentTime) > 0.05) {
      v.currentTime = currentTime;
    }
  }, [currentTime]);

  if (!src) {
    return (
      <div className="w-full h-48 rounded border border-gray-700 bg-black/60 text-gray-300 flex flex-col items-center justify-center gap-2 p-4 text-center">
        <div className="font-semibold">Unable to load preview stream</div>
        <div className="text-xs text-gray-400">
          This often happens on protected/DRM platforms. Direct clipping may not be possible.
        </div>
        <div className="text-xs text-gray-400">
          Use Screen Capture (record your screen while playing the video), then clip the recording.
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full min-h-0 flex items-center justify-center bg-zinc-900"
      onMouseMove={onMouseActivity}
      onMouseLeave={() => {
        clearHideTimer();
        setShowControls(false);
        setShowVolume(false);
      }}
    >
      {/* Size the frame to the video's aspect ratio so there are no black bars (works for 16:9, 9:16 Shorts/Reels, etc.) */}
      <div
        className="max-w-full max-h-full flex items-center justify-center"
        style={
          aspectRatio != null
            ? { aspectRatio: `${aspectRatio}`, width: aspectRatio >= 1 ? "100%" : "auto", height: aspectRatio >= 1 ? "auto" : "100%" }
            : undefined
        }
      >
        <video
          ref={bindVideoRef}
          key={videoKey}
          src={src}
          controls={false}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePlay();
          }}
          onTimeUpdate={() => onTimeUpdate?.(videoRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (!v) return;
            const w = v.videoWidth;
            const h = v.videoHeight;
            if (w > 0 && h > 0) setAspectRatio(w / h);
            if (pendingSeekRef.current != null) {
              v.currentTime = pendingSeekRef.current;
              pendingSeekRef.current = null;
            }
          }}
          className="w-full h-full max-h-full object-contain rounded border border-zinc-700 bg-black cursor-pointer"
        />

      </div>
      {showControls && (
        <div className="pointer-events-auto absolute bottom-2 left-2 right-2 flex items-end justify-between gap-3 transition-opacity duration-200">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              togglePlay();
            }}
            className="px-3 py-1 rounded bg-black/60 border border-gray-700 text-white text-sm hover:bg-black/75"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>

          <div
            className="relative flex items-end pt-8"
            onMouseEnter={() => {
              setShowVolume(true);
              clearHideTimer();
              setShowControls(true);
            }}
            onMouseLeave={() => {
              setShowVolume(false);
              scheduleHide();
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleMute();
              }}
              className="px-3 py-1 rounded bg-black/60 border border-gray-700 text-white text-sm hover:bg-black/75"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? "🔇" : "🔊"}
            </button>

            {showVolume && (
              <div
                className="absolute bottom-full -mb-3 left-1/2 -translate-x-1/2 flex items-center justify-center px-2 py-3 rounded bg-black/60 border border-gray-700"
              >
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={1 - volume}
                  onChange={(e) => onVolumeChange(1 - Number(e.target.value))}
                  className="h-24 w-2 appearance-none bg-transparent"
                  style={{
                    writingMode: "vertical-rl",
                    WebkitAppearance: "slider-vertical",
                  }}
                  aria-label="Volume"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}