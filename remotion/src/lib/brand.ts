/**
 * Mirrors cliptool `src/app/globals.css` — brand gradient, greens, surfaces.
 */
export const brand = {
  bg: "#09090b",
  foreground: "#fafafa",
  muted: "#a1a1aa",
  zinc900: "#18181b",
  zinc800: "#27272a",
  zinc700: "#3f3f46",
  /** --brand-gradient */
  gradient:
    "linear-gradient(135deg, #5a2dff 0%, #7c3cff 25%, #c935ff 60%, #ff2e92 100%)",
  /** btn-brand-green */
  gradientGreen:
    "linear-gradient(135deg, #059669 0%, #10b981 40%, #34d399 100%)",
  brandGlow: "rgba(108, 59, 255, 0.35)",
  greenGlow: "rgba(16, 185, 129, 0.35)",
  loadSolid: "#7c3aed",
  proGold: "#fbbf24",
  border: "rgba(63, 63, 70, 0.9)",
} as const;
