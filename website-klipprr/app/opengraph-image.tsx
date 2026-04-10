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
          alignItems: "stretch",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #09090b 0%, #18181b 60%, #1c1028 100%)",
          fontFamily: "sans-serif",
          padding: "42px",
          gap: "28px",
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
        <div
          style={{
            width: "58%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
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
          <p
            style={{
              fontSize: 50,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.1,
              margin: "0 0 18px",
            }}
          >
            Clip Any Part.
            <br />
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
          <p style={{ fontSize: 23, color: "#a1a1aa", margin: 0 }}>
            YouTube · Twitch · Instagram · X · Local files
          </p>
          <div
            style={{
              marginTop: 28,
              padding: "10px 24px",
              borderRadius: 999,
              border: "1.5px solid rgba(139,92,246,0.5)",
              background: "rgba(139,92,246,0.15)",
              color: "#c4b5fd",
              fontSize: 18,
              fontWeight: 600,
              width: "fit-content",
            }}
          >
            Free to start · macOS · Windows coming soon
          </div>
        </div>
        <div
          style={{
            width: "42%",
            borderRadius: 22,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "linear-gradient(180deg, rgba(24,24,27,0.95), rgba(9,9,11,0.95))",
            boxShadow: "0 25px 60px rgba(0,0,0,0.45)",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ width: 9, height: 9, borderRadius: 99, background: "#ef4444" }} />
            <div style={{ width: 9, height: 9, borderRadius: 99, background: "#eab308" }} />
            <div style={{ width: 9, height: 9, borderRadius: 99, background: "#22c55e" }} />
          </div>
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(113,113,122,0.5)",
              background: "rgba(24,24,27,0.9)",
              color: "#d4d4d8",
              fontSize: 13,
              padding: "8px 10px",
            }}
          >
            Paste URL: https://youtube.com/watch?v=...
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <div style={{ flex: 1, borderRadius: 10, background: "rgba(39,39,42,0.9)", height: 72 }} />
            <div style={{ flex: 1, borderRadius: 10, background: "rgba(39,39,42,0.9)", height: 72 }} />
          </div>
          <div style={{ marginTop: 4, borderRadius: 10, background: "rgba(39,39,42,0.9)", height: 54 }} />
          <div style={{ marginTop: 6, borderRadius: 999, background: "#7c3aed", height: 13, width: "82%" }} />
          <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", color: "#a1a1aa", fontSize: 12 }}>
            <div>In: 00:14</div>
            <div>Out: 00:29</div>
          </div>
          <div
            style={{
              marginTop: 4,
              borderRadius: 999,
              padding: "9px 14px",
              background: "linear-gradient(90deg, #7c3aed, #d946ef)",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 700,
              width: "fit-content",
            }}
          >
            Export clip
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
