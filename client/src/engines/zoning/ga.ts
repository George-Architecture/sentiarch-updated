// ============================================================
// SentiArch — Genetic Algorithm for Zoning
//
// Client-side GA that evolves zoning candidates.
// Population of chromosomes (space → floor mappings) evolved
// via tournament selection, crossover, and mutation.
// Returns top N candidates sorted by fitness.
//
// v2 — Diversity-preserving improvements:
//   1. Niche-based selection: penalises candidates too similar to
//      already-selected elite individuals (sharing radius σ).
//   2. Increased default population / mutation rate.
//   3. smartSeedChromosome now adds random jitter so that seeds
//      are not all identical when cluster groups have the same
//      non-"any" preference.
//   4. Final selection uses a minimum Hamming-distance threshold
//      to ensure the returned top-N are meaningfully different.
// ============================================================

import type { ProgramSpec, SpaceType } from "@/types/program";
import type {
  ZoningCandidate,
  ZoningResult,
  FloorAssignment,
} from "@/types/zoning";
import {
  evaluateFitness,
  DEFAULT_FITNESS_WEIGHTS,
  type Chromosome,
  type FitnessWeights,
  type FitnessBreakdown,
} from "./fitness";

// ---- GA Parameters ---------------------------------------------------

export interface GAParams {
  populationSize: number;
  generations: number;
  tournamentSize: number;
  crossoverRate: number;
  mutationRate: number;
  eliteCount: number;
  topN: number;
  /** Minimum Hamming distance (# genes different) between returned candidates */
  minHammingDistance?: number;
  /** Niche radius: chromosomes within this Hamming distance share fitness penalty */
  nicheRadius?: number;
  /** Niche penalty strength (0 = disabled, 1 = full sharing) */
  nichePenalty?: number;
}

export const DEFAULT_GA_PARAMS: GAParams = {
  populationSize: 150,   // ↑ was 100 — larger pool → more diversity
  generations: 300,      // ↑ was 200 — more time to explore
  tournamentSize: 4,     // ↓ was 5 — less selection pressure → more diversity
  crossoverRate: 0.8,
  mutationRate: 0.22,    // ↑ was 0.15 — more exploration
  eliteCount: 3,         // ↓ was 5 — fewer clones carried forward
  topN: 5,
  minHammingDistance: 3, // NEW: returned candidates must differ by ≥3 genes
  nicheRadius: 5,        // NEW: niche sharing radius (genes)
  nichePenalty: 0.05,    // NEW: mild sharing penalty
};

// ---- Internal Types --------------------------------------------------

interface ScoredChromosome {
  chromosome: Chromosome;
  fitness: FitnessBreakdown;
  generation: number;
}

// ---- Chromosome Helpers ----------------------------------------------

/**
 * Create a random chromosome respecting floorMandatory constraints.
 */
function randomChromosome(
  spaces: SpaceType[],
  maxFloors: number
): Chromosome {
  const chromosome: Chromosome = {};
  for (const s of spaces) {
    if (s.floorMandatory !== undefined) {
      chromosome[s.id] = s.floorMandatory;
    } else {
      chromosome[s.id] = Math.floor(Math.random() * maxFloors);
    }
  }
  return chromosome;
}

/**
 * Create a smart-seeded chromosome that respects cluster groups
 * and floor preferences in addition to mandatory constraints.
 *
 * v2: Adds random jitter so that seeds with the same cluster-group
 * preference are NOT all identical.  Each cluster group is seeded
 * to the preferred floor ± a random offset of 0 or 1 floor,
 * giving multiple distinct starting points.
 */
function smartSeedChromosome(
  spaces: SpaceType[],
  maxFloors: number
): Chromosome {
  const chromosome: Chromosome = {};

  // First pass: assign mandatory floors
  for (const s of spaces) {
    if (s.floorMandatory !== undefined) {
      chromosome[s.id] = s.floorMandatory;
    }
  }

  // Group unassigned spaces by clusterGroup
  const clusterFloors = new Map<string, number>();
  const unassigned = spaces.filter(
    (s) => s.floorMandatory === undefined
  );

  for (const s of unassigned) {
    if (s.clusterGroup) {
      if (!clusterFloors.has(s.clusterGroup)) {
        // Pick a floor based on preference, then add random jitter
        const base = preferenceToFloor(s.floorPreference, maxFloors);
        // Jitter: ±1 floor with 50% probability, clamped to valid range
        const jitter = Math.random() < 0.5
          ? 0
          : (Math.random() < 0.5 ? 1 : -1);
        const floor = Math.max(0, Math.min(maxFloors - 1, base + jitter));
        clusterFloors.set(s.clusterGroup, floor);
      }
      chromosome[s.id] = clusterFloors.get(s.clusterGroup)!;
    } else {
      // For unclustered spaces, also add jitter to non-"any" preferences
      const base = preferenceToFloor(s.floorPreference, maxFloors);
      if (s.floorPreference && s.floorPreference !== "any") {
        const jitter = Math.random() < 0.4
          ? 0
          : (Math.random() < 0.5 ? 1 : -1);
        chromosome[s.id] = Math.max(0, Math.min(maxFloors - 1, base + jitter));
      } else {
        chromosome[s.id] = base;
      }
    }
  }

  return chromosome;
}

