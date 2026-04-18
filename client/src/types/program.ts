// ============================================================
// SentiArch — Program Specification Data Schema
// Phase 1, Step 1: Program Specification Editor
//
// This module defines the canonical data model that every
// downstream engine (zoning, stacking, massing, envelope,
// interior-layout) consumes.  It is intentionally decoupled
// from any UI component so that the schema can be reviewed,
// validated, and versioned independently.
// ============================================================

import { z, type ZodSafeParseResult } from "zod/v4";

// ---- Enums & Literals ------------------------------------------------

/**
 * Functional category of a space.
 *
 * Categories drive default colour-coding in the 3-D viewer and
 * provide a coarse filter for the zoning algorithm.
 */
export const SpaceCategoryValues = [
  "academic",
  "art",
  "science",
  "public",
  "sport",
  "support",
  "residential",
  "admin",
] as const;

export type SpaceCategory = (typeof SpaceCategoryValues)[number];

/**
 * Physical or environmental feature that a space requires.
 *
 * These are consumed by the constraint solver to filter
 * candidate floor-plate positions.
 */
export const SpaceFeatureValues = [
  "natural_light",
  "natural_ventilation",
  "acoustic_isolation",
  "wet_services",
  "heavy_load",
  "accessible",
  "external_access",
] as const;

export type SpaceFeature = (typeof SpaceFeatureValues)[number];

/**
 * Soft floor-preference hint.
 *
 * The zoning algorithm should first satisfy any hard
 * `floorMandatory` constraint, then optimise for the soft
 * preference expressed here.
 *
 * - `ground` — ground floor (G/F)
 * - `low`    — floors 1–2
 * - `mid`    — floors 3–4
 * - `high`   — floors 5+
 * - `any`    — no preference
 */
export const FloorPreferenceValues = [
  "ground",
  "low",
  "mid",
  "high",
  "any",
] as const;

export type FloorPreference = (typeof FloorPreferenceValues)[number];

/**
 * Adjacency relationship type between two spaces.
 *
 * Ordered from hardest to softest constraint:
 * - `must_adjacent`   — hard: spaces share a wall / direct opening
 * - `should_adjacent` — strong preference, penalised if violated
 * - `prefer_nearby`   — soft: minimise walking distance
 * - `must_separate`   — hard: spaces must NOT be adjacent (noise, fumes …)
 */
export const AdjacencyTypeValues = [
  "must_adjacent",
  "should_adjacent",
  "prefer_nearby",
  "must_separate",
] as const;

export type AdjacencyType = (typeof AdjacencyTypeValues)[number];

// ---- Zod Schemas -----------------------------------------------------

export const SpaceFeatureSchema = z.enum(SpaceFeatureValues);

export const FloorPreferenceSchema = z.enum(FloorPreferenceValues);

export const SpaceCategorySchema = z.enum(SpaceCategoryValues);

export const AdjacencyTypeSchema = z.enum(AdjacencyTypeValues);

/**
 * A single space type in the programme.
 *
 * `quantity` × `areaPerUnit` gives the total area contribution.
 * `minArea` / `maxArea` bound the per-unit area for the solver.
 */
export const SpaceTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: SpaceCategorySchema,
  quantity: z.number().int().min(1),
  /** Nominal area per unit in m². */
  areaPerUnit: z.number().positive(),
  /** Optional lower bound for per-unit area (m²). */
  minArea: z.number().positive().optional(),
  /** Optional upper bound for per-unit area (m²). */
  maxArea: z.number().positive().optional(),
  /** Expected number of occupants per unit. */
  occupancy: z.number().int().min(0),
  requiredFeatures: z.array(SpaceFeatureSchema),
  /**
   * Soft floor-preference hint.
   * The zoning algorithm should first satisfy any hard
   * `floorMandatory` constraint, then optimise for this value.
   */
  floorPreference: FloorPreferenceSchema,
  /**
   * Hard constraint: the space MUST be placed on exactly this
   * floor number (0 = G/F).  Takes precedence over
   * `floorPreference`.
   */
  floorMandatory: z.number().int().min(0).optional(),
  /**
   * Horizontal clustering tag.
   *
   * Spaces that share the same `clusterGroup` string are
   * preferred to be placed on the **same floor** (horizontal
   * clustering).  This is NOT vertical stacking — a separate
   * `verticalStackGroup` may be introduced in a future phase
   * if needed.
   *
   * Examples: `"science"`, `"art"`, `"admin"`.
   */
  clusterGroup: z.string().optional(),
  /** Hex colour for 3-D / 2-D visualisation (e.g. `"#4A90D9"`). */
  colorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

/**
 * An adjacency rule between two spaces.
 *
 * **Adjacency is UNDIRECTED.**  To avoid duplicate-key issues
 * the pair is normalised so that `fromSpaceId < toSpaceId` by
 * standard string comparison (`String.prototype.localeCompare`).
 * Use the {@link createAdjacencyRule} helper to guarantee this
 * invariant.
 */
