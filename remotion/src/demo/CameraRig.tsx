import type { FC, ReactNode } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { MOCK_H, MOCK_W } from "./AppChromeMock";

type CameraRigProps = {
  /** Focus point in mock pixel coordinates (origin top-left of mock). */
  fx: number;
  fy: number;
  /** Multiplier on top of base fit (1 = full UI visible). */
  zoom: number;
  children: ReactNode;
};

/**
 * Virtual camera: translates and scales the UI mock so (fx, fy) stays near the frame center.
 */
export const CameraRig: FC<CameraRigProps> = ({ fx, fy, zoom, children }) => {
  const { width: vw, height: vh } = useVideoConfig();
  const baseFit = Math.min(vw / MOCK_W, vh / MOCK_H) * 0.88;
  const s = baseFit * zoom;
  const tx = vw / 2 - fx * s;
  const ty = vh / 2 - fy * s;

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#09090b" }}>
      <div
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${s})`,
          transformOrigin: "0 0",
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};
