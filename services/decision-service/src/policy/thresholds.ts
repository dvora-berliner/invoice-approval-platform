// policy.md §6 defaults. Fallback when Dapr Configuration (configStore.ts) is unreachable.
export interface AutonomyThresholds {
  ceiling: number;
  confidence: number;
}

export const DEFAULT_THRESHOLDS: AutonomyThresholds = {
  ceiling: 250,
  confidence: 0.8,
};
