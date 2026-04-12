import type { FC, ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { brand } from "../lib/brand";

/** Fixed layout matching cliptool: collapsed sidebar + URL bar + video / clips / export. */
export const MOCK_W = 1024;
export const MOCK_H = 640;

export type AppChromeMockProps = {
  fontFamily: string;
  /** 0–1 loading bar while resolving */
  loadProgress: number;
  showLoadingBar: boolean;
  videoLoaded: boolean;
  /** Number of fake clips in the list */
  clipCount: number;
  /** Pulsing ring target: which control is “highlighted” */
  focusTarget: "none" | "load" | "markIn" | "clips" | "exportGreen" | "exportBrand";
};

const ringPulse = (frameOffset: number) =>
  0.55 + 0.45 * Math.sin(frameOffset * 0.35);

function FocusRing({
  show,
  frame,
  fill,
  children,
}: {
  show: boolean;
  frame: number;
  /** Fill flex parent (e.g. clips list column) */
  fill?: boolean;
  children: ReactNode;
}) {
  if (!show) return <>{children}</>;
  const p = ringPulse(frame);
  return (
    <div
      style={{
        position: "relative",
        display: fill ? "flex" : "inline-flex",
        flex: fill ? 1 : undefined,
        minHeight: fill ? 0 : undefined,
        flexDirection: fill ? "column" : undefined,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -6,
          borderRadius: 14,
          border: `2px solid rgba(167, 139, 250, ${0.35 + p * 0.5})`,
          boxShadow: `0 0 0 3px rgba(124, 58, 237, ${0.12 + p * 0.25}), 0 0 28px rgba(167, 139, 250, ${0.2 + p * 0.35})`,
          pointerEvents: "none",
        }}
      />
      {children}
    </div>
  );
}

export const AppChromeMock: FC<AppChromeMockProps & { frame: number }> = ({
  fontFamily,
  loadProgress,
  showLoadingBar,
  videoLoaded,
  clipCount,
  focusTarget,
  frame,
}) => {
  const title = videoLoaded ? "Creator weekly highlights — stream.mp4" : "";

  return (
    <div
      style={{
        width: MOCK_W,
        height: MOCK_H,
        background: "#0a0a0a",
        fontFamily,
        display: "flex",
        color: brand.foreground,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: `0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px ${brand.border}`,
      }}
    >
      {/* Left sidebar — collapsed */}
      <aside
        style={{
          width: 72,
          flexShrink: 0,
          background: "#18181b",
          borderRight: `1px solid ${brand.zinc800}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 12,
          paddingBottom: 16,
        }}
      >
        <Img
          src={staticFile("logo-transparent.png")}
          style={{ width: 40, height: 40, objectFit: "contain" }}
        />
        <div style={{ flex: 1 }} />
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: brand.loadSolid,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
          }}
        >
          FH
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            fontWeight: 600,
            color: brand.proGold,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span aria-hidden>★</span> Pro
        </div>
      </aside>

      {/* Main */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* URL bar */}
        <div
          style={{
            flexShrink: 0,
            padding: "10px 14px",
            borderBottom: `1px solid ${brand.zinc800}`,
            background: "rgba(24, 24, 27, 0.85)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {videoLoaded && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "4px 8px",
                  borderRadius: 6,
                  background: "#27272a",
                  color: brand.muted,
                }}
              >
                Preview
              </span>
            )}
            <span style={{ fontSize: 12, color: brand.muted, width: 28 }}>URL</span>
            <div
              style={{
                flex: 1,
                minWidth: 200,
                maxWidth: 420,
                padding: "8px 10px",
                borderRadius: 8,
                background: brand.zinc800,
                border: `1px solid ${brand.zinc700}`,
                fontSize: 13,
                color: videoLoaded ? "#fff" : "#71717a",
              }}
            >
              {videoLoaded
                ? "https://youtube.com/watch?v=…"
                : "YouTube, Twitch clips, X, Instagram, or video URL…"}
            </div>
            <FocusRing show={focusTarget === "load"} frame={frame}>
              <button
                type="button"
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: 600,
                  fontSize: 13,
                  color: "#fff",
                  background: brand.loadSolid,
                  cursor: "default",
                  boxShadow: focusTarget === "load" ? `0 8px 24px ${brand.brandGlow}` : undefined,
                }}
              >
                {showLoadingBar ? "Loading…" : "Load"}
              </button>
            </FocusRing>
            <button
              type="button"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                fontWeight: 500,
                fontSize: 13,
                color: "#fff",
                background: "#3f3f46",
                cursor: "default",
              }}
            >
              Load local file
            </button>
          </div>
          {showLoadingBar && (
            <div style={{ marginTop: 8, maxWidth: 520 }}>
              <div
                style={{
                  height: 5,
                  borderRadius: 99,
                  background: "#27272a",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.round(loadProgress * 100)}%`,
                    background: "#a78bfa",
                    borderRadius: 99,
                  }}
                />
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: brand.muted }}>
                Resolving video…
              </p>
            </div>
          )}
          <p style={{ margin: "6px 0 0", fontSize: 11, color: brand.muted }}>
            YouTube, Twitch clips, X, Instagram Reels, Vimeo, and direct URLs
          </p>
        </div>

        {/* Workspace */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            gap: 10,
            padding: 10,
          }}
        >
          {/* Video + timeline + mark */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              borderRadius: 10,
              border: `1px solid ${brand.zinc800}`,
              background: "#000",
              overflow: "hidden",
            }}
          >
            {videoLoaded && (
              <div
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: brand.muted,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {title}
              </div>
            )}
            <div
              style={{
                flex: 1,
                minHeight: 160,
                background: videoLoaded
                  ? "linear-gradient(145deg, #1a0a2e 0%, #0f172a 40%, #052e16 100%)"
                  : "#0a0a0a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {!videoLoaded && (
                <span style={{ fontSize: 13, color: "#52525b" }}>Preview appears here</span>
              )}
              {videoLoaded && (
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                  }}
                >
                  ▶
                </div>
              )}
            </div>
            {/* Timeline strip */}
            {videoLoaded && (
              <div
                style={{
                  padding: "8px 10px",
                  borderTop: `1px solid ${brand.zinc800}`,
                  background: "#09090b",
                }}
              >
                <div
                  style={{
                    height: 5,
                    borderRadius: 99,
                    background: "#27272a",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: "38%",
                      background: brand.gradient,
                      borderRadius: 99,
                    }}
                  />
                </div>
              </div>
            )}
            {videoLoaded && (
              <div
                style={{
                  padding: "10px 12px",
                  borderTop: `1px solid ${brand.zinc800}`,
                  background: "#09090b",
                }}
              >
                <FocusRing show={focusTarget === "markIn"} frame={frame}>
                  <button
                    type="button"
                    style={{
                      padding: "9px 16px",
                      borderRadius: 8,
                      border: "none",
                      fontWeight: 700,
                      fontSize: 13,
                      color: "#fff",
                      background: brand.gradientGreen,
                      boxShadow:
                        focusTarget === "markIn"
                          ? `0 8px 24px ${brand.greenGlow}`
                          : `0 6px 18px ${brand.greenGlow}`,
                      cursor: "default",
                    }}
                  >
                    Mark IN (M)
                  </button>
                </FocusRing>
              </div>
            )}
          </div>

          {/* Clips */}
          <div
            style={{
              width: 200,
              flexShrink: 0,
              borderRadius: 10,
              border: `1px solid ${brand.zinc800}`,
              background: "rgba(24, 24, 27, 0.9)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: `1px solid ${brand.zinc800}`,
                fontSize: 12,
                fontWeight: 600,
                color: brand.muted,
              }}
            >
              Clips ({clipCount})
            </div>
            <FocusRing show={focusTarget === "clips"} frame={frame} fill>
              <div style={{ padding: 10, flex: 1, overflow: "hidden" }}>
                {clipCount === 0 && (
                  <p style={{ margin: 0, fontSize: 12, color: "#52525b" }}>No clips yet.</p>
                )}
                {clipCount > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {Array.from({ length: clipCount }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: "#27272a",
                          border: `1px solid ${brand.zinc700}`,
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        Clip {i + 1}
                        <span
                          style={{
                            display: "block",
                            fontSize: 10,
                            color: brand.muted,
                            marginTop: 4,
                          }}
                        >
                          0:00 — 0:42
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </FocusRing>
          </div>

          {/* Export */}
          <div
            style={{
              width: 216,
              flexShrink: 0,
              borderRadius: 10,
              border: `1px solid ${brand.zinc800}`,
              background: "rgba(24, 24, 27, 0.95)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: brand.muted }}>Format</div>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 700,
                color: "#fff",
                background: brand.gradient,
                textAlign: "center",
                boxShadow: `0 6px 20px ${brand.brandGlow}`,
              }}
            >
              H.264 — Universal
            </div>
            <div style={{ flex: 1 }} />
            <FocusRing show={focusTarget === "exportGreen"} frame={frame}>
              <button
                type="button"
                style={{
                  width: "100%",
                  padding: "11px 12px",
                  borderRadius: 10,
                  border: "none",
                  fontWeight: 700,
                  fontSize: 12,
                  color: "#fff",
                  background: brand.gradientGreen,
                  boxShadow: `0 8px 22px ${brand.greenGlow}`,
                  cursor: "default",
                }}
              >
                Export selected
              </button>
            </FocusRing>
            <FocusRing show={focusTarget === "exportBrand"} frame={frame}>
              <button
                type="button"
                style={{
                  width: "100%",
                  padding: "11px 12px",
                  borderRadius: 10,
                  border: "none",
                  fontWeight: 700,
                  fontSize: 12,
                  color: "#fff",
                  background: brand.gradient,
                  boxShadow: `0 8px 22px ${brand.brandGlow}`,
                  cursor: "default",
                }}
              >
                Export all
              </button>
            </FocusRing>
          </div>
        </div>
      </div>
    </div>
  );
};
