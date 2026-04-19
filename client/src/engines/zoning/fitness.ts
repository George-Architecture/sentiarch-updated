// ============================================================
// SentiArch — Zoning Fitness Function
//
// Encodes "architect thinking" as a numeric formula.
// Given a chromosome (space → floor+block mapping) and the
// ProgramSpec, returns a FitnessBreakdown with sub-scores and
// weighted total.
//
// v3 — Multi-block support:
//   - Chromosome now encodes (block, floor) per space.
//   - New blockScore sub-score rewards balanced block distribution
//     and penalises cross-block adjacency violations.
//   - Rebalanced weights: adjacency dominates, cluster/floor
//     are soft hints, light is a meaningful differentiator.
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
  block: number;
}

// v3: Dramatically rebalanced weights.
// - adjacency (0.40): main quality driver
// - cluster (0.10): very soft hint (only science labs)
// - floor (0.05): minimal — only dormitory has non-"any" preference
// - light (0.20): meaningful differentiator (higher floors = better)
// - block (0.25): rewards good multi-block distribution
export const DEFAULT_FITNESS_WEIGHTS: FitnessWeights = {
  adjacency: 0.40,
  cluster: 0.10,
  floor: 0.05,
  light: 0.20,
  block: 0.25,
};

// ---- Chromosome Representation ---------------------------------------

/**
 * A chromosome maps each space ID to a gene encoding both
 * block index and floor index.
 *
 * For multi-block: gene = blockIndex * maxFloors + floorIndex
 * For single-block: gene = floorIndex (blockIndex = 0)
 *
 * Use decodeGene() / encodeGene() to convert.
 */
export type Chromosome = Record<string, number>;

/** Decode a gene into (blockIndex, floorIndex). */
export function decodeGene(
  gene: number,
  maxFloors: number
): { block: number; floor: number } {
  const block = Math.floor(gene / maxFloors);
  const floor = gene % maxFloors;
  return { block, floor };
}

/** Encode (blockIndex, floorIndex) into a gene. */
export function encodeGene(
  block: number,
  floor: number,
  maxFloors: number
): number {
  return block * maxFloors + floor;
}

// ---- Sub-Score Functions ---------------------------------------------

/**
 * Score adjacency rules satisfaction.
 *
 * v3: Cross-block adjacency is penalised more heavily than
 * cross-floor adjacency within the same block.
 */
function scoreAdjacency(
  chromosome: Chromosome,
  adjacencies: AdjacencyRule[],
  maxFloors: number,
  maxBlocks: number
): number {
  if (adjacencies.length === 0) return 1;

  let score = 0;
  let maxScore = 0;

  for (const rule of adjacencies) {
    const geneA = chromosome[rule.fromSpaceId];
    const geneB = chromosome[rule.toSpaceId];

    if (geneA === undefined || geneB === undefined) continue;

    const a = decodeGene(geneA, maxFloors);
    const b = decodeGene(geneB, maxFloors);

    const sameBlock = a.block === b.block;
    const floorDist = Math.abs(a.floor - b.floor);
    // Cross-block distance: treat as large separation
    const effectiveDist = sameBlock ? floorDist : floorDist + 3;

    const w = rule.weight;
    let ruleScore = 0;

    switch (rule.type) {
      case "must_adjacent":
        ruleScore = sameBlock && floorDist === 0 ? 10 : -10;
        maxScore += 10 * w;
        break;

      case "should_adjacent":
        if (sameBlock && floorDist === 0) ruleScore = 5;
        else if (sameBlock && floorDist === 1) ruleScore = 2;
        else if (!sameBlock && floorDist === 0) ruleScore = 1;
        else ruleScore = 0;
        maxScore += 5 * w;
        break;

      case "prefer_nearby":
        ruleScore = Math.max(0, 3 - effectiveDist);
        maxScore += 3 * w;
        break;

      case "must_separate":
        // Cross-block separation is excellent
        if (!sameBlock) ruleScore = 10;
        else ruleScore = floorDist > 0 ? 10 : -10;
        maxScore += 10 * w;
        break;
    }

    score += ruleScore * w;
  }

  if (maxScore === 0) return 1;
  return (score + maxScore) / (2 * maxScore);
}

/**
 * Score cluster-group co-location.
 *
 * v3: Cluster members should be on the same floor AND same block.
 */
