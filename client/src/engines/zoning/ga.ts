// ============================================================
// SentiArch — Genetic Algorithm for Zoning
//
// Client-side GA that evolves zoning candidates.
// Population of chromosomes (space → block+floor mappings)
// evolved via tournament selection, crossover, and mutation.
// Returns top N candidates sorted by fitness.
//
// v3 — Multi-block zoning:
//   - Chromosome genes encode (blockIndex, floorIndex) as a
//     single integer: gene = block * maxFloors + floor.
//   - Mutation can change block, floor, or both.
//   - Smart seeds create diverse starting configurations:
//     some single-block, some 2-block, some 3-block.
//   - Diversity enforcement ensures returned candidates have
//     genuinely different spatial arrangements.
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
  decodeGene,
  encodeGene,
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
  /** Minimum Hamming distance between returned candidates */
  minHammingDistance?: number;
  /** Niche radius for sharing penalty */
  nicheRadius?: number;
  /** Niche penalty strength */
  nichePenalty?: number;
}

export const DEFAULT_GA_PARAMS: GAParams = {
  populationSize: 200,
  generations: 400,
  tournamentSize: 4,
  crossoverRate: 0.8,
  mutationRate: 0.25,
  eliteCount: 3,
  topN: 5,
  minHammingDistance: 5,
  nicheRadius: 8,
  nichePenalty: 0.08,
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
 * For multi-block, randomly assigns each space to a block and floor.
 */
function randomChromosome(
  spaces: SpaceType[],
  maxFloors: number,
  maxBlocks: number
): Chromosome {
  const chromosome: Chromosome = {};
  for (const s of spaces) {
    if (s.floorMandatory !== undefined) {
      // Mandatory floor, random block (but block 0 for ground-locked)
      const block = s.floorMandatory === 0
        ? 0 // Ground-locked spaces stay in block 0
        : Math.floor(Math.random() * maxBlocks);
      chromosome[s.id] = encodeGene(block, s.floorMandatory, maxFloors);
    } else {
      const block = Math.floor(Math.random() * maxBlocks);
      const floor = Math.floor(Math.random() * maxFloors);
      chromosome[s.id] = encodeGene(block, floor, maxFloors);
    }
  }
  return chromosome;
}

/**
 * Create a smart-seeded chromosome with a specific block strategy.
 *
 * strategy:
 *   "single" — all spaces in block 0 (traditional single-building)
 *   "split-2" — spaces split into 2 blocks by category
 *   "split-3" — spaces split into 3 blocks by function
 *   "random" — random block assignment (for diversity)
 */
function smartSeedChromosome(
  spaces: SpaceType[],
  maxFloors: number,
  maxBlocks: number,
  strategy: "single" | "split-2" | "split-3" | "random"
): Chromosome {
  const chromosome: Chromosome = {};

  for (const s of spaces) {
    let block: number;
    let floor: number;

    // Floor assignment: mandatory or random
    if (s.floorMandatory !== undefined) {
      floor = s.floorMandatory;
      block = 0; // Ground-locked stays in block 0
      chromosome[s.id] = encodeGene(block, floor, maxFloors);
      continue;
    }

    // Floor: random for most spaces (GA will optimise)
    floor = Math.floor(Math.random() * maxFloors);

    // Block assignment by strategy
    switch (strategy) {
      case "single":
        block = 0;
        break;

      case "split-2":
        // Block 0: academic + science + admin
        // Block 1: art + sport + public + residential + support
        if (maxBlocks < 2) {
          block = 0;
        } else if (
          s.category === "academic" ||
          s.category === "science" ||
          s.category === "admin"
        ) {
          block = 0;
        } else {
          block = 1;
        }
        break;

      case "split-3":
        // Block 0: academic + admin (teaching block)
        // Block 1: art + public (creative/public block)
        // Block 2: sport + residential + support (living/sports block)
        if (maxBlocks < 3) {
          block = maxBlocks < 2 ? 0 : (
            s.category === "academic" || s.category === "admin" || s.category === "science"
              ? 0 : 1
          );
        } else if (
          s.category === "academic" ||
          s.category === "admin" ||
          s.category === "science"
        ) {
          block = 0;
        } else if (
          s.category === "art" ||
          s.category === "public"
        ) {
          block = 1;
        } else {
          block = 2;
        }
        break;

      case "random":
        block = Math.floor(Math.random() * maxBlocks);
        break;
    }

    // Add jitter: 20% chance of switching to a different block
    if (Math.random() < 0.2 && maxBlocks > 1) {
      block = Math.floor(Math.random() * maxBlocks);
    }

    chromosome[s.id] = encodeGene(block, floor, maxFloors);
  }

  return chromosome;
}

// ---- Diversity Metrics -----------------------------------------------

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
      sharingSum += 1 - dist / nicheRadius;
    }
  }
  return sc.fitness.totalScore * (1 - nichePenalty * sharingSum);
}

