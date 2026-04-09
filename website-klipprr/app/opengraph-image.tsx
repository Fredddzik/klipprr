import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Klipprr — Trim & Download Video Clips from YouTube, Twitch, Reels & More";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #09090b 0%, #18181b 60%, #1c1028 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Gradient blob */}
        <div
          style={{
            position: "absolute",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            width: 600,
            height: 300,
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse, rgba(139,92,246,0.25) 0%, rgba(217,70,239,0.12) 50%, transparent 70%)",
          }}
        />
        {/* Logo + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
            }}
          >
            ✂️
          </div>
          <span style={{ fontSize: 48, fontWeight: 700, color: "#ffffff", letterSpacing: "-1px" }}>
            Klipprr
          </span>
        </div>
        {/* Headline */}
        <p
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.15,
            maxWidth: 900,
            margin: "0 0 20px",
          }}
        >
          Clip Any Part of Any Video.{" "}
          <span
            style={{
              background: "linear-gradient(90deg, #a78bfa, #e879f9, #f472b6)",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            Download in Seconds.
          </span>
        </p>
        {/* Subtext */}
        <p style={{ fontSize: 24, color: "#a1a1aa", textAlign: "center", maxWidth: 700, margin: 0 }}>
          YouTube · Twitch · Instagram · X · Local files
        </p>
        {/* Badge */}
        <div
          style={{
            marginTop: 36,
            padding: "10px 28px",
            borderRadius: 999,
            border: "1.5px solid rgba(139,92,246,0.5)",
            background: "rgba(139,92,246,0.15)",
            color: "#c4b5fd",
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          Free to start · macOS · Windows coming soon
        </div>
      </div>
    ),
    { ...size },
  );
}
