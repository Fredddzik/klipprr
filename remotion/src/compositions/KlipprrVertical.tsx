import type { FC } from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { brand } from "../lib/brand";
import {
  AppChromeMock,
  type AppChromeMockProps,
} from "../demo/AppChromeMock";
import { CameraRig } from "../demo/CameraRig";
import { interpolateKeyframes } from "../demo/camera";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

export type KlipprrVerticalProps = {
  tagline?: string;
  cta?: string;
};

/** Camera path — times tuned to the UX storyboard (30 fps). */
const CAM_F = [0, 45, 55, 140, 230, 310, 400, 485, 545];
const CAM_FX = [512, 512, 512, 748, 360, 760, 912, 912, 520];
const CAM_FY = [300, 300, 300, 36, 455, 210, 515, 585, 300];
const CAM_Z = [1.02, 1.02, 1.02, 2.12, 2.05, 2.0, 2.08, 2.18, 1.06];

function linearFadeIn(frame: number, start: number, len: number): number {
  return interpolate(frame, [start, start + len], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function getFocusTarget(camFrame: number): AppChromeMockProps["focusTarget"] {
  if (camFrame >= 14 && camFrame < 100) return "load";
  if (camFrame >= 130 && camFrame < 220) return "markIn";
  if (camFrame >= 220 && camFrame < 310) return "clips";
  if (camFrame >= 320 && camFrame < 400) return "exportGreen";
  if (camFrame >= 400 && camFrame < 480) return "exportBrand";
  return "none";
}

export const KlipprrVertical: FC<KlipprrVerticalProps> = ({
  tagline = "Clip any video. Export in seconds.",
  cta = "Get Klipprr",
}) => {
  const frame = useCurrentFrame();
  /** Camera timeline starts after the hook overlay fades (~1.9s). */
  const camFrame = Math.max(0, frame - 56);

  const fx = interpolateKeyframes(camFrame, CAM_F, CAM_FX);
  const fy = interpolateKeyframes(camFrame, CAM_F, CAM_FY);
  const zoom = interpolateKeyframes(camFrame, CAM_F, CAM_Z);

  const hookOpacity = interpolate(frame, [36, 56], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const hookY = interpolate(frame, [0, 36], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const loadProgress = interpolate(camFrame, [32, 62], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const showLoadingBar = camFrame >= 26 && camFrame < 62;
  const videoLoaded = camFrame >= 62;
  const clipCount = camFrame >= 199 ? 2 : 0;

  const ctaPulse = interpolate(
    Math.sin((frame - 555) / 7),
    [-1, 1],
    [0.985, 1.015],
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.bg,
        fontFamily,
        color: brand.foreground,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 80% 50% at 50% -10%, ${brand.brandGlow}, transparent 55%),
            radial-gradient(ellipse 60% 40% at 100% 60%, rgba(201, 53, 255, 0.12), transparent 50%),
            radial-gradient(ellipse 50% 35% at 0% 80%, rgba(16, 185, 129, 0.08), transparent 45%)
          `,
          opacity: 0.85,
        }}
      />

      {/* Live UI mock + camera */}
      <CameraRig fx={fx} fy={fy} zoom={zoom}>
        <AppChromeMock
          fontFamily={fontFamily}
          frame={frame}
          loadProgress={loadProgress}
          showLoadingBar={showLoadingBar}
          videoLoaded={videoLoaded}
          clipCount={clipCount}
          focusTarget={getFocusTarget(camFrame)}
        />
      </CameraRig>

      {/* Opening hook — fades over the demo */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 48,
          opacity: hookOpacity,
          pointerEvents: "none",
          background: `linear-gradient(180deg, ${brand.bg}ee 0%, ${brand.bg}cc 45%, transparent 100%)`,
        }}
      >
        <Img
          src={staticFile("logo-transparent.png")}
          style={{ width: 112, height: 112, marginBottom: 24 }}
        />
        <h1
          style={{
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: -1.5,
            textAlign: "center",
            margin: 0,
            lineHeight: 1.05,
            background: brand.gradient,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            transform: `translateY(${hookY}px)`,
          }}
        >
          Klipprr
        </h1>
        <p
          style={{
            marginTop: 18,
            fontSize: 30,
            fontWeight: 500,
            color: brand.muted,
            textAlign: "center",
            maxWidth: 880,
            lineHeight: 1.25,
          }}
        >
          {tagline}
        </p>
      </AbsoluteFill>

      {/* End card */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 48,
          opacity: linearFadeIn(frame, 535, 24),
          pointerEvents: "none",
          background: `linear-gradient(180deg, transparent 0%, ${brand.bg}e6 35%, ${brand.bg} 100%)`,
        }}
      >
        <Img
          src={staticFile("logo-transparent.png")}
          style={{ width: 88, height: 88, marginBottom: 16 }}
        />
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            letterSpacing: -1,
            background: brand.gradient,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Klipprr
        </div>
        <div
          style={{
            marginTop: 22,
            transform: `scale(${ctaPulse})`,
            background: brand.gradient,
            color: "#fff",
            fontWeight: 800,
            fontSize: 26,
            padding: "16px 40px",
            borderRadius: 999,
            boxShadow: `0 16px 40px ${brand.brandGlow}`,
          }}
        >
          {cta}
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 64,
          background: `linear-gradient(180deg, transparent, ${brand.bg})`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
