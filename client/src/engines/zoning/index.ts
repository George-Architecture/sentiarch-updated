// ============================================================
// SentiArch — Zoning Engine (barrel export)
// ============================================================

export {
  evaluateFitness,
  DEFAULT_FITNESS_WEIGHTS,
  type Chromosome,
  type FitnessWeights,
} from "./fitness";

export {
  runZoningGA,
  reEvaluateCandidate,
  DEFAULT_GA_PARAMS,
  type GAParams,
  type GAProgressCallback,
} from "./ga";
