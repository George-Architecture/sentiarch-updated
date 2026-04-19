// ============================================================
// SentiArch — Massing Extrusion Engine
//
// Converts 2D floor plans (SelectedLayout) into a 3D building
// model (BuildingMassing) by extruding room polygons vertically
// and stacking floors.
// ============================================================

import type { SelectedLayout, FloorLayoutCandidate } from "@/types/layout";
import type {
  BuildingMassing,
  RoomVolume,
  FloorSlab,
  CorridorVolume,
  DoorVolume,
  FloorInfo,
  BBox3D,
  MassingResult,
} from "@/types/massing";
import { getCategoryColor } from "@/types/massing";

// ---- Configuration ------------------------------------------------------

export interface MassingConfig {
  /** Floor-to-floor height in metres. */
  floorHeightM: number;
  /** Floor slab thickness in metres. */
  slabThicknessM: number;
  /** Door height in metres. */
  doorHeightM: number;
}

export const DEFAULT_MASSING_CONFIG: MassingConfig = {
  floorHeightM: 3.6,
  slabThicknessM: 0.3,
  doorHeightM: 2.1,
};

// ---- Floor Label --------------------------------------------------------

/**
 * Generate a display label for a floor index.
 * 0 → "G/F", 1 → "1/F", 2 → "2/F", etc.
 */
function floorLabel(index: number): string {
  return index === 0 ? "G/F" : `${index}/F`;
}

// ---- Polygon → BBox3D --------------------------------------------------

/**
 * Compute the 3D bounding box for a 2D polygon extruded to a
 * given height range.
 *
 * 2D x → 3D x, 2D y → 3D z (north), elevation → 3D y (up).
 */
function polygonToBBox3D(
  vertices: { x: number; y: number }[],
  yMin: number,
  yMax: number,
): BBox3D {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minZ) minZ = v.y;
    if (v.y > maxZ) maxZ = v.y;
  }

  return {
    min: { x: minX, y: yMin, z: minZ },
    max: { x: maxX, y: yMax, z: maxZ },
  };
}

// ---- Extrude a Single Floor ---------------------------------------------

function extrudeFloor(
  floorIndex: number,
  layout: FloorLayoutCandidate,
  config: MassingConfig,
): FloorInfo {
  const elevation = floorIndex * config.floorHeightM;
  const ceilingY = elevation + config.floorHeightM;
  const roomCeilingY = ceilingY - config.slabThicknessM;

  // Extrude rooms
  const rooms: RoomVolume[] = layout.rooms.map((room) => {
    const bbox = polygonToBBox3D(
      room.polygon.vertices,
      elevation,
      roomCeilingY,
    );
    const height = roomCeilingY - elevation;
    return {
      spaceId: room.spaceId,
      name: room.name,
      category: room.category,
      floorIndex,
      bbox,
      areaM2: room.areaM2,
      volumeM3: room.areaM2 * height,
      touchesExterior: room.touchesExterior,
      colorHex: room.colorHex ?? getCategoryColor(room.category),
    };
  });

  // Extrude corridors
  const corridors: CorridorVolume[] = layout.corridors.map((corr) => ({
    id: corr.id,
    floorIndex,
    bbox: polygonToBBox3D(corr.polygon.vertices, elevation, roomCeilingY),
    areaM2: corr.areaM2,
  }));

  // Extrude doors
  const doors: DoorVolume[] = layout.doors.map((door) => ({
    position: {
      x: door.position.x,
      y: elevation,
      z: door.position.y,
    },
    widthM: door.widthM,
    heightM: config.doorHeightM,
    floorIndex,
    connects: door.connects,
  }));

  // Floor slab (at the top of this floor / bottom of next floor)
  const siteBBox = polygonToBBox3D(
    layout.boundary.vertices,
    ceilingY - config.slabThicknessM,
    ceilingY,
  );
  const slab: FloorSlab = {
    floorIndex,
    bbox: siteBBox,
    thicknessM: config.slabThicknessM,
  };

  const totalAreaM2 = rooms.reduce((sum, r) => sum + r.areaM2, 0);

  return {
    floorIndex,
    label: floorLabel(floorIndex),
    elevationM: elevation,
    heightM: config.floorHeightM,
    totalAreaM2,
    roomCount: rooms.length,
    rooms,
    corridors,
    doors,
    slab,
  };
}

// ---- Main Extrusion Function --------------------------------------------

/**
 * Extrude a SelectedLayout into a 3D BuildingMassing.
 *
 * Takes the selected 2D floor plans and building constraints,
 * and produces a complete 3D model with rooms, corridors,
 * doors, and floor slabs stacked vertically.
 */
export function extrudeBuilding(
  layout: SelectedLayout,
  config: MassingConfig = DEFAULT_MASSING_CONFIG,
): BuildingMassing {
  const floorIndices = Object.keys(layout.selectedFloors)
    .map(Number)
    .sort((a, b) => a - b);

  const floors: FloorInfo[] = floorIndices.map((fi) =>
    extrudeFloor(fi, layout.selectedFloors[String(fi)], config),
  );

  const floorCount = floors.length;
  const totalHeightM = floorCount * config.floorHeightM;
  const totalGfaM2 = floors.reduce((sum, f) => sum + f.totalAreaM2, 0);
  const totalRoomCount = floors.reduce((sum, f) => sum + f.roomCount, 0);

  // Compute total volume
  const totalVolumeM3 = floors.reduce(
    (sum, f) =>
      sum +
      f.rooms.reduce((rs, r) => rs + r.volumeM3, 0),
    0,
  );

  // Compute overall bounding box
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const floor of floors) {
    for (const room of floor.rooms) {
      if (room.bbox.min.x < minX) minX = room.bbox.min.x;
      if (room.bbox.max.x > maxX) maxX = room.bbox.max.x;
      if (room.bbox.min.z < minZ) minZ = room.bbox.min.z;
      if (room.bbox.max.z > maxZ) maxZ = room.bbox.max.z;
    }
  }

  const boundingBox: BBox3D = {
    min: { x: minX, y: 0, z: minZ },
    max: { x: maxX, y: totalHeightM, z: maxZ },
  };

  return {
    floors,
    totalHeightM,
    totalGfaM2,
    totalVolumeM3,
    floorCount,
    totalRoomCount,
    boundingBox,
  };
}

// ---- Full Massing Pipeline ----------------------------------------------

/**
 * Run the complete massing extrusion pipeline.
 *
 * Produces a MassingResult with timing metadata.
 */
export function generateMassing(
  layout: SelectedLayout,
  config: MassingConfig = DEFAULT_MASSING_CONFIG,
): MassingResult {
  const start = performance.now();
  const building = extrudeBuilding(layout, config);
  const elapsed = performance.now() - start;

  return {
    programSpecId: layout.programSpecId,
    zoningCandidateId: layout.zoningCandidateId,
    generatedAt: new Date().toISOString(),
    building,
    floorHeightM: config.floorHeightM,
    slabThicknessM: config.slabThicknessM,
    computeTimeMs: Math.round(elapsed * 100) / 100,
  };
}