// ---- GA Operators ----------------------------------------------------

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
 * Uniform crossover: for each space, randomly pick the gene
 * from parent A or parent B.
 */
function crossover(
  parentA: Chromosome,
  parentB: Chromosome,
  spaces: SpaceType[],
  maxFloors: number
): Chromosome {
  const child: Chromosome = {};
  for (const s of spaces) {
    if (s.floorMandatory !== undefined) {
      child[s.id] = encodeGene(0, s.floorMandatory, maxFloors);
    } else {
      child[s.id] = Math.random() < 0.5
        ? parentA[s.id]
        : parentB[s.id];
    }
  }
  return child;
}

/**
 * Mutation: can change block, floor, or both.
 *
 * - 40% chance: change floor only (within same block)
 * - 30% chance: change block only (keep same floor)
 * - 30% chance: change both (fully random)
 */
function mutate(
  chromosome: Chromosome,
  spaces: SpaceType[],
  maxFloors: number,
  maxBlocks: number,
  mutationRate: number
): Chromosome {
  const mutated = { ...chromosome };
  for (const s of spaces) {
    if (s.floorMandatory !== undefined) continue;
    if (Math.random() < mutationRate) {
      const current = decodeGene(mutated[s.id], maxFloors);
      const roll = Math.random();

      if (roll < 0.4) {
        // Change floor only
        const newFloor = Math.floor(Math.random() * maxFloors);
        mutated[s.id] = encodeGene(current.block, newFloor, maxFloors);
      } else if (roll < 0.7) {
        // Change block only
        const newBlock = Math.floor(Math.random() * maxBlocks);
        mutated[s.id] = encodeGene(newBlock, current.floor, maxFloors);
      } else {
        // Change both
        const newBlock = Math.floor(Math.random() * maxBlocks);
        const newFloor = Math.floor(Math.random() * maxFloors);
        mutated[s.id] = encodeGene(newBlock, newFloor, maxFloors);
      }
    }
  }
  return mutated;
}

// ---- Chromosome → ZoningCandidate Conversion -------------------------

/**
 * Convert a scored chromosome to a ZoningCandidate.
 *
 * v3: FloorAssignment entries now include blockIndex.
 * Floors are grouped by (block, floor) combination.
 */
function toCandidate(
  scored: ScoredChromosome,
  rank: number,
  spaces: SpaceType[],
  maxFloors: number
): ZoningCandidate {
  const spaceMap = new Map<string, SpaceType>();
  for (const s of spaces) {
    spaceMap.set(s.id, s);
  }

  // Group by (block, floor)
  const groups = new Map<string, { block: number; floor: number; spaceIds: string[] }>();

  for (const [spaceId, gene] of Object.entries(scored.chromosome)) {
    const { block, floor } = decodeGene(gene, maxFloors);
    const key = `${block}-${floor}`;
    if (!groups.has(key)) {
      groups.set(key, { block, floor, spaceIds: [] });
    }
    groups.get(key)!.spaceIds.push(spaceId);
  }

  // Convert to FloorAssignment array, sorted by block then floor
  const floors: FloorAssignment[] = [];
  const sortedEntries = Array.from(groups.values()).sort((a, b) =>
    a.block !== b.block ? a.block - b.block : a.floor - b.floor
  );

  for (const entry of sortedEntries) {
    let totalAreaM2 = 0;
    for (const id of entry.spaceIds) {
      const s = spaceMap.get(id);
      if (s) totalAreaM2 += s.quantity * s.areaPerUnit;
    }
    floors.push({
      floorIndex: entry.floor,
      spaceIds: entry.spaceIds,
      totalAreaM2,
      blockIndex: entry.block,
    });
  }

  // Count unique blocks
  const blockSet = new Set(sortedEntries.map((e) => e.block));

  return {
    id: `candidate-${rank}`,
    rank,
    floors,
    fitness: scored.fitness,
    generation: scored.generation,
    blockCount: blockSet.size,
  };
}

// ---- Main GA Runner --------------------------------------------------

export type GAProgressCallback = (
  generation: number,
  totalGenerations: number,
  bestScore: number
) => void;

