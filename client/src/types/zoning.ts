// ============================================================
// SentiArch — Zoning Strategy Data Types
// Phase 1, Step 2: Zoning Strategy
//
// Defines the output of the zoning engine — which spaces go on
// which floor (and optionally which block) — and the fitness
// scoring breakdown.  This is the contract between Step 2
// (Zoning) and Step 3 (Layout).
//
// v3 — Multi-block support:
//   FloorAssignment now carries an optional `blockIndex` so that
//   the GA can distribute spaces across multiple building blocks.
//   FitnessBreakdown gains an optional `blockScore` sub-score.
//   ZoningCandidate gains an optional `blockCount` summary.
//   All additions are optional for backward compatibility with
//   single-block zoning results.
// ============================================================

import { z } from "zod/v4";

// ---- Fitness Score Breakdown -----------------------------------------

/**
 * Detailed breakdown of a zoning candidate's fitness score.
 *
 * Each sub-score is normalised to [0, 1] before weighting so
 * that the final score is a weighted sum in [0, 1].
 *
 * v3: `blockScore` is optional — present only when multi-block
 * zoning is enabled.
 */
export const FitnessBreakdownSchema = z.object({
  /** Score from adjacency rule satisfaction. */
  adjacencyScore: z.number(),
  /** Score from cluster-group co-location. */
  clusterScore: z.number(),
  /** Score from floor-preference / floor-mandatory satisfaction. */
  floorScore: z.number(),
  /** Score from natural-light preference (higher floors). */
  lightScore: z.number(),
  /** Score from block distribution quality (multi-block only). */
  blockScore: z.number().optional(),
  /** Weighted total: w1×adj + w2×cluster + w3×floor + w4×light [+ w5×block]. */
  totalScore: z.number(),
});

export type FitnessBreakdown = z.infer<typeof FitnessBreakdownSchema>;

// ---- Floor Assignment ------------------------------------------------

/**
 * A single floor's space assignments in a zoning candidate.
 *
 * v3: `blockIndex` is optional — when present, spaces on this
 * floor belong to the indicated building block (0-indexed).
 * When absent, all spaces are in a single block (legacy mode).
 */
export const FloorAssignmentSchema = z.object({
  /** 0-indexed floor number (0 = G/F). */
  floorIndex: z.number().int().min(0),
  /** IDs of spaces assigned to this floor. */
  spaceIds: z.array(z.string()),
  /** Total area of all spaces on this floor (m²). Computed. */
  totalAreaM2: z.number().min(0),
  /** 0-indexed block number (optional, multi-block zoning). */
  blockIndex: z.number().int().min(0).optional(),
});

export type FloorAssignment = z.infer<typeof FloorAssignmentSchema>;

// ---- Zoning Candidate ------------------------------------------------

/**
 * A single zoning candidate produced by the GA engine.
 *
 * Contains the floor-by-floor assignment and its fitness score.
 *
 * v3: `blockCount` summarises how many building blocks this
 * candidate uses.  When absent, assume single block.
 */
export const ZoningCandidateSchema = z.object({
  /** Unique candidate identifier (e.g. "candidate-0"). */
  id: z.string(),
  /** Rank among the returned candidates (0 = best). */
  rank: z.number().int().min(0),
  /** Floor-by-floor space assignments. */
  floors: z.array(FloorAssignmentSchema),
  /** Fitness score breakdown. */
  fitness: FitnessBreakdownSchema,
  /** Generation number when this candidate was found. */
  generation: z.number().int().min(0),
  /** Number of building blocks in this candidate (optional, multi-block). */
  blockCount: z.number().int().min(1).optional(),
});

export type ZoningCandidate = z.infer<typeof ZoningCandidateSchema>;

// ---- Zoning Result (full output) -------------------------------------

/**
 * Complete output of the zoning engine.
 *
 * Contains the top N candidates, the GA parameters used, and
 * a reference back to the source ProgramSpec.
 */
export const ZoningResultSchema = z.object({
  /** Reference to the ProgramSpec ID that was zoned. */
  programSpecId: z.string(),
  /** Timestamp when the zoning was generated. */
  generatedAt: z.string().datetime(),
  /** GA parameters used for this run. */
  gaParams: z.object({
    populationSize: z.number().int().min(1),
    generations: z.number().int().min(1),
    tournamentSize: z.number().int().min(2),
    crossoverRate: z.number().min(0).max(1),
    mutationRate: z.number().min(0).max(1),
    eliteCount: z.number().int().min(0),
  }),
  /** Fitness weight configuration used. */
  fitnessWeights: z.object({
    adjacency: z.number().min(0),
    cluster: z.number().min(0),
    floor: z.number().min(0),
    light: z.number().min(0),
    block: z.number().min(0).optional(),
  }),
  /** Top candidates sorted by fitness (best first). */
  candidates: z.array(ZoningCandidateSchema),
  /** Total computation time in milliseconds. */
  computeTimeMs: z.number().min(0),
});

export type ZoningResult = z.infer<typeof ZoningResultSchema>;

// ---- Selected Zoning (for Step 3 consumption) ------------------------

/**
 * The architect's confirmed zoning choice.
 *
 * This is the minimal output that Step 3 (Layout Generation)
 * consumes: just the floor assignments plus a reference to the
 * source spec.
 */
export const SelectedZoningSchema = z.object({
  programSpecId: z.string(),
  /** The chosen candidate ID. */
  candidateId: z.string(),
  /** Floor assignments (may have been manually adjusted). */
  floors: z.array(FloorAssignmentSchema),
  /** Final fitness score after any manual adjustments. */
  fitness: FitnessBreakdownSchema,
  /** Timestamp when the architect confirmed the selection. */
  confirmedAt: z.string().datetime(),
  /** Number of building blocks (optional, multi-block). */
  blockCount: z.number().int().min(1).optional(),
});

export type SelectedZoning = z.infer<typeof SelectedZoningSchema>;
