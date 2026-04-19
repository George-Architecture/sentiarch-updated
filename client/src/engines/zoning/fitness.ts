// ============================================================
// SentiArch — Zoning Fitness Function
//
// Encodes "architect thinking" as a numeric formula.
// Given a chromosome (space → floor mapping) and the ProgramSpec,
// returns a FitnessBreakdown with sub-scores and weighted total.
// ============================================================

import type {
  ProgramSpec,
  SpaceType,
  AdjacencyRule,
} from "@/types/program";
import type { FitnessBreakdown } from "@/types/zoning";

export type { FitnessBreakdown };

// ---- Fitness Weights (defaults) --------------------------------------

export interface FitnessWeights {
  adjacency: number;
  cluster: number;
  floor: number;
  light: number;
}

// v2: Reduced floor weight (0.25→0.15) to prevent all candidates converging
// to the same "preferred floor" solution.  Adjacency weight increased
// (0.40→0.50) to reward genuinely different spatial relationships.
export const DEFAULT_FITNESS_WEIGHTS: FitnessWeights = {
  adjacency: 0.50, // ↑ was 0.40 — stronger signal for spatial relationships
  cluster: 0.25,   // unchanged
  floor: 0.15,     // ↓ was 0.25 — softer preference signal, more exploration
  light: 0.10,     // unchanged
};

// ---- Chromosome Representation ---------------------------------------

/**
 * A chromosome maps each space ID to a floor index (0-based).
 *
 * This is the core representation the GA operates on.
 * Using a plain object for fast lookup.
 */
export type Chromosome = Record<string, number>;

// ---- Sub-Score Functions ---------------------------------------------

/**
 * Score adjacency rules satisfaction.
 *
 * Returns a value in roughly [-1, 1] range (normalised by max
 * possible score).
 */
function scoreAdjacency(
  chromosome: Chromosome,
  adjacencies: AdjacencyRule[]
): number {
  if (adjacencies.length === 0) return 1;

  let score = 0;
  let maxScore = 0;

  for (const rule of adjacencies) {
    const floorA = chromosome[rule.fromSpaceId];
    const floorB = chromosome[rule.toSpaceId];

    if (floorA === undefined || floorB === undefined) continue;

    const distance = Math.abs(floorA - floorB);
    const w = rule.weight;
    let ruleScore = 0;

    switch (rule.type) {
      case "must_adjacent":
        ruleScore = distance === 0 ? 10 : -10;
        maxScore += 10 * w;
        break;

      case "should_adjacent":
        if (distance === 0) ruleScore = 5;
        else if (distance === 1) ruleScore = 2;
        else ruleScore = 0;
        maxScore += 5 * w;
        break;

      case "prefer_nearby":
        ruleScore = Math.max(0, 3 - distance);
        maxScore += 3 * w;
        break;

      case "must_separate":
        ruleScore = distance > 0 ? 10 : -10;
        maxScore += 10 * w;
        break;
    }

    score += ruleScore * w;
  }

  // Normalise to [0, 1] — shift from [-maxScore, maxScore] range
  if (maxScore === 0) return 1;
  return (score + maxScore) / (2 * maxScore);
}

/**
 * Score cluster-group co-location.
 *
 * For each cluster group, compute the proportion of member spaces
 * that are on the most-populated floor for that group.
 */
function scoreCluster(
  chromosome: Chromosome,
  spaces: SpaceType[]
): number {
  // Group spaces by clusterGroup
  const groups = new Map<string, string[]>();
  for (const s of spaces) {
    if (!s.clusterGroup) continue;
    const list = groups.get(s.clusterGroup);
    if (list) {
      list.push(s.id);
    } else {
      groups.set(s.clusterGroup, [s.id]);
    }
  }

  if (groups.size === 0) return 1;

  let totalScore = 0;
  let groupCount = 0;

  groups.forEach((spaceIds) => {
    // Count how many spaces are on each floor
    const floorCounts = new Map<number, number>();
    for (const id of spaceIds) {
      const floor = chromosome[id];
      if (floor === undefined) continue;
      floorCounts.set(floor, (floorCounts.get(floor) ?? 0) + 1);
    }

    // Best proportion = max count / total
    let maxCount = 0;
    floorCounts.forEach((count) => {
      if (count > maxCount) maxCount = count;
    });

    totalScore += maxCount / spaceIds.length;
    groupCount++;
  });

  return groupCount > 0 ? totalScore / groupCount : 1;
}

