import { Easing, interpolate } from "remotion";

/** Smooth step between keyframe arrays (same length). */
export function interpolateKeyframes(
  frame: number,
  keys: number[],
  values: number[],
  easing = Easing.inOut(Easing.cubic),
): number {
  if (keys.length !== values.length || keys.length < 2) {
    throw new Error("interpolateKeyframes: keys and values must match");
  }
  if (frame <= keys[0]) return values[0];
  if (frame >= keys[keys.length - 1]) return values[values.length - 1];

  let i = 0;
  while (i < keys.length - 1 && frame >= keys[i + 1]) i++;

  const span = keys[i + 1] - keys[i];
  const t = span === 0 ? 0 : (frame - keys[i]) / span;
  const e = easing(Math.min(1, Math.max(0, t)));
  return values[i] + (values[i + 1] - values[i]) * e;
}