/**
 * Convert a floor preference to a concrete floor number.
 */
function preferenceToFloor(
  pref: string | undefined,
  maxFloors: number
): number {
  switch (pref) {
    case "ground":
      return 0;
    case "low":
      return Math.min(1, maxFloors - 1);
    case "mid":
      return Math.floor(maxFloors / 2);
    case "high":
      return maxFloors - 1;
    default:
      return Math.floor(Math.random() * maxFloors);
  }
}

// ---- Diversity Metrics -----------------------------------------------

/**
 * Compute Hamming distance between two chromosomes
 * (number of genes that differ).
 */
function hammingDistance(
  a: Chromosome,
  b: Chromosome,
  spaces: SpaceType[]
): number {
  let diff = 0;
  for (const s of spaces) {
    if (a[s.id] !== b[s.id]) diff++;
  }
  return diff;
}

/**
 * Apply niche sharing: reduce effective fitness of a chromosome
 * based on how many similar chromosomes already exist in the
 * current elite set.
 *
 * This prevents the GA from converging to a single peak by
 * penalising over-represented regions of the search space.
 */
function applyNicheSharing(
  sc: ScoredChromosome,
  elites: ScoredChromosome[],
  spaces: SpaceType[],
  nicheRadius: number,
  nichePenalty: number
): number {
  if (elites.length === 0 || nichePenalty === 0) {
    return sc.fitness.totalScore;
  }
  let sharingSum = 0;
  for (const e of elites) {
    const dist = hammingDistance(sc.chromosome, e.chromosome, spaces);
    if (dist < nicheRadius) {
      // Sharing function: linear decay within niche radius
      sharingSum += 1 - dist / nicheRadius;
    }
  }
  // Penalise proportionally to how crowded the niche is
  return sc.fitness.totalScore * (1 - nichePenalty * sharingSum);
}

// ---- GA Operators ----------------------------------------------------

/**
 * Tournament selection: pick `tournamentSize` random individuals,
 * return the best.
 */
function tournamentSelect(
  population: ScoredChromosome[],
  tournamentSize: number
): ScoredChromosome {
  let best: ScoredChromosome | null = null;
  for (let i = 0; i < tournamentSize; i++) {
    const idx = Math.floor(Math.random() * population.length);
    const candidate = population[idx];
    if (!best || candidate.fitness.totalScore > best.fitness.totalScore) {
      best = candidate;
    }
  }
  return best!;
}

/**
 * Uniform crossover: for each space, randomly pick the floor
 * from parent A or parent B.
 */
function crossover(
  parentA: Chromosome,
  parentB: Chromosome,
  spaces: SpaceType[]
): Chromosome {
  const child: Chromosome = {};
  for (const s of spaces) {
    if (s.floorMandatory !== undefined) {
      child[s.id] = s.floorMandatory;
    } else {
      child[s.id] = Math.random() < 0.5
        ? parentA[s.id]
        : parentB[s.id];
    }
  }
  return child;
}

/**
 * Mutation: for each non-mandatory space, with probability
 * `mutationRate`, assign a random floor.
 *
 * v2: Also supports a "preference-biased" mutation that has a
 * 30% chance of mutating toward the preferred floor rather than
 * fully random, preserving some architectural intent while still
 * exploring alternatives.
 */
function mutate(
  chromosome: Chromosome,
  spaces: SpaceType[],
  maxFloors: number,
  mutationRate: number
): Chromosome {
  const mutated = { ...chromosome };
  for (const s of spaces) {
    if (s.floorMandatory !== undefined) continue;
    if (Math.random() < mutationRate) {
      if (Math.random() < 0.3 && s.floorPreference && s.floorPreference !== "any") {
        // 30%: mutate toward preferred floor ± 1 (keeps architectural intent)
        const base = preferenceToFloor(s.floorPreference, maxFloors);
        const jitter = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
        mutated[s.id] = Math.max(0, Math.min(maxFloors - 1, base + jitter));
      } else {
        // 70%: fully random (explores new territory)
        mutated[s.id] = Math.floor(Math.random() * maxFloors);
      }
    }
  }
  return mutated;
}

