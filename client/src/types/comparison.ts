/**
 * SentiArch — Compare & Refine Types
 *
 * Step 6 of the parametric design workflow.
 * Aggregates data from all previous steps into a unified comparison model.
 *
 * Key thesis element: **Equity Score** measures the comfort gap between
 * the best-served and worst-served agent cohorts — the "thermal unfairness"
 * metric that is central to the research argument.
 */
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Metric Dimensions
// ---------------------------------------------------------------------------

/**
 * Spatial metrics derived from LayoutResult (Step 3).
 */
export const SpatialMetricsSchema = z.object({
  /** Total gross floor area across all floors (m²). */
  totalAreaM2: z.number(),
  /** Ratio of usable room area to total floor plate area (0–1). */
  areaEfficiency: z.number().min(0).max(1),
  /** Ratio of corridor area to total area (0–1, lower is better). */
  corridorRatio: z.number().min(0).max(1),
  /** Total number of rooms across all floors. */
  roomCount: z.number().int().min(0),
  /** Number of floors. */
  floorCount: z.number().int().min(1),
});

export type SpatialMetrics = z.infer<typeof SpatialMetricsSchema>;

/**
 * Comfort metrics derived from SimulationResult (Step 5).
 */
export const ComfortMetricsSchema = z.object({
  /** Mean PMV across all scenarios (ideal: 0). */
  avgPMV: z.number(),
  /** Mean PPD across all scenarios (%, lower is better). */
  avgPPD: z.number(),
  /** Worst-case PMV magnitude (furthest from 0). */
  worstPMV: z.number(),
  /** Worst-case PPD (%). */
  worstPPD: z.number(),
  /** Overall comfort score (0–1, higher is better). */
  overallComfortScore: z.number().min(0).max(1),
  /** Number of comfort alerts. */
  alertCount: z.number().int().min(0),
});

export type ComfortMetrics = z.infer<typeof ComfortMetricsSchema>;

/**
 * Adjacency satisfaction metrics from ZoningResult (Step 2).
 */
export const AdjacencyMetricsSchema = z.object({
  /** Overall adjacency satisfaction score (0–1). */
  adjacencyScore: z.number().min(0).max(1),
  /** Cluster group satisfaction score (0–1). */
  clusterScore: z.number().min(0).max(1),
  /** Floor preference satisfaction score (0–1). */
  floorPrefScore: z.number().min(0).max(1),
});

export type AdjacencyMetrics = z.infer<typeof AdjacencyMetricsSchema>;

/**
 * Natural light access metrics.
 */
export const LightMetricsSchema = z.object({
  /** Proportion of rooms with exterior wall access (0–1). */
  lightAccessRatio: z.number().min(0).max(1),
  /** Number of rooms requiring natural light that have it. */
  satisfiedLightRooms: z.number().int().min(0),
  /** Total rooms requiring natural light. */
  totalLightRequired: z.number().int().min(0),
});

export type LightMetrics = z.infer<typeof LightMetricsSchema>;

// ---------------------------------------------------------------------------
// Equity Score — Central Thesis Element
// ---------------------------------------------------------------------------

/**
 * Per-cohort comfort data for equity analysis.
 */
export const CohortComfortSchema = z.object({
  cohortId: z.string(),
  cohortLabel: z.string(),
  /** Average comfort score for this cohort (0–1). */
  avgComfortScore: z.number().min(0).max(1),
  /** Average PMV for this cohort. */
  avgPMV: z.number(),
  /** Average PPD for this cohort (%). */
  avgPPD: z.number(),
  /** Average perceptual load for this cohort (0–1). */
  avgLoad: z.number().min(0).max(1),
  /** Number of alerts for this cohort. */
  alertCount: z.number().int().min(0),
  /** Hex colour for visualisation. */
  colorHex: z.string(),
});

export type CohortComfort = z.infer<typeof CohortComfortSchema>;

/**
 * **Equity Score** — measures thermal unfairness between agent cohorts.
 *
 * This is the key thesis metric. A high equity score means all cohorts
 * experience similar comfort levels; a low score indicates significant
 * disparity (thermal injustice).
 *
 * `equityScore = 1 - (bestCohortScore - worstCohortScore)`
 *
 * Range: 0 (maximum unfairness) to 1 (perfect equity).
 */
export const EquityMetricsSchema = z.object({
  /** Equity score: 1 − gap (0–1, higher = more equitable). */
  equityScore: z.number().min(0).max(1),
  /** Comfort gap: best cohort score − worst cohort score. */
  comfortGap: z.number().min(0).max(1),
  /** Best-served cohort ID. */
  bestCohortId: z.string(),
  /** Best-served cohort label. */
  bestCohortLabel: z.string(),
  /** Best cohort's average comfort score. */
  bestCohortScore: z.number().min(0).max(1),
  /** Worst-served (most disadvantaged) cohort ID. */
  worstCohortId: z.string(),
  /** Worst-served cohort label. */
  worstCohortLabel: z.string(),
  /** Worst cohort's average comfort score. */
  worstCohortScore: z.number().min(0).max(1),
  /** Per-cohort comfort breakdown. */
  cohorts: z.array(CohortComfortSchema),
});

export type EquityMetrics = z.infer<typeof EquityMetricsSchema>;

// ---------------------------------------------------------------------------
// Candidate & Comparison
// ---------------------------------------------------------------------------

/**
 * A single design candidate with all metric dimensions aggregated.
 */
