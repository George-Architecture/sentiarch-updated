// ============================================================
// SentiArch — Massing Extrusion Data Types
// Phase 1, Step 4: Massing Extrusion
//
// Defines the 3D building model produced by extruding 2D floor
// plans into volumetric boxes.  This is the contract between
// Step 4 (Massing) and Step 5 (Agent Simulation).
// ============================================================

import { z } from "zod/v4";

// ---- 3D Geometry Primitives ---------------------------------------------

/**
 * A 3D point in metres, relative to the building origin.
 *
 * Coordinate system:
 * - x: east-positive (same as 2D)
 * - y: up-positive (vertical / height)
 * - z: north-positive (mapped from 2D y-axis)
 */
export const Point3DSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export type Point3D = z.infer<typeof Point3DSchema>;

/**
 * An axis-aligned 3D bounding box defined by min and max corners.
 */
export const BBox3DSchema = z.object({
  min: Point3DSchema,
  max: Point3DSchema,
});

export type BBox3D = z.infer<typeof BBox3DSchema>;

// ---- Room Volume --------------------------------------------------------

/**
 * A 3D room volume extruded from a 2D room placement.
 *
 * Each room is an axis-aligned box with a base at the floor
 * level and a height equal to the floor-to-floor height.
 */
export const RoomVolumeSchema = z.object({
  /** Reference to the SpaceType.id from ProgramSpec. */
  spaceId: z.string(),
  /** Display name. */
  name: z.string(),
  /** Category for colour-coding. */
  category: z.string(),
  /** 0-indexed floor number. */
  floorIndex: z.number().int().min(0),
  /** 3D bounding box of the room. */
  bbox: BBox3DSchema,
  /** Floor area in m² (from 2D polygon). */
  areaM2: z.number().positive(),
  /** Volume in m³ (area × height). */
  volumeM3: z.number().positive(),
  /** Whether this room touches the building exterior. */
  touchesExterior: z.boolean(),
  /** Colour hex for rendering. */
  colorHex: z.string(),
});

export type RoomVolume = z.infer<typeof RoomVolumeSchema>;

// ---- Floor Slab ---------------------------------------------------------

/**
 * A horizontal floor slab between levels.
 *
 * Slabs are thin boxes at each floor level providing
 * structural separation between floors.
 */
export const FloorSlabSchema = z.object({
  /** 0-indexed floor number (slab sits at the bottom of this floor). */
  floorIndex: z.number().int().min(0),
  /** 3D bounding box of the slab. */
  bbox: BBox3DSchema,
  /** Slab thickness in metres. */
  thicknessM: z.number().positive(),
});

export type FloorSlab = z.infer<typeof FloorSlabSchema>;

// ---- Corridor Volume ----------------------------------------------------

/**
 * A 3D corridor volume extruded from a 2D corridor segment.
 */
export const CorridorVolumeSchema = z.object({
  /** Corridor identifier. */
  id: z.string(),
  /** 0-indexed floor number. */
  floorIndex: z.number().int().min(0),
  /** 3D bounding box. */
  bbox: BBox3DSchema,
  /** Area in m². */
  areaM2: z.number().positive(),
});

export type CorridorVolume = z.infer<typeof CorridorVolumeSchema>;

// ---- Door Volume --------------------------------------------------------

/**
 * A 3D door opening in the building model.
 */
export const DoorVolumeSchema = z.object({
  /** 3D position of the door centre (at floor level). */
  position: Point3DSchema,
  /** Door width in metres. */
  widthM: z.number().positive(),
  /** Door height in metres (typically 2.1m). */
  heightM: z.number().positive(),
  /** Floor index. */
  floorIndex: z.number().int().min(0),
  /** IDs of connected spaces. */
  connects: z.tuple([z.string(), z.string()]),
});

export type DoorVolume = z.infer<typeof DoorVolumeSchema>;

// ---- Floor Info ---------------------------------------------------------

/**
 * Aggregated information for a single floor in the massing model.
 */
export const FloorInfoSchema = z.object({
  /** 0-indexed floor number. */
  floorIndex: z.number().int().min(0),
  /** Display label (e.g. "G/F", "1/F"). */
  label: z.string(),
  /** Elevation of the floor bottom in metres. */
  elevationM: z.number().min(0),
  /** Floor-to-floor height in metres. */
  heightM: z.number().positive(),
  /** Total usable area on this floor in m². */
  totalAreaM2: z.number().min(0),
  /** Number of rooms on this floor. */
  roomCount: z.number().int().min(0),
  /** Room volumes on this floor. */
  rooms: z.array(RoomVolumeSchema),
  /** Corridor volumes on this floor. */
  corridors: z.array(CorridorVolumeSchema),
  /** Door volumes on this floor. */
  doors: z.array(DoorVolumeSchema),
  /** Floor slab. */
  slab: FloorSlabSchema,
});

export type FloorInfo = z.infer<typeof FloorInfoSchema>;

// ---- Building Massing ---------------------------------------------------

/**
 * The complete 3D building massing model.
 *
 * Contains all floor volumes, slabs, and aggregate statistics.
 * This is the primary output of the massing engine.
 */
export const BuildingMassingSchema = z.object({
  /** All floors in the building. */
  floors: z.array(FloorInfoSchema),
  /** Total building height in metres. */
  totalHeightM: z.number().positive(),
  /** Total Gross Floor Area in m². */
  totalGfaM2: z.number().positive(),
  /** Total building volume in m³. */
  totalVolumeM3: z.number().positive(),
  /** Number of floors. */
  floorCount: z.number().int().min(1),
  /** Total number of rooms across all floors. */
  totalRoomCount: z.number().int().min(0),
  /** Building bounding box. */
  boundingBox: BBox3DSchema,
});

export type BuildingMassing = z.infer<typeof BuildingMassingSchema>;

// ---- Massing Result (full output) ---------------------------------------

/**
 * Complete output of the massing extrusion engine.
 *
 * Contains the 3D building model, references to source data,
 * and metadata for downstream consumption.
 */
export const MassingResultSchema = z.object({
  /** Reference to the ProgramSpec ID. */
  programSpecId: z.string(),
  /** Reference to the selected zoning candidate ID. */
  zoningCandidateId: z.string(),
  /** Timestamp when the massing was generated. */
  generatedAt: z.string().datetime(),
  /** The 3D building massing model. */
  building: BuildingMassingSchema,
  /** Floor-to-floor height used (from BuildingConstraints). */
  floorHeightM: z.number().positive(),
  /** Slab thickness used. */
  slabThicknessM: z.number().positive(),
  /** Total computation time in milliseconds. */
  computeTimeMs: z.number().min(0),
});

export type MassingResult = z.infer<typeof MassingResultSchema>;

// ---- Category Colours (shared across all steps) -------------------------

/**
 * Standard category colour palette used throughout SentiArch.
 *
 * Matches the colours used in Steps 1–3 for visual consistency.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  academic: "#4A90D9",
  art: "#9B59B6",
  science: "#27AE60",
  public: "#E67E22",
  sport: "#E74C3C",
  support: "#95A5A6",
  residential: "#F39C12",
  admin: "#8E44AD",
};

/**
 * Get the colour for a category, with a fallback for unknown categories.
 */
export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#95A5A6";
}