// ---- Chromosome → ZoningCandidate Conversion -------------------------

/**
 * Convert a scored chromosome to a ZoningCandidate with floor
 * assignments and area totals.
 */
function toCandidate(
  scored: ScoredChromosome,
  rank: number,
  spaces: SpaceType[],
  maxFloors: number
): ZoningCandidate {
  // Build space lookup
  const spaceMap = new Map<string, SpaceType>();
  for (const s of spaces) {
    spaceMap.set(s.id, s);
  }

  // Group by floor
  const floorMap = new Map<number, string[]>();
  for (let i = 0; i < maxFloors; i++) {
    floorMap.set(i, []);
  }

  for (const [spaceId, floor] of Object.entries(scored.chromosome)) {
    const list = floorMap.get(floor);
    if (list) {
      list.push(spaceId);
    }
  }

  const floors: FloorAssignment[] = [];
  for (let i = 0; i < maxFloors; i++) {
    const spaceIds = floorMap.get(i) ?? [];
    let totalAreaM2 = 0;
    for (const id of spaceIds) {
      const s = spaceMap.get(id);
      if (s) totalAreaM2 += s.quantity * s.areaPerUnit;
    }
    floors.push({ floorIndex: i, spaceIds, totalAreaM2 });
  }

  return {
    id: `candidate-${rank}`,
    rank,
    floors,
    fitness: scored.fitness,
    generation: scored.generation,
  };
}

// ---- Main GA Runner --------------------------------------------------

/**
 * Progress callback for UI updates.
 */
export type GAProgressCallback = (
  generation: number,
  totalGenerations: number,
  bestScore: number
) => void;

/**
 * Run the genetic algorithm to produce optimized zoning candidates.
 *
 * Runs entirely client-side. Uses `setTimeout` yielding every
 * N generations to keep the UI responsive.
 *
 * v2 changes:
 *   - Larger default population (150) and more generations (300)
 *   - Higher mutation rate (0.22) for more exploration
 *   - Niche sharing to prevent premature convergence
 *   - Minimum Hamming distance between returned candidates
 *   - Smart seeds include random jitter to avoid identical starts
 *
 * @param spec - The ProgramSpec to zone
 * @param params - GA parameters (defaults provided)
 * @param weights - Fitness weights (defaults provided)
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to ZoningResult with top N candidates
 */