export const DesignCandidateSchema = z.object({
  /** Unique candidate identifier. */
  id: z.string(),
  /** Human-readable label (e.g. "Candidate A", "Refined v2"). */
  label: z.string(),
  /** Source step that generated this candidate. */
  source: z.enum(["generated", "manual", "refined"]),
  /** Timestamp of creation. */
  createdAt: z.string(),

  // Metric dimensions
  spatial: SpatialMetricsSchema,
  comfort: ComfortMetricsSchema,
  adjacency: AdjacencyMetricsSchema,
  light: LightMetricsSchema,
  equity: EquityMetricsSchema,

  /**
   * Normalised scores for radar chart (each 0–1, higher is better).
   * Computed from the raw metrics above.
   */
  radarScores: z.object({
    areaEfficiency: z.number().min(0).max(1),
    comfortScore: z.number().min(0).max(1),
    adjacencyScore: z.number().min(0).max(1),
    lightScore: z.number().min(0).max(1),
    equityScore: z.number().min(0).max(1),
  }),

  /** Weighted composite score (0–1). */
  compositeScore: z.number().min(0).max(1),

  /** Architect's design notes / annotations. */
  notes: z.string().optional(),
});

export type DesignCandidate = z.infer<typeof DesignCandidateSchema>;

/**
 * Weighting configuration for the composite score.
 * All weights should sum to 1.0.
 */
export const MetricWeightsSchema = z.object({
  areaEfficiency: z.number().min(0).max(1),
  comfortScore: z.number().min(0).max(1),
  adjacencyScore: z.number().min(0).max(1),
  lightScore: z.number().min(0).max(1),
  equityScore: z.number().min(0).max(1),
});

export type MetricWeights = z.infer<typeof MetricWeightsSchema>;

/** Default weights — equity is given the highest weight for thesis purposes. */
export const DEFAULT_WEIGHTS: MetricWeights = {
  areaEfficiency: 0.15,
  comfortScore: 0.25,
  adjacencyScore: 0.15,
  lightScore: 0.15,
  equityScore: 0.30,
};

/**
 * A refinement version — snapshot of a candidate after manual tweaks.
 */
export const RefinementVersionSchema = z.object({
  versionId: z.string(),
  label: z.string(),
  timestamp: z.string(),
  /** What was changed in this version. */
  changeDescription: z.string(),
  /** The candidate state at this version. */
  candidate: DesignCandidateSchema,
});

export type RefinementVersion = z.infer<typeof RefinementVersionSchema>;

/**
 * Room environment override for what-if analysis.
 */
export const RoomOverrideSchema = z.object({
  spaceId: z.string(),
  roomName: z.string(),
  /** Override fields (only those changed). */
  airTemp: z.number().optional(),
  humidity: z.number().optional(),
  airVelocity: z.number().optional(),
  lux: z.number().optional(),
  noiseDb: z.number().optional(),
});

export type RoomOverride = z.infer<typeof RoomOverrideSchema>;

/**
 * Complete comparison result — the final output of the design workflow.
 */
export const ComparisonResultSchema = z.object({
  /** Schema version for future migration. */
  schemaVersion: z.literal("1.0.0"),
  /** All candidates being compared. */
  candidates: z.array(DesignCandidateSchema),
  /** Current metric weights. */
  weights: MetricWeightsSchema,
  /** Selected candidate ID (architect's choice). */
  selectedCandidateId: z.string().optional(),
  /** Refinement history for the selected candidate. */
  refinementHistory: z.array(RefinementVersionSchema),
  /** Timestamp of last update. */
  updatedAt: z.string(),
});

export type ComparisonResult = z.infer<typeof ComparisonResultSchema>;

// ---------------------------------------------------------------------------
// Helper: compute composite score from radar scores + weights
// ---------------------------------------------------------------------------

export function computeCompositeScore(
  radarScores: DesignCandidate["radarScores"],
  weights: MetricWeights,
): number {
  const totalWeight =
    weights.areaEfficiency +
    weights.comfortScore +
    weights.adjacencyScore +
    weights.lightScore +
    weights.equityScore;

  if (totalWeight === 0) return 0;

  const weighted =
    radarScores.areaEfficiency * weights.areaEfficiency +
    radarScores.comfortScore * weights.comfortScore +
    radarScores.adjacencyScore * weights.adjacencyScore +
    radarScores.lightScore * weights.lightScore +
    radarScores.equityScore * weights.equityScore;

  return weighted / totalWeight;
}

// ---------------------------------------------------------------------------
// Helper: compute equity metrics from per-cohort comfort data
// ---------------------------------------------------------------------------

export function computeEquityMetrics(cohorts: CohortComfort[]): EquityMetrics {
  if (cohorts.length === 0) {
    return {
      equityScore: 1,
      comfortGap: 0,
      bestCohortId: "",
      bestCohortLabel: "",
      bestCohortScore: 0,
      worstCohortId: "",
      worstCohortLabel: "",
      worstCohortScore: 0,
      cohorts: [],
    };
  }

  const sorted = [...cohorts].sort((a, b) => b.avgComfortScore - a.avgComfortScore);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const gap = best.avgComfortScore - worst.avgComfortScore;

  return {
    equityScore: Math.max(0, 1 - gap),
    comfortGap: gap,
    bestCohortId: best.cohortId,
    bestCohortLabel: best.cohortLabel,
    bestCohortScore: best.avgComfortScore,
    worstCohortId: worst.cohortId,
    worstCohortLabel: worst.cohortLabel,
    worstCohortScore: worst.avgComfortScore,
    cohorts: sorted,
  };
}
