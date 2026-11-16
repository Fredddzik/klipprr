"use client";

import { useEffect, useRef, useState } from "react";
import { contactSupport } from "@/lib/support";

interface VideoViewportProps {
  src: string | null;
  videoKey?: string;
  currentTime?: number;
  onTimeUpdate?: (t: number) => void;
  debugInfo?: {
    audioCodec?: string | null;
    isLocal?: boolean;
  };
  /** A streamed (DASH) preview failed to start or broke mid-playback. The parent falls
   *  back to a downloaded preview. */
  onStreamError?: (reason: string) => void;
  /** Every preview source has failed. Without this, a missing `src` means the preview
   *  is still being prepared, and the viewport says so instead of showing an error. */
  unavailable?: boolean;
  /** Width ÷ height once the video reports its size, so the parent can fit the panel to it. */
  onAspectRatio?: (ratio: number | null) => void;
}

/** A DASH manifest from the agent (FR-7) rather than a file the element plays directly. */
function isDashSource(src: string | null): boolean {
  return !!src && src.includes("/yt-dash.mpd");
}

export default function VideoViewport({ src, videoKey, currentTime, onTimeUpdate, debugInfo, onStreamError, unavailable, onAspectRatio }: VideoViewportProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bindVideoRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el) {
      (window as any).__CLIPTOOL_VIDEO__ = el;
    }
  };
  const pendingSeekRef = useRef<number | null>(null);
  /** Last observed playback position, used to resume in place when `src` is swapped
   *  (e.g. a low-res preview being upgraded to the 720p copy). */
  const lastTimeRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  /** Video intrinsic size so we can size the preview to the video (no letterboxing). */
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  /** The space the frame can use. Measured, because CSS aspect-ratio inside the flex panel
   *  sometimes laid out before the video reported its size and stayed too small until the
   *  next re-render (a timeline click). */
  // A callback ref: the area only exists once the preview has a source (the loading and
  // error states render something else), so it has to be observed whenever it appears.
  const frameObserverRef = useRef<ResizeObserver | null>(null);
  const [frameArea, setFrameArea] = useState<{ w: number; h: number } | null>(null);
  const frameAreaRef = (el: HTMLDivElement | null) => {
    frameObserverRef.current?.disconnect();
    frameObserverRef.current = null;
    if (!el) return;
    const update = () => setFrameArea((prev) =>
      prev && prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight }
    );
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    frameObserverRef.current = ro;
  };
  const [previewError, setPreviewError] = useState<string | null>(null);

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

  function updateAspect(v: HTMLVideoElement) {
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (w > 0 && h > 0) {
      const r = w / h;
      setAspectRatio((prev) => (prev === r ? prev : r));
      onAspectRatio?.(r);
    }
  }

  // Reset aspect when video source changes so we recalc on new load
  useEffect(() => {
    setAspectRatio(null);
    onAspectRatio?.(null);
    setPreviewError(null);
    // Reset only when the source changes; a new onAspectRatio function on every parent
    // render must not wipe the size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, videoKey]);

  // Streamed previews play through Shaka over Media Source Extensions. The element gets no
  // `src` of its own; Shaka attaches a MediaSource to it and feeds only what is watched.
  const onStreamErrorRef = useRef(onStreamError);
  onStreamErrorRef.current = onStreamError;
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isDashSource(src)) return;
    let player: any = null;
    let cancelled = false;
    const fail = (reason: string) => {
      if (!cancelled) onStreamErrorRef.current?.(reason);
    };
    (async () => {
      try {
        const shaka: any = (await import("shaka-player/dist/shaka-player.dash")).default;
        if (cancelled) return;
        shaka.polyfill.installAll();
        if (!shaka.Player.isBrowserSupported()) return fail("mse_unsupported");
        player = new shaka.Player();
        await player.attach(v);
        player.configure({
          streaming: {
            // A preview pane, not a TV: buffer enough to scrub smoothly, no more.
            bufferingGoal: 30,
            rebufferingGoal: 1,
            bufferBehind: 30,
            retryParameters: { maxAttempts: 3 },
          },
        });
        player.addEventListener("error", (e: any) => fail(`shaka_${e?.detail?.code ?? "error"}`));
        await player.load(src);
      } catch (e: any) {
        fail(`shaka_load_${e?.code ?? "error"}`);
      }
    })();
    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [src, videoKey]);

  // A new video was loaded — forget the previous one's playback position.
  useEffect(() => {
    lastTimeRef.current = 0;
    pendingSeekRef.current = null;
  }, [videoKey]);

  // The source changed for the *same* video (quality upgrade). The element reloads at
  // 0, and the seek effect below won't fire because `currentTime` hasn't changed, so
  // queue the resume explicitly; onLoadedMetadata applies it.
  useEffect(() => {
    if (lastTimeRef.current > 0.05) {
      pendingSeekRef.current = lastTimeRef.current;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

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

  if (!src && !unavailable) {
    return (
      <div className="w-full h-full min-h-48 flex flex-col items-center justify-center gap-2 bg-zinc-900 rounded">
        <svg className="w-5 h-5 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
        </svg>
        <span className="text-xs text-zinc-400">Preparing preview…</span>
      </div>
    );
  }

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
        <button
          type="button"
          onClick={() => contactSupport("Preview won't load", "Preview: every source failed")}
          className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2"
        >
          Email us about this
        </button>
      </div>
    );
  }

  return (
    <div
      ref={frameAreaRef}
      className="relative w-full h-full min-h-0 flex items-center justify-center"
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
        style={(() => {
          if (aspectRatio == null || !frameArea || frameArea.w === 0 || frameArea.h === 0) return undefined;
          // Largest box of the video's shape that fits: width-limited or height-limited.
          const w = Math.min(frameArea.w, frameArea.h * aspectRatio);
          return { width: Math.floor(w), height: Math.floor(w / aspectRatio) };
        })()}
      >
        <video
          ref={bindVideoRef}
          key={videoKey}
          src={isDashSource(src) ? undefined : src}
          controls={false}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePlay();
          }}
          // Streamed (Shaka) previews often know their picture size only after the first
          // segment, so loadedmetadata can report 0×0. "resize" fires when the real size lands.
          onResize={(e) => updateAspect(e.currentTarget)}
          onLoadedData={(e) => updateAspect(e.currentTarget)}
          onTimeUpdate={() => {
            const t = videoRef.current?.currentTime ?? 0;
            if (t > 0) lastTimeRef.current = t;
            onTimeUpdate?.(t);
          }}
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (!v) return;
            updateAspect(v);
            if (pendingSeekRef.current != null) {
              v.currentTime = pendingSeekRef.current;
              pendingSeekRef.current = null;
            }
          }}
          onError={async () => {
            // Shaka reports its own failures; the parent falls back to a download.
            if (isDashSource(src)) return;
            const audioCodec = debugInfo?.audioCodec ? String(debugInfo.audioCodec) : null;
            const ac = audioCodec ? audioCodec.toLowerCase() : "";
            const isPcm = ac.startsWith("pcm") || ac === "lpcm" || ac === "alac" || ac === "flac";

            let extra: string | null = null;
            if (src) {
              try {
                const res = await fetch(src, { headers: { Range: "bytes=0-1024" } });
                if (!res.ok) {
                  const t = (await res.text()).trim();
                  extra = t ? t.slice(0, 400) : `http_${res.status}`;
                }
              } catch (e) {
                extra = `fetch_failed: ${String(e)}`;
              }
            }

            const base =
              "Preview failed to load in the app.\n\n" +
              (audioCodec ? `Detected audio codec: ${audioCodec}\n` : "") +
              (isPcm
                ? "This file uses lossless/PCM audio (Linear PCM, ALAC, or FLAC), which is not supported for in-app preview. The app will re-encode it for preview automatically — if you see this error, the re-encode may have failed.\n"
                : "");

            const tail =
              (extra ? `\nDetails: ${extra}\n` : "") +
              "\nWorkaround: export/cl ip from this local file (exports still work), or re-mux/re-encode the file to H.264 + AAC (MP4) for preview.";

            setPreviewError(base + tail);
          }}
          className="w-full h-full max-h-full object-contain bg-black cursor-pointer"
          draggable={false}
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
            className="w-8 h-8 inline-flex items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 transition-colors"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true"><path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z" /></svg>
            )}
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
              className="w-8 h-8 inline-flex items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 transition-colors"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M22 9l-6 6M16 9l6 6" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" /></svg>
              )}
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

      {previewError && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-xl border border-yellow-700 bg-yellow-950/70 backdrop-blur p-4 text-yellow-100">
            <div className="font-semibold mb-1">Can’t preview this file</div>
            <pre className="text-xs whitespace-pre-wrap opacity-95">{previewError}</pre>
            <button
              type="button"
              onClick={() => contactSupport("A file won't preview", `Preview error:\n${previewError}`)}
              className="mt-2 text-xs text-yellow-200 hover:text-white underline underline-offset-2"
            >
              Email us about this
            </button>
          </div>
        </div>
      )}
    </div>
  );
}