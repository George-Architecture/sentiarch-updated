// ============================================================
// SentiArch — Genetic Algorithm for Zoning
//
// Client-side GA that evolves zoning candidates.
// Population of chromosomes (space → floor mappings) evolved
// via tournament selection, crossover, and mutation.
// Returns top N candidates sorted by fitness.
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
}

export const DEFAULT_GA_PARAMS: GAParams = {
  populationSize: 100,
  generations: 200,
  tournamentSize: 5,
  crossoverRate: 0.8,
  mutationRate: 0.15,
  eliteCount: 5,
  topN: 5,
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
        // Pick a floor based on preference or random
        const floor = preferenceToFloor(s.floorPreference, maxFloors);
        clusterFloors.set(s.clusterGroup, floor);
      }
      chromosome[s.id] = clusterFloors.get(s.clusterGroup)!;
    } else {
      chromosome[s.id] = preferenceToFloor(
        s.floorPreference,
        maxFloors
      );
    }
  }

  return chromosome;
}

/**
 * Convert a floor preference to a concrete floor number.
 */
function preferenceToFloor(
  pref: string,
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
      mutated[s.id] = Math.floor(Math.random() * maxFloors);
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

  // ---- Initialise population ----
  let population: ScoredChromosome[] = [];

  // Seed 20% with smart chromosomes, 80% random
  const smartCount = Math.floor(params.populationSize * 0.2);
  for (let i = 0; i < params.populationSize; i++) {
    const chromosome =
      i < smartCount
        ? smartSeedChromosome(spaces, maxFloors)
        : randomChromosome(spaces, maxFloors);
    const fitness = evaluateFitness(chromosome, spec, weights);
    population.push({ chromosome, fitness, generation: 0 });
  }

  // Track all-time best individuals
  const allTimeBest: ScoredChromosome[] = [];

  // ---- Evolution loop ----
  const YIELD_INTERVAL = 20; // Yield to UI every N generations

  for (let gen = 0; gen < params.generations; gen++) {
    // Sort by fitness (descending)
    population.sort(
      (a, b) => b.fitness.totalScore - a.fitness.totalScore
    );

    // Track best
    if (population[0].fitness.totalScore > -999) {
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

    // Elitism: keep top N
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

  // ---- Final sort and select top N ----
  // Merge all-time best with final population
  const combined = [...population, ...allTimeBest];
  combined.sort(
    (a, b) => b.fitness.totalScore - a.fitness.totalScore
  );

  // Deduplicate by chromosome fingerprint
  const seen = new Set<string>();
  const unique: ScoredChromosome[] = [];
  for (const sc of combined) {
    const key = fingerprint(sc.chromosome, spaces);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(sc);
    }
    if (unique.length >= params.topN) break;
  }

  // Convert to ZoningCandidates
  const candidates: ZoningCandidate[] = unique.map((sc, i) =>
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
