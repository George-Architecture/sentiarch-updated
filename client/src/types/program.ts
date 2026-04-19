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

// ---- Constants -------------------------------------------------------

/**
 * Current schema version.
 *
 * Bump this (and add a migration) whenever the ProgramSpec
 * shape changes in a backwards-incompatible way.
 */
export const PROGRAM_SPEC_SCHEMA_VERSION = "1.0.0" as const;

/**
 * Regex for valid IDs (kebab-case: lowercase alphanumeric + hyphens).
 *
 * Applied to `SpaceType.id` and `AdjacencyRule.id` to ensure
 * consistent, URL-safe, human-readable identifiers.
 */
const KEBAB_CASE_RE = /^[a-z0-9-]+$/;

// ---- Enums & Literals ------------------------------------------------

/**
 * Functional category of a space.
 *
 * **Category is a hard classification** — every space belongs to
 * exactly one category.  It drives default colour-coding in the
 * 3-D viewer and provides a coarse filter for the zoning
 * algorithm.
 *
 * Compare with {@link SpaceType.clusterGroup}, which is a **soft
 * zoning hint** (see below).
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
 *
 * **Refinement (#6):** When both `minArea` and `maxArea` are
 * provided, `minArea ≤ areaPerUnit ≤ maxArea` and
 * `minArea ≤ maxArea` must hold.
 */
export const SpaceTypeSchema = z
  .object({
    /** Kebab-case identifier (e.g. `"sci-physics-lab"`). */
    id: z.string().regex(KEBAB_CASE_RE),
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
     * Horizontal clustering tag — a **soft zoning hint**.
     *
     * Spaces that share the same `clusterGroup` string are
     * preferred to be placed on the **same floor** (horizontal
     * clustering).  This is NOT vertical stacking — a separate
     * `verticalStackGroup` may be introduced in a future phase
     * if needed.
     *
     * **Distinction from `category`:**
     * - `category` is a **hard classification** (exactly one per
     *   space) used for colour-coding and coarse filtering.
     * - `clusterGroup` is a **soft zoning hint** (optional,
     *   free-form string) used by the solver to prefer co-locating
     *   spaces on the same floor.  A space may share a
     *   `clusterGroup` with spaces from a different `category`.
     *
     * Examples: `"science"`, `"art"`, `"admin"`.
     */
    clusterGroup: z.string().optional(),
    /** Hex colour for 3-D / 2-D visualisation (e.g. `"#4A90D9"`). */
    colorHex: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    /**
     * Whether this space is an outdoor space (e.g. rooftop garden,
     * open courtyard).  Defaults to `false` (indoor).
     *
     * Outdoor spaces receive different environmental defaults
     * (natural ventilation, higher air velocity, variable temperature)
     * in the simulation engine.
     */
    isOutdoor: z.boolean().optional(),
  })
  .refine(
    s => {
      if (s.minArea !== undefined && s.maxArea !== undefined) {
        return s.minArea <= s.maxArea;
      }
      return true;
    },
    { message: "minArea must be ≤ maxArea" }
  )
  .refine(
    s => {
      if (s.minArea !== undefined) {
        return s.areaPerUnit >= s.minArea;
      }
      return true;
    },
    { message: "areaPerUnit must be ≥ minArea" }
  )
  .refine(
    s => {
      if (s.maxArea !== undefined) {
        return s.areaPerUnit <= s.maxArea;
      }
      return true;
    },
    { message: "areaPerUnit must be ≤ maxArea" }
  );

/**
 * An adjacency rule between two spaces.
 *
 * **Adjacency is UNDIRECTED.**  To avoid duplicate-key issues
 * the pair is normalised so that `fromSpaceId < toSpaceId` by
 * standard string comparison (`String.prototype.localeCompare`).
 * Use the {@link createAdjacencyRule} helper to guarantee this
 * invariant.
 *
 * **Refinements (#4, #5):**
 * - `fromSpaceId !== toSpaceId` (no self-loops)
 * - `fromSpaceId.localeCompare(toSpaceId) < 0` (normalisation)
 */