/**
 * Score floor-preference satisfaction.
 *
 * - floorMandatory violation → -999 (effectively eliminates candidate)
 * - floorPreference match → +5, close → +1, mismatch → 0
 */
function scoreFloor(
  chromosome: Chromosome,
  spaces: SpaceType[],
  maxFloors: number
): number {
  if (spaces.length === 0) return 1;

  let score = 0;
  let maxPossible = 0;
  const MANDATORY_PENALTY = -999;

  for (const s of spaces) {
    const assignedFloor = chromosome[s.id];
    if (assignedFloor === undefined) continue;

    // Hard constraint: floorMandatory
    if (s.floorMandatory !== undefined) {
      if (assignedFloor !== s.floorMandatory) {
        return MANDATORY_PENALTY; // Eliminate this candidate
      }
      score += 5;
      maxPossible += 5;
      continue;
    }

    // Soft constraint: floorPreference
    maxPossible += 5;

    if (s.floorPreference === "any") {
      score += 3; // Neutral bonus
      continue;
    }

    const preferredRange = getPreferredFloorRange(
      s.floorPreference,
      maxFloors
    );

    if (
      assignedFloor >= preferredRange.min &&
      assignedFloor <= preferredRange.max
    ) {
      score += 5; // Perfect match
    } else {
      const dist = Math.min(
        Math.abs(assignedFloor - preferredRange.min),
        Math.abs(assignedFloor - preferredRange.max)
      );
      score += Math.max(0, 3 - dist); // Closer → higher
    }
  }

  if (maxPossible === 0) return 1;
  return score / maxPossible;
}

/**
 * Map a soft floor preference to a floor range.
 */
function getPreferredFloorRange(
  pref: "ground" | "low" | "mid" | "high",
  maxFloors: number
): { min: number; max: number } {
  switch (pref) {
    case "ground":
      return { min: 0, max: 0 };
    case "low":
      return { min: 0, max: Math.min(1, maxFloors - 1) };
    case "mid": {
      const mid = Math.floor(maxFloors / 2);
      return {
        min: Math.max(0, mid - 1),
        max: Math.min(maxFloors - 1, mid + 1),
      };
    }
    case "high":
      return {
        min: Math.max(0, maxFloors - 2),
        max: maxFloors - 1,
      };
  }
}

/**
 * Score natural-light preference.
 *
 * Spaces requiring natural light get a bonus for higher floors
 * (less obstruction from surrounding buildings).
 */
function scoreLight(
  chromosome: Chromosome,
  spaces: SpaceType[],
  maxFloors: number
): number {
  const lightSpaces = spaces.filter((s) =>
    s.requiredFeatures.includes("natural_light")
  );

  if (lightSpaces.length === 0) return 1;

  let score = 0;
  for (const s of lightSpaces) {
    const floor = chromosome[s.id];
    if (floor === undefined) continue;
    // Higher floor → better light access (normalised to [0, 1])
    score += maxFloors > 1 ? floor / (maxFloors - 1) : 1;
  }

  return score / lightSpaces.length;
}

// ---- Main Fitness Function -------------------------------------------

/**
 * Evaluate a zoning chromosome's fitness.
 *
 * @param chromosome - Space-to-floor mapping
 * @param spec - The full ProgramSpec
 * @param weights - Sub-score weights (default: DEFAULT_FITNESS_WEIGHTS)
 * @returns FitnessBreakdown with sub-scores and weighted total
 */
export function evaluateFitness(
  chromosome: Chromosome,
  spec: ProgramSpec,
  weights: FitnessWeights = DEFAULT_FITNESS_WEIGHTS
): FitnessBreakdown {
  const { spaces, adjacencies, constraints } = spec;
  const maxFloors = constraints.maxFloors;

  const adjacencyScore = scoreAdjacency(chromosome, adjacencies);
  const clusterScore = scoreCluster(chromosome, spaces);
  const floorScore = scoreFloor(chromosome, spaces, maxFloors);
  const lightScore = scoreLight(chromosome, spaces, maxFloors);

  // If floorMandatory is violated, floorScore is -999
  const totalScore =
    floorScore < 0
      ? -999
      : weights.adjacency * adjacencyScore +
        weights.cluster * clusterScore +
        weights.floor * floorScore +
        weights.light * lightScore;

  return {
    adjacencyScore,
    clusterScore,
    floorScore: floorScore < 0 ? 0 : floorScore,
    lightScore,
    totalScore,
  };
}