export async function runZoningGA(
  spec: ProgramSpec,
  params: GAParams = DEFAULT_GA_PARAMS,
  weights: FitnessWeights = DEFAULT_FITNESS_WEIGHTS,
  onProgress?: GAProgressCallback
): Promise<ZoningResult> {
  const startTime = performance.now();
  const { spaces, constraints } = spec;
  const maxFloors = constraints.maxFloors;
  const nicheRadius = params.nicheRadius ?? 5;
  const nichePenalty = params.nichePenalty ?? 0.05;
  const minHamming = params.minHammingDistance ?? 3;

  // ---- Initialise population ----
  let population: ScoredChromosome[] = [];

  // Seed 30% with smart chromosomes (with jitter), 70% random
  // ↑ was 20% smart — more diverse seeds
  const smartCount = Math.floor(params.populationSize * 0.3);
  for (let i = 0; i < params.populationSize; i++) {
    const chromosome =
      i < smartCount
        ? smartSeedChromosome(spaces, maxFloors)
        : randomChromosome(spaces, maxFloors);
    const fitness = evaluateFitness(chromosome, spec, weights);
    population.push({ chromosome, fitness, generation: 0 });
  }

  // Track all-time best individuals (capped to avoid memory bloat)
  const allTimeBest: ScoredChromosome[] = [];
  const ALL_TIME_BEST_CAP = params.topN * 20;

  // ---- Evolution loop ----
  const YIELD_INTERVAL = 20; // Yield to UI every N generations

  for (let gen = 0; gen < params.generations; gen++) {
    // Sort by fitness (descending)
    population.sort(
      (a, b) => b.fitness.totalScore - a.fitness.totalScore
    );

    // Track best (capped)
    if (
      population[0].fitness.totalScore > -999 &&
      allTimeBest.length < ALL_TIME_BEST_CAP
    ) {
      allTimeBest.push({ ...population[0], generation: gen });
    }

    // Progress callback
    if (onProgress) {
      onProgress(gen, params.generations, population[0].fitness.totalScore);
    }

    // Yield to UI thread periodically
    if (gen % YIELD_INTERVAL === 0 && gen > 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // ---- Create next generation ----
    const nextGen: ScoredChromosome[] = [];

    // Elitism: keep top N (fewer than before to allow more diversity)
    for (let i = 0; i < params.eliteCount && i < population.length; i++) {
      nextGen.push({ ...population[i], generation: gen + 1 });
    }

    // Fill rest with crossover + mutation
    while (nextGen.length < params.populationSize) {
      const parentA = tournamentSelect(population, params.tournamentSize);
      const parentB = tournamentSelect(population, params.tournamentSize);

      let childChromosome: Chromosome;
      if (Math.random() < params.crossoverRate) {
        childChromosome = crossover(
          parentA.chromosome,
          parentB.chromosome,
          spaces
        );
      } else {
        // Clone better parent
        childChromosome =
          parentA.fitness.totalScore >= parentB.fitness.totalScore
            ? { ...parentA.chromosome }
            : { ...parentB.chromosome };
      }

      childChromosome = mutate(
        childChromosome,
        spaces,
        maxFloors,
        params.mutationRate
      );

      const fitness = evaluateFitness(childChromosome, spec, weights);
      nextGen.push({
        chromosome: childChromosome,
        fitness,
        generation: gen + 1,
      });
    }

    population = nextGen;
  }

  // ---- Final sort and select top N with diversity enforcement ----
  // Merge all-time best with final population
  const combined = [...population, ...allTimeBest];
  combined.sort(
    (a, b) => b.fitness.totalScore - a.fitness.totalScore
  );

  // Deduplicate by exact chromosome fingerprint first
  const seen = new Set<string>();
  const deduped: ScoredChromosome[] = [];
  for (const sc of combined) {
    if (sc.fitness.totalScore <= -999) continue;
    const key = fingerprint(sc.chromosome, spaces);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(sc);
    }
  }

  // Now apply diversity-enforced selection:
  // Greedily pick the next candidate only if it is at least
  // minHammingDistance genes away from ALL already-selected candidates.
  // If we can't fill topN with this constraint, relax by 1 each time.
  const selected: ScoredChromosome[] = [];
  let currentMinHamming = minHamming;

  while (selected.length < params.topN && currentMinHamming >= 0) {
    for (const sc of deduped) {
      if (selected.length >= params.topN) break;
      // Apply niche sharing penalty based on already-selected
      const nichedScore = applyNicheSharing(
        sc,
        selected,
        spaces,
        nicheRadius,
        nichePenalty
      );
      if (nichedScore <= -999) continue;

      // Check minimum Hamming distance from all already-selected
      const tooClose = selected.some(
        (sel) =>
          hammingDistance(sc.chromosome, sel.chromosome, spaces) <
          currentMinHamming
      );
      if (!tooClose) {
        selected.push(sc);
      }
    }
    // If we couldn't fill topN, relax the constraint
    if (selected.length < params.topN) {
      currentMinHamming--;
    } else {
      break;
    }
  }

  // Fallback: if still not enough, just take top by fitness
  if (selected.length < params.topN) {
    for (const sc of deduped) {
      if (selected.length >= params.topN) break;
      if (!selected.includes(sc)) {
        selected.push(sc);
      }
    }
  }

  // Convert to ZoningCandidates
  const candidates: ZoningCandidate[] = selected.map((sc, i) =>
    toCandidate(sc, i, spaces, maxFloors)
  );

  const computeTimeMs = performance.now() - startTime;

  return {
    programSpecId: spec.id,
    generatedAt: new Date().toISOString(),
    gaParams: {
      populationSize: params.populationSize,
      generations: params.generations,
      tournamentSize: params.tournamentSize,
      crossoverRate: params.crossoverRate,
      mutationRate: params.mutationRate,
      eliteCount: params.eliteCount,
    },
    fitnessWeights: weights,
    candidates,
    computeTimeMs,
  };
}

/**
 * Create a fingerprint string for deduplication.
 */
function fingerprint(
  chromosome: Chromosome,
  spaces: SpaceType[]
): string {
  return spaces.map((s) => `${s.id}:${chromosome[s.id]}`).join("|");
}

// ---- Re-evaluate a manually adjusted candidate ----------------------

/**
 * Re-evaluate fitness for a manually adjusted floor assignment.
 *
 * Used when the architect drags a space to a different floor.
 */
export function reEvaluateCandidate(
  floors: FloorAssignment[],
  spec: ProgramSpec,
  weights: FitnessWeights = DEFAULT_FITNESS_WEIGHTS
): FitnessBreakdown {
  // Reconstruct chromosome from floor assignments
  const chromosome: Chromosome = {};
  for (const floor of floors) {
    for (const spaceId of floor.spaceIds) {
      chromosome[spaceId] = floor.floorIndex;
    }
  }
  return evaluateFitness(chromosome, spec, weights);
}