export const AdjacencyRuleSchema = z
  .object({
    /** Kebab-case identifier (e.g. `"adj-art-music-band"`). */
    id: z.string().regex(KEBAB_CASE_RE),
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
    /**
     * Importance weight in the range (0, 1].
     *
     * - `1.0` — maximum priority (hard constraint).
     * - Values closer to `0` indicate lower priority.
     * - `0` is **not allowed**: a weight of zero would mean the
     *   rule has no effect; remove the rule instead.
     *
     * The minimum is `0.01` to avoid ambiguity between "disabled"
     * and "minimum priority".
     */
    weight: z.number().min(0.01).max(1),
    /** Human-readable justification for the rule. */
    reason: z.string().optional(),
  })
  .refine(r => r.fromSpaceId !== r.toSpaceId, {
    message: "Self-loop: fromSpaceId must differ from toSpaceId",
  })
  .refine(r => r.fromSpaceId.localeCompare(r.toSpaceId) < 0, {
    message:
      "Normalisation violated: fromSpaceId must be < toSpaceId " +
      "by localeCompare",
  });

/**
 * Site-level and building-envelope constraints.
 *
 * **Refinement (#8):** `maxFloors × floorHeight ≤ maxBuildingHeightM`.
 */
export const BuildingConstraintSchema = z
  .object({
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
  })
  .refine(
    c => c.maxFloors * c.floorHeight <= c.maxBuildingHeightM,
    {
      message:
        "maxFloors × floorHeight exceeds maxBuildingHeightM",
    }
  );

/**
 * Top-level programme specification.
 *
 * This is the single source of truth consumed by every
 * downstream engine in the SentiArch parametric pipeline.
 *
 * **Refinements (#1, #2, #3, #7):**
 * - `schemaVersion` must be `"1.0.0"` (migration foundation).
 * - All `spaces[].id` and `adjacencies[].id` must be unique.
 * - Every `adjacencies[].fromSpaceId` and `toSpaceId` must
 *   reference an existing `spaces[].id`.
 * - Every `spaces[].floorMandatory` (when set) must be
 *   `< constraints.maxFloors` (0-indexed).
 */
export const ProgramSpecSchema = z
  .object({
    id: z.string(),
    /** Schema version for future migration support. */
    schemaVersion: z.literal(PROGRAM_SPEC_SCHEMA_VERSION),
    name: z.string(),
    description: z.string().optional(),
    spaces: z.array(SpaceTypeSchema),
    adjacencies: z.array(AdjacencyRuleSchema),
    constraints: BuildingConstraintSchema,
    /** ISO-8601 timestamp. */
    createdAt: z.string().datetime(),
    /** ISO-8601 timestamp. */
    updatedAt: z.string().datetime(),
  })
  .superRefine((spec, ctx) => {
    // --- #3: Unique space IDs ---
    const spaceIds = new Set<string>();
    for (const s of spec.spaces) {
      if (spaceIds.has(s.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate space ID: "${s.id}"`,
          path: ["spaces"],
        });
      }
      spaceIds.add(s.id);
    }

    // --- #3: Unique adjacency IDs ---
    const adjIds = new Set<string>();
    for (const a of spec.adjacencies) {
      if (adjIds.has(a.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate adjacency ID: "${a.id}"`,
          path: ["adjacencies"],
        });
      }
      adjIds.add(a.id);
    }

    // --- #2: Cross-reference check ---
    for (const a of spec.adjacencies) {
      if (!spaceIds.has(a.fromSpaceId)) {
        ctx.addIssue({
          code: "custom",
          message:
            `Adjacency "${a.id}" references unknown ` +
            `fromSpaceId: "${a.fromSpaceId}"`,
          path: ["adjacencies"],
        });
      }
      if (!spaceIds.has(a.toSpaceId)) {
        ctx.addIssue({
          code: "custom",
          message:
            `Adjacency "${a.id}" references unknown ` +
            `toSpaceId: "${a.toSpaceId}"`,
          path: ["adjacencies"],
        });
      }
    }

    // --- #7: floorMandatory < maxFloors ---
    for (const s of spec.spaces) {
      if (
        s.floorMandatory !== undefined &&
        s.floorMandatory >= spec.constraints.maxFloors
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            `Space "${s.id}" has floorMandatory=${s.floorMandatory} ` +
            `but maxFloors=${spec.constraints.maxFloors} ` +
            `(must be < maxFloors, 0-indexed)`,
          path: ["spaces"],
        });
      }
    }
  });

// ---- Inferred TypeScript Types ---------------------------------------

export type SpaceType = z.infer<typeof SpaceTypeSchema>;
export type AdjacencyRule = z.infer<typeof AdjacencyRuleSchema>;
export type BuildingConstraint = z.infer<
  typeof BuildingConstraintSchema
>;
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