/**
 * Run the genetic algorithm to produce optimized zoning candidates.
 *
 * v3: Multi-block support. Chromosomes encode (block, floor) per space.
 * Smart seeds include single-block, 2-block, and 3-block strategies
 * to ensure diverse starting configurations.
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
  const maxBlocks = constraints.maxBlocks ?? 1;
  const nicheRadius = params.nicheRadius ?? 8;
  const nichePenalty = params.nichePenalty ?? 0.08;
  const minHamming = params.minHammingDistance ?? 5;

  // ---- Initialise population ----
  let population: ScoredChromosome[] = [];

  // Seed strategies: mix of single-block, 2-block, 3-block, and random
  const strategies: Array<"single" | "split-2" | "split-3" | "random"> =
    maxBlocks >= 3
      ? ["single", "split-2", "split-3", "random"]
      : maxBlocks >= 2
        ? ["single", "split-2", "random"]
        : ["single", "random"];

  const smartCount = Math.floor(params.populationSize * 0.4);

  for (let i = 0; i < params.populationSize; i++) {
    let chromosome: Chromosome;
    if (i < smartCount) {
      const strategy = strategies[i % strategies.length];
      chromosome = smartSeedChromosome(spaces, maxFloors, maxBlocks, strategy);
    } else {
      chromosome = randomChromosome(spaces, maxFloors, maxBlocks);
    }
    const fitness = evaluateFitness(chromosome, spec, weights);
    population.push({ chromosome, fitness, generation: 0 });
  }

  // Track all-time best
  const allTimeBest: ScoredChromosome[] = [];
  const ALL_TIME_BEST_CAP = params.topN * 30;

  // ---- Evolution loop ----
  const YIELD_INTERVAL = 20;

  for (let gen = 0; gen < params.generations; gen++) {
    population.sort(
      (a, b) => b.fitness.totalScore - a.fitness.totalScore
    );

    if (
      population[0].fitness.totalScore > -999 &&
      allTimeBest.length < ALL_TIME_BEST_CAP
    ) {
      allTimeBest.push({ ...population[0], generation: gen });
    }

    if (onProgress) {
      onProgress(gen, params.generations, population[0].fitness.totalScore);
    }

    if (gen % YIELD_INTERVAL === 0 && gen > 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // ---- Create next generation ----
    const nextGen: ScoredChromosome[] = [];

    // Elitism
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
          spaces,
          maxFloors
        );
      } else {
        childChromosome =
          parentA.fitness.totalScore >= parentB.fitness.totalScore
            ? { ...parentA.chromosome }
            : { ...parentB.chromosome };
      }

      childChromosome = mutate(
        childChromosome,
        spaces,
        maxFloors,
        maxBlocks,
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

  // ---- Final selection with diversity enforcement ----
  const combined = [...population, ...allTimeBest];
  combined.sort(
    (a, b) => b.fitness.totalScore - a.fitness.totalScore
  );

  // Deduplicate by exact chromosome fingerprint
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

  // Greedy diversity-enforced selection
  const selected: ScoredChromosome[] = [];
  let currentMinHamming = minHamming;

  while (selected.length < params.topN && currentMinHamming >= 0) {
    for (const sc of deduped) {
      if (selected.length >= params.topN) break;

      const nichedScore = applyNicheSharing(
        sc,
        selected,
        spaces,
        nicheRadius,
        nichePenalty
      );
      if (nichedScore <= -999) continue;

      const tooClose = selected.some(
        (sel) =>
          hammingDistance(sc.chromosome, sel.chromosome, spaces) <
          currentMinHamming
      );
      if (!tooClose) {
        selected.push(sc);
      }
    }
    if (selected.length < params.topN) {
      currentMinHamming--;
    } else {
      break;
    }
  }

  // Fallback
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
 * v3: Reconstructs multi-block chromosome from FloorAssignment
 * entries that may include blockIndex.
 */
export function reEvaluateCandidate(
  floors: FloorAssignment[],
  spec: ProgramSpec,
  weights: FitnessWeights = DEFAULT_FITNESS_WEIGHTS
): FitnessBreakdown {
  const maxFloors = spec.constraints.maxFloors;
  const chromosome: Chromosome = {};
  for (const floor of floors) {
    const block = floor.blockIndex ?? 0;
    for (const spaceId of floor.spaceIds) {
      chromosome[spaceId] = encodeGene(block, floor.floorIndex, maxFloors);
    }
  }
  return evaluateFitness(chromosome, spec, weights);
}