function scoreCluster(
  chromosome: Chromosome,
  spaces: SpaceType[],
  maxFloors: number
): number {
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
    // Count how many spaces share the same (block, floor) combo
    const comboCounts = new Map<string, number>();
    for (const id of spaceIds) {
      const gene = chromosome[id];
      if (gene === undefined) continue;
      const { block, floor } = decodeGene(gene, maxFloors);
      const key = `${block}-${floor}`;
      comboCounts.set(key, (comboCounts.get(key) ?? 0) + 1);
    }

    let maxCount = 0;
    comboCounts.forEach((count) => {
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
 * v3: Most spaces have "any" preference, so this score is mostly
 * neutral.  Only dormitory (high) and mandatory spaces matter.
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
    const gene = chromosome[s.id];
    if (gene === undefined) continue;
    const { floor: assignedFloor } = decodeGene(gene, maxFloors);

    // Hard constraint: floorMandatory
    if (s.floorMandatory !== undefined) {
      if (assignedFloor !== s.floorMandatory) {
        return MANDATORY_PENALTY;
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
      score += 5;
    } else {
      const dist = Math.min(
        Math.abs(assignedFloor - preferredRange.min),
        Math.abs(assignedFloor - preferredRange.max)
      );
      score += Math.max(0, 3 - dist);
    }
  }

  if (maxPossible === 0) return 1;
  return score / maxPossible;
}

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
 * v3: This is now a major differentiator (weight 0.20).
 * Spaces requiring natural light benefit from higher floors.
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
    const gene = chromosome[s.id];
    if (gene === undefined) continue;
    const { floor } = decodeGene(gene, maxFloors);
    score += maxFloors > 1 ? floor / (maxFloors - 1) : 1;
  }

  return score / lightSpaces.length;
}

/**
 * Score block distribution quality.
 *
 * Rewards:
 * - Balanced area distribution across blocks (not everything in one block)
 * - Each block having a reasonable number of spaces (not too few)
 * - Circulation spaces (lifts, stairs) distributed across blocks
 *
 * Penalises:
 * - All spaces in a single block when multi-block is enabled
 * - Blocks with very few spaces (< 3)
 */
function scoreBlock(
  chromosome: Chromosome,
  spaces: SpaceType[],
  maxFloors: number,
  maxBlocks: number
): number {
  if (maxBlocks <= 1) return 1; // Single-block mode — always perfect

  // Count spaces and area per block
  const blockAreas = new Map<number, number>();
  const blockCounts = new Map<number, number>();

  for (const s of spaces) {
    const gene = chromosome[s.id];
    if (gene === undefined) continue;
    const { block } = decodeGene(gene, maxFloors);
    const area = s.quantity * s.areaPerUnit;
    blockAreas.set(block, (blockAreas.get(block) ?? 0) + area);
    blockCounts.set(block, (blockCounts.get(block) ?? 0) + 1);
  }

  const usedBlocks = blockAreas.size;

  // If only 1 block used when multi-block is available, give moderate score
  // (it's a valid option but we want to explore alternatives)
  if (usedBlocks <= 1) return 0.4;

  // Balance score: how evenly distributed are the areas?
  const areas = Array.from(blockAreas.values());
  const totalArea = areas.reduce((a, b) => a + b, 0);
  const idealArea = totalArea / usedBlocks;
  let balanceScore = 0;
  for (const area of areas) {
    const deviation = Math.abs(area - idealArea) / idealArea;
    balanceScore += Math.max(0, 1 - deviation);
  }
  balanceScore /= usedBlocks;

  // Minimum viable block score: penalise blocks with < 3 spaces
  let viabilityScore = 0;
  const counts = Array.from(blockCounts.values());
  for (const count of counts) {
    viabilityScore += count >= 3 ? 1 : count / 3;
  }
  viabilityScore /= usedBlocks;

  // Bonus for using 2-3 blocks (campus feel)
  const blockCountBonus = usedBlocks >= 2 && usedBlocks <= 3 ? 1.0 : 0.7;

  return (balanceScore * 0.5 + viabilityScore * 0.3 + blockCountBonus * 0.2);
}

// ---- Main Fitness Function -------------------------------------------

/**
 * Evaluate a zoning chromosome's fitness.
 *
 * v3: Now handles multi-block chromosomes. The gene encoding is
 * blockIndex * maxFloors + floorIndex.
 */
export function evaluateFitness(
  chromosome: Chromosome,
  spec: ProgramSpec,
  weights: FitnessWeights = DEFAULT_FITNESS_WEIGHTS
): FitnessBreakdown {
  const { spaces, adjacencies, constraints } = spec;
  const maxFloors = constraints.maxFloors;
  const maxBlocks = constraints.maxBlocks ?? 1;

  const adjacencyScore = scoreAdjacency(
    chromosome, adjacencies, maxFloors, maxBlocks
  );
  const clusterScore = scoreCluster(chromosome, spaces, maxFloors);
  const floorScore = scoreFloor(chromosome, spaces, maxFloors);
  const lightScore = scoreLight(chromosome, spaces, maxFloors);
  const blockScoreVal = scoreBlock(
    chromosome, spaces, maxFloors, maxBlocks
  );

  // If floorMandatory is violated, floorScore is -999
  const totalScore =
    floorScore < 0
      ? -999
      : weights.adjacency * adjacencyScore +
        weights.cluster * clusterScore +
        weights.floor * floorScore +
        weights.light * lightScore +
        weights.block * blockScoreVal;

  return {
    adjacencyScore,
    clusterScore,
    floorScore: floorScore < 0 ? 0 : floorScore,
    lightScore,
    blockScore: maxBlocks > 1 ? blockScoreVal : undefined,
    totalScore,
  };
}
