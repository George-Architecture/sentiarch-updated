// ============================================================
// SentiArch — Layout Generation Data Types
// Phase 1, Step 3: Layout Generation
//
// Defines the output of the layout engine — 2D floor plans with
// room polygons, walls, doors, corridors, and quality scores.
// This is the contract between Step 3 (Layout) and Step 4
// (Massing Extrusion).
// ============================================================

import { z } from "zod/v4";

// ---- Geometry Primitives ------------------------------------------------

/**
 * A 2D point in metres, relative to the site boundary origin.
 *
 * The coordinate system uses:
 * - x: horizontal (east-positive)
 * - y: vertical (north-positive)
 */
export const Point2DSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type Point2D = z.infer<typeof Point2DSchema>;

/**
 * A 2D polygon defined by an ordered array of vertices.
 *
 * Vertices are in counter-clockwise order.  The polygon is
 * implicitly closed (last vertex connects to first).
 */
export const Polygon2DSchema = z.object({
  vertices: z.array(Point2DSchema).min(3),
});

export type Polygon2D = z.infer<typeof Polygon2DSchema>;

// ---- Site Boundary ------------------------------------------------------

/**
 * The site boundary polygon drawn by the architect.
 *
 * All layout generation operates within this boundary.
 * Area is pre-computed for display and validation.
 */
export const SiteBoundarySchema = z.object({
  /** Polygon vertices in metres. */
  polygon: Polygon2DSchema,
  /** Computed area in m². */
  areaM2: z.number().positive(),
});

export type SiteBoundary = z.infer<typeof SiteBoundarySchema>;

// ---- Room Placement -----------------------------------------------------

/**
 * A single room placement within a floor layout.
 *
 * Each room corresponds to one SpaceType instance from the
 * ProgramSpec.  The room is represented as a rectangular region
 * (axis-aligned bounding box) for simplicity in the initial
 * CSP solver.
 */
export const RoomPlacementSchema = z.object({
  /** Reference to the SpaceType.id from ProgramSpec. */
  spaceId: z.string(),
  /** Display name (copied from SpaceType.name). */
  name: z.string(),
  /** Category for colour-coding. */
  category: z.string(),
  /** Room polygon (typically rectangular). */
  polygon: Polygon2DSchema,
  /** Actual area of the room in m² (computed from polygon). */
  areaM2: z.number().positive(),
  /** Target area from ProgramSpec (for comparison). */
  targetAreaM2: z.number().positive(),
  /** Whether this room touches the exterior wall. */
  touchesExterior: z.boolean(),
  /** Colour hex for rendering. */
  colorHex: z.string().optional(),
});

export type RoomPlacement = z.infer<typeof RoomPlacementSchema>;

// ---- Door ---------------------------------------------------------------

/**
 * A door connecting two rooms or a room and a corridor.
 */
export const DoorSchema = z.object({
  /** Position of the door centre. */
  position: Point2DSchema,
  /** Width of the door opening in metres. */
  widthM: z.number().positive(),
  /** IDs of the two spaces/corridors this door connects. */
  connects: z.tuple([z.string(), z.string()]),
});

export type Door = z.infer<typeof DoorSchema>;

// ---- Corridor -----------------------------------------------------------

/**
 * A corridor segment providing circulation between rooms.
 */
export const CorridorSchema = z.object({
  /** Unique corridor identifier. */
  id: z.string(),
  /** Corridor polygon (typically a narrow rectangle). */
  polygon: Polygon2DSchema,
  /** Corridor area in m². */
  areaM2: z.number().positive(),
  /** Width of the corridor in metres. */
  widthM: z.number().positive(),
});

export type Corridor = z.infer<typeof CorridorSchema>;

// ---- Layout Quality Score -----------------------------------------------

/**
 * Quality score breakdown for a single layout candidate.
 */
export const LayoutQualitySchema = z.object({
  /** How well adjacency rules are satisfied (0–1). */
  adjacencySatisfaction: z.number().min(0).max(1),
  /** Used area / total floor area (0–1). Higher is better. */
  areaEfficiency: z.number().min(0).max(1),
  /** Corridor area / total area (0–1). Lower is better. */
  corridorRatio: z.number().min(0).max(1),
  /**
   * Proportion of natural-light-requiring spaces that touch
   * the exterior wall (0–1).  Higher is better.
   */
  naturalLightAccess: z.number().min(0).max(1),
  /** Weighted total quality score (0–1). */
  totalScore: z.number().min(0).max(1),
});

export type LayoutQuality = z.infer<typeof LayoutQualitySchema>;

// ---- Floor Layout Candidate ---------------------------------------------

/**
 * A single layout candidate for one floor.
 *
 * Contains all room placements, corridors, doors, and the
 * quality score.
 */
export const FloorLayoutCandidateSchema = z.object({
  /** Unique candidate identifier (e.g. "floor-0-candidate-0"). */
  id: z.string(),
  /** 0-indexed floor number (0 = G/F). */
  floorIndex: z.number().int().min(0),
  /** Candidate rank (0 = best). */
  rank: z.number().int().min(0),
  /** Room placements within this layout. */
  rooms: z.array(RoomPlacementSchema),
  /** Corridor segments. */
  corridors: z.array(CorridorSchema),
  /** Doors connecting rooms and corridors. */
  doors: z.array(DoorSchema),
  /** Quality score breakdown. */
  quality: LayoutQualitySchema,
  /** Site boundary used for this layout. */
  boundary: Polygon2DSchema,
  /** Seed or strategy variant that produced this candidate. */
  generationStrategy: z.string(),
});

export type FloorLayoutCandidate = z.infer<
  typeof FloorLayoutCandidateSchema
>;

// ---- Layout Result (full output) ----------------------------------------

/**
 * Complete output of the layout generation engine.
 *
 * Contains candidates for every floor, the site boundary, and
 * references back to the source data.
 */
export const LayoutResultSchema = z.object({
  /** Reference to the ProgramSpec ID. */
  programSpecId: z.string(),
  /** Reference to the selected zoning candidate ID. */
  zoningCandidateId: z.string(),
  /** Timestamp when layouts were generated. */
  generatedAt: z.string().datetime(),
  /** The site boundary used for generation. */
  siteBoundary: SiteBoundarySchema,
  /**
   * Layout candidates grouped by floor index.
   *
   * Key: floor index (as string for JSON compat).
   * Value: array of candidates for that floor.
   */
  floorCandidates: z.record(z.string(), z.array(FloorLayoutCandidateSchema)),
  /** Total computation time in milliseconds. */
  computeTimeMs: z.number().min(0),
});

export type LayoutResult = z.infer<typeof LayoutResultSchema>;

// ---- Selected Layout (for Step 4 consumption) ---------------------------

/**
 * The architect's confirmed layout choices.
 *
 * One selected candidate per floor, ready for Step 4
 * (Massing Extrusion) consumption.
 */
export const SelectedLayoutSchema = z.object({
  programSpecId: z.string(),
  zoningCandidateId: z.string(),
  /** The site boundary. */
  siteBoundary: SiteBoundarySchema,
  /**
   * Selected layout per floor.
   *
   * Key: floor index (as string).
   * Value: the chosen FloorLayoutCandidate.
   */
  selectedFloors: z.record(z.string(), FloorLayoutCandidateSchema),
  /** Timestamp when the architect confirmed. */
  confirmedAt: z.string().datetime(),
});

export type SelectedLayout = z.infer<typeof SelectedLayoutSchema>;