export const AdjacencyRuleSchema = z.object({
  id: z.string(),
  /**
   * First space ID in the normalised pair.
   * Invariant: `fromSpaceId < toSpaceId` (by `localeCompare`).
   */
  fromSpaceId: z.string(),
  /**
   * Second space ID in the normalised pair.
   * Invariant: `fromSpaceId < toSpaceId` (by `localeCompare`).
   */
  toSpaceId: z.string(),
  type: AdjacencyTypeSchema,
  /** Importance weight in the range [0, 1]. */
  weight: z.number().min(0).max(1),
  /** Human-readable justification for the rule. */
  reason: z.string().optional(),
});

/**
 * Site-level and building-envelope constraints.
 */
export const BuildingConstraintSchema = z.object({
  /** Maximum number of above-ground floors. */
  maxFloors: z.number().int().min(1),
  /** Standard floor-to-floor height in metres. */
  floorHeight: z.number().positive(),
  /** Total site area in m². */
  siteAreaM2: z.number().positive(),
  /** Absolute building height limit in metres (e.g. HK limit 24 m). */
  maxBuildingHeightM: z.number().positive(),
  /** Minimum corridor width in metres (e.g. 1.5 m). */
  minCorridorWidthM: z.number().positive(),
  /** Optional target gross floor area in m². */
  targetTotalAreaM2: z.number().positive().optional(),
});

/**
 * Top-level programme specification.
 *
 * This is the single source of truth consumed by every
 * downstream engine in the SentiArch parametric pipeline.
 */
export const ProgramSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  spaces: z.array(SpaceTypeSchema),
  adjacencies: z.array(AdjacencyRuleSchema),
  constraints: BuildingConstraintSchema,
  /** ISO-8601 timestamp. */
  createdAt: z.string().datetime(),
  /** ISO-8601 timestamp. */
  updatedAt: z.string().datetime(),
});

// ---- Inferred TypeScript Types ---------------------------------------

export type SpaceType = z.infer<typeof SpaceTypeSchema>;
export type AdjacencyRule = z.infer<typeof AdjacencyRuleSchema>;
export type BuildingConstraint = z.infer<typeof BuildingConstraintSchema>;
export type ProgramSpec = z.infer<typeof ProgramSpecSchema>;

// ---- Helper Functions ------------------------------------------------

/**
 * Create an {@link AdjacencyRule} with automatic normalisation of
 * the space-ID pair so that `fromSpaceId < toSpaceId`.
 *
 * This guarantees the undirected-edge invariant and prevents
 * duplicate keys when the same pair is referenced in different
 * order.
 *
 * @example
 * ```ts
 * const rule = createAdjacencyRule({
 *   id: "adj-01",
 *   fromSpaceId: "chem-lab",
 *   toSpaceId: "bio-lab",
 *   type: "should_adjacent",
 *   weight: 0.8,
 *   reason: "Shared prep room",
 * });
 * // rule.fromSpaceId === "bio-lab"  (sorted)
 * // rule.toSpaceId   === "chem-lab"
 * ```
 */
export function createAdjacencyRule(
  params: Omit<AdjacencyRule, "fromSpaceId" | "toSpaceId"> & {
    fromSpaceId: string;
    toSpaceId: string;
  }
): AdjacencyRule {
  const { fromSpaceId, toSpaceId, ...rest } = params;

  // Normalise: smaller ID first by locale-independent comparison.
  const [normFrom, normTo] =
    fromSpaceId.localeCompare(toSpaceId) <= 0
      ? [fromSpaceId, toSpaceId]
      : [toSpaceId, fromSpaceId];

  const rule: AdjacencyRule = {
    ...rest,
    fromSpaceId: normFrom,
    toSpaceId: normTo,
  };

  // Runtime validation (throws on invalid data).
  return AdjacencyRuleSchema.parse(rule);
}

/**
 * Validate a complete {@link ProgramSpec} object at runtime.
 *
 * Returns a discriminated result so callers can handle errors
 * without try/catch.
 */
export function validateProgramSpec(
  data: unknown
): ZodSafeParseResult<ProgramSpec> {
  return ProgramSpecSchema.safeParse(data);
}

/**
 * Compute the total gross floor area implied by the programme.
 *
 * This is a convenience helper for quick feasibility checks
 * before running the full solver.
 */
export function computeTotalArea(spaces: SpaceType[]): number {
  return spaces.reduce(
    (sum, s) => sum + s.quantity * s.areaPerUnit,
    0
  );
}

/**
 * Look up all adjacency rules that reference a given space ID.
 */
export function getAdjacenciesForSpace(
  spaceId: string,
  adjacencies: AdjacencyRule[]
): AdjacencyRule[] {
  return adjacencies.filter(
    a => a.fromSpaceId === spaceId || a.toSpaceId === spaceId
  );
}
