// src/lib/plan.ts

export type Plan = "free" | "pro";

export interface PlanCapabilities {
  canRenameClips: boolean;
  canEditClipRange: boolean;
  canSetCustomExportPath: boolean;
  hasWatermark: boolean;
}

export const PLAN_CAPABILITIES: Record<Plan, PlanCapabilities> = {
  free: {
    canRenameClips: false,
    canEditClipRange: false,
    canSetCustomExportPath: false,
    hasWatermark: true,
  },
  pro: {
    canRenameClips: true,
    canEditClipRange: true,
    canSetCustomExportPath: true,
    hasWatermark: false,
  },
};