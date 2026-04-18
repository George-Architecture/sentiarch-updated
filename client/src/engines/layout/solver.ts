// ============================================================
// SentiArch — Layout Generation CSP Solver
// Phase 1, Step 3: Layout Generation
//
// Graph-based space allocation + Constraint Satisfaction Problem
// solver.  Given a site boundary, a set of spaces (from the
// zoning result for one floor), and adjacency rules, produces
// a floor layout with rectangular room placements, corridors,
// and doors.
//
// The solver uses a treemap-inspired recursive partitioning
// approach with constraint satisfaction:
//
// 1. Build adjacency graph from rules
// 2. Sort spaces by adjacency priority and area
// 3. Recursively partition the floor plate into rectangular
//    rooms using a binary-split approach
// 4. Generate a central corridor
// 5. Place doors at adjacency boundaries
// 6. Score the result
// ============================================================

import type { ProgramSpec, SpaceType, AdjacencyRule } from "@/types/program";
import type { FloorAssignment } from "@/types/zoning";
import type {
  Point2D,
  Polygon2D,
  RoomPlacement,
  Corridor,
  Door,
  FloorLayoutCandidate,
  LayoutQuality,
} from "@/types/layout";
import {
  createRect,
  polygonArea,
  boundingBox,
  touchesBoundary,
  rectsAdjacent,
  sharedEdgeMidpoint,
} from "./geometry";

// ---- Types --------------------------------------------------------------

interface RoomSpec {
  spaceId: string;
  name: string;
  category: string;
  targetArea: number;
  colorHex: string;
  requiresLight: boolean;
  adjacencyWeight: number; // sum of adjacency weights
}

interface PlacedRoom {
  spec: RoomSpec;
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---- Adjacency Graph ----------------------------------------------------

/**
 * Build an adjacency weight map for a set of spaces on one floor.
 *
 * Returns a map: spaceId → total adjacency weight (sum of all
 * rules involving this space on this floor).
 */
function buildAdjacencyWeights(
  spaceIds: Set<string>,
  adjacencies: AdjacencyRule[]
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const id of Array.from(spaceIds)) weights.set(id, 0);

  for (const rule of adjacencies) {
    if (spaceIds.has(rule.fromSpaceId) && spaceIds.has(rule.toSpaceId)) {
      if (rule.type !== "must_separate") {
        weights.set(
          rule.fromSpaceId,
          (weights.get(rule.fromSpaceId) ?? 0) + rule.weight
        );
        weights.set(
          rule.toSpaceId,
          (weights.get(rule.toSpaceId) ?? 0) + rule.weight
        );
      }
    }
  }
  return weights;
}

/**
 * Get adjacency pairs for spaces on the same floor.
 */
function getFloorAdjacencyPairs(
  spaceIds: Set<string>,
  adjacencies: AdjacencyRule[]
): AdjacencyRule[] {
  return adjacencies.filter(
    (r) => spaceIds.has(r.fromSpaceId) && spaceIds.has(r.toSpaceId)
  );
}

// ---- Room Sorting Strategies --------------------------------------------

type SortStrategy = "area-desc" | "adjacency-first" | "shuffle" | "cluster" | "interleave";

function sortRooms(
  rooms: RoomSpec[],
  strategy: SortStrategy,
  rng: () => number
): RoomSpec[] {
  const sorted = [...rooms];
  switch (strategy) {
    case "area-desc":
      sorted.sort((a, b) => b.targetArea - a.targetArea);
      break;
    case "adjacency-first":
      sorted.sort((a, b) => b.adjacencyWeight - a.adjacencyWeight);
      break;
    case "shuffle":
      // Fisher-Yates shuffle
      for (let i = sorted.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      }
      break;
    case "cluster":
      // Group by category, then sort by area within group
      sorted.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return b.targetArea - a.targetArea;
      });
      break;
    case "interleave":
      // Alternate large and small rooms
      sorted.sort((a, b) => b.targetArea - a.targetArea);
      const result: RoomSpec[] = [];
      let lo = 0;
      let hi = sorted.length - 1;
      let toggle = true;
      while (lo <= hi) {
        result.push(toggle ? sorted[lo++] : sorted[hi--]);
        toggle = !toggle;
      }
      return result;
  }
  return sorted;
}

// ---- Treemap Partitioning -----------------------------------------------

/**
 * Recursively partition a rectangular region into rooms using
 * a squarified treemap approach.
 *
 * This produces a space-filling layout where each room gets
 * area proportional to its target.
 */
function treemapPartition(
  rooms: RoomSpec[],
  x: number,
  y: number,
  w: number,
  h: number,
  corridorWidth: number
): PlacedRoom[] {
  if (rooms.length === 0) return [];
  if (rooms.length === 1) {
    return [{ spec: rooms[0], x, y, w, h }];
  }

  // Decide split direction: split along the longer axis
  const splitHorizontal = w >= h;

  // Find the best split point (by area ratio)
  const totalArea = rooms.reduce((sum, r) => sum + r.targetArea, 0);

  let bestSplit = 1;
  let bestRatio = Infinity;

  for (let i = 1; i < rooms.length; i++) {
    const leftArea = rooms.slice(0, i).reduce((s, r) => s + r.targetArea, 0);
    const ratio = leftArea / totalArea;
    const deviation = Math.abs(ratio - 0.5);
    if (deviation < bestRatio) {
      bestRatio = deviation;
      bestSplit = i;
    }
  }

  const leftRooms = rooms.slice(0, bestSplit);
  const rightRooms = rooms.slice(bestSplit);
  const leftArea = leftRooms.reduce((s, r) => s + r.targetArea, 0);
  const splitRatio = leftArea / totalArea;

  const placed: PlacedRoom[] = [];

  if (splitHorizontal) {
    const leftW = (w - corridorWidth) * splitRatio;
    const rightW = w - corridorWidth - leftW;
    const corridorX = x + leftW;

    placed.push(
      ...treemapPartition(leftRooms, x, y, leftW, h, corridorWidth)
    );
    placed.push(
      ...treemapPartition(
        rightRooms,
        corridorX + corridorWidth,
        y,
        rightW,
        h,
        corridorWidth
      )
    );
  } else {
    const topH = (h - corridorWidth) * splitRatio;
    const bottomH = h - corridorWidth - topH;
    const corridorY = y + topH;

    placed.push(
      ...treemapPartition(leftRooms, x, y, w, topH, corridorWidth)
    );
    placed.push(
      ...treemapPartition(
        rightRooms,
        x,
        corridorY + corridorWidth,
        w,
        bottomH,
        corridorWidth
      )
    );
  }

  return placed;
}

// ---- Corridor Generation ------------------------------------------------

/**
 * Generate corridors from the gaps left by treemap partitioning.
 *
 * The treemap leaves corridor-width gaps between room groups.
 * We detect these gaps and create corridor segments.
 */
function generateCorridors(
  placedRooms: PlacedRoom[],
  boundaryX: number,
  boundaryY: number,
  boundaryW: number,
  boundaryH: number,
  corridorWidth: number
): Corridor[] {
  const corridors: Corridor[] = [];
  const usedAreas = new Set<string>();

  // Scan for horizontal corridor gaps
  for (let scanY = boundaryY; scanY < boundaryY + boundaryH - corridorWidth; scanY += 0.5) {
    let gapStart = -1;
    let gapEnd = -1;
    let isGap = true;

    for (const room of placedRooms) {
      // Check if there's a horizontal strip at scanY that's not covered
      if (room.y <= scanY && room.y + room.h >= scanY + corridorWidth) {
        // This room covers this y-range, not a gap here
      }
    }

    // Simplified: find the main horizontal corridor
    const midY = boundaryY + boundaryH / 2 - corridorWidth / 2;
    let isCorridor = true;
    for (const room of placedRooms) {
      if (
        room.y < midY + corridorWidth &&
        room.y + room.h > midY &&
        room.x < boundaryX + boundaryW &&
        room.x + room.w > boundaryX
      ) {
        isCorridor = false;
        break;
      }
    }

    if (isCorridor && !usedAreas.has("h-main")) {
      usedAreas.add("h-main");
      corridors.push({
        id: "corridor-h-main",
        polygon: createRect(boundaryX, midY, boundaryW, corridorWidth),
        areaM2: boundaryW * corridorWidth,
        widthM: corridorWidth,
      });
    }
    break; // Only check once
  }

  // If no corridor found from gaps, create a central corridor
  if (corridors.length === 0) {
    // Create a central horizontal corridor
    const midY = boundaryY + boundaryH / 2 - corridorWidth / 2;
    corridors.push({
      id: "corridor-central",
      polygon: createRect(boundaryX, midY, boundaryW, corridorWidth),
      areaM2: boundaryW * corridorWidth,
      widthM: corridorWidth,
    });
  }

  return corridors;
}

// ---- Door Placement -----------------------------------------------------

/**
 * Place doors between adjacent rooms and between rooms and corridors.
 */
function placeDoors(
  placedRooms: PlacedRoom[],
  corridors: Corridor[],
  floorAdjacencies: AdjacencyRule[]
): Door[] {
  const doors: Door[] = [];
  const doorSet = new Set<string>();

  const toRect = (r: PlacedRoom) => ({
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
  });

  // Doors between adjacent rooms
  for (let i = 0; i < placedRooms.length; i++) {
    for (let j = i + 1; j < placedRooms.length; j++) {
      const a = placedRooms[i];
      const b = placedRooms[j];
      if (rectsAdjacent(toRect(a), toRect(b))) {
        const key = `${a.spec.spaceId}-${b.spec.spaceId}`;
        if (!doorSet.has(key)) {
          doorSet.add(key);
          const mid = sharedEdgeMidpoint(toRect(a), toRect(b));
          if (mid) {
            doors.push({
              position: mid,
              widthM: 0.9,
              connects: [a.spec.spaceId, b.spec.spaceId],
            });
          }
        }
      }
    }
  }

  // Doors between rooms and corridors
  for (const room of placedRooms) {
    for (const corridor of corridors) {
      const bb = boundingBox(corridor.polygon.vertices);
      const corridorRect = {
        x: bb.minX,
        y: bb.minY,
        w: bb.width,
        h: bb.height,
      };
      if (rectsAdjacent(toRect(room), corridorRect)) {
        const key = `${room.spec.spaceId}-${corridor.id}`;
        if (!doorSet.has(key)) {
          doorSet.add(key);
          const mid = sharedEdgeMidpoint(toRect(room), corridorRect);
          if (mid) {
            doors.push({
              position: mid,
              widthM: 0.9,
              connects: [room.spec.spaceId, corridor.id],
            });
          }
        }
      }
    }
  }

  return doors;
}

// ---- Quality Scoring ----------------------------------------------------

/**
 * Score a layout candidate.
 */
function scoreLayout(
  placedRooms: PlacedRoom[],
  corridors: Corridor[],
  floorAdjacencies: AdjacencyRule[],
  boundaryArea: number,
  boundaryVertices: Point2D[]
): LayoutQuality {
  // 1. Adjacency satisfaction
  let adjSatisfied = 0;
  let adjTotal = 0;

  const toRect = (r: PlacedRoom) => ({
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
  });

  const roomMap = new Map<string, PlacedRoom>();
  for (const r of placedRooms) roomMap.set(r.spec.spaceId, r);

  for (const rule of floorAdjacencies) {
    const a = roomMap.get(rule.fromSpaceId);
    const b = roomMap.get(rule.toSpaceId);
    if (!a || !b) continue;

    adjTotal += rule.weight;
    const adjacent = rectsAdjacent(toRect(a), toRect(b));

    if (rule.type === "must_adjacent" || rule.type === "should_adjacent") {
      if (adjacent) adjSatisfied += rule.weight;
    } else if (rule.type === "must_separate") {
      if (!adjacent) adjSatisfied += rule.weight;
    } else if (rule.type === "prefer_nearby") {
      // Distance-based scoring
      const dist = Math.sqrt(
        (a.x + a.w / 2 - (b.x + b.w / 2)) ** 2 +
          (a.y + a.h / 2 - (b.y + b.h / 2)) ** 2
      );
      const maxDist = Math.sqrt(
        boundaryVertices.reduce(
          (max, v) =>
            Math.max(
              max,
              ...boundaryVertices.map(
                (v2) => (v.x - v2.x) ** 2 + (v.y - v2.y) ** 2
              )
            ),
          0
        )
      );
      const score = maxDist > 0 ? 1 - dist / maxDist : 1;
      adjSatisfied += rule.weight * Math.max(0, score);
    }
  }

  const adjacencySatisfaction = adjTotal > 0 ? adjSatisfied / adjTotal : 1;

  // 2. Area efficiency
  const usedArea = placedRooms.reduce((s, r) => s + r.w * r.h, 0);
  const corridorArea = corridors.reduce((s, c) => s + c.areaM2, 0);
  const totalUsed = usedArea + corridorArea;
  const areaEfficiency = Math.min(1, totalUsed / boundaryArea);

  // 3. Corridor ratio (lower is better, so we invert)
  const corridorRatio =
    totalUsed > 0 ? corridorArea / totalUsed : 0;

  // 4. Natural light access
  let lightNeeded = 0;
  let lightSatisfied = 0;
  for (const room of placedRooms) {
    if (room.spec.requiresLight) {
      lightNeeded++;
      if (touchesBoundary(
        createRect(room.x, room.y, room.w, room.h).vertices,
        boundaryVertices,
        1.0
      )) {
        lightSatisfied++;
      }
    }
  }
  const naturalLightAccess = lightNeeded > 0 ? lightSatisfied / lightNeeded : 1;

  // Weighted total
  const totalScore =
    adjacencySatisfaction * 0.35 +
    areaEfficiency * 0.25 +
    (1 - corridorRatio) * 0.15 +
    naturalLightAccess * 0.25;

  return {
    adjacencySatisfaction,
    areaEfficiency,
    corridorRatio,
    naturalLightAccess,
    totalScore,
  };
}

// ---- PRNG ---------------------------------------------------------------

/**
 * Simple seeded PRNG (mulberry32).
 */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Main Solver --------------------------------------------------------

const STRATEGIES: SortStrategy[] = [
  "area-desc",
  "adjacency-first",
  "shuffle",
  "cluster",
  "interleave",
];

/**
 * Generate layout candidates for a single floor.
 *
 * @param boundary - Site boundary polygon
 * @param floorAssignment - Which spaces are on this floor
 * @param spec - Full ProgramSpec
 * @param candidateCount - Number of candidates to generate (default 5)
 * @returns Array of FloorLayoutCandidate
 */
export function generateFloorLayouts(
  boundary: Polygon2D,
  floorAssignment: FloorAssignment,
  spec: ProgramSpec,
  candidateCount: number = 5
): FloorLayoutCandidate[] {
  const spaceMap = new Map<string, SpaceType>();
  for (const s of spec.spaces) spaceMap.set(s.id, s);

  const spaceIds = new Set(floorAssignment.spaceIds);
  const floorAdjacencies = getFloorAdjacencyPairs(spaceIds, spec.adjacencies);
  const adjWeights = buildAdjacencyWeights(spaceIds, spec.adjacencies);

  // Build room specs
  const roomSpecs: RoomSpec[] = [];
  for (const id of floorAssignment.spaceIds) {
    const s = spaceMap.get(id);
    if (!s) continue;
    roomSpecs.push({
      spaceId: s.id,
      name: s.name,
      category: s.category,
      targetArea: s.quantity * s.areaPerUnit,
      colorHex: s.colorHex ?? "#95A5A6",
      requiresLight: s.requiredFeatures.includes("natural_light"),
      adjacencyWeight: adjWeights.get(s.id) ?? 0,
    });
  }

  const bb = boundingBox(boundary.vertices);
  const corridorWidth = spec.constraints.minCorridorWidthM;
  const boundaryArea = polygonArea(boundary);

  const candidates: FloorLayoutCandidate[] = [];

  for (let ci = 0; ci < candidateCount; ci++) {
    const strategy = STRATEGIES[ci % STRATEGIES.length];
    const seed = ci * 12345 + floorAssignment.floorIndex * 67890 + 42;
    const rng = mulberry32(seed);

    const sorted = sortRooms(roomSpecs, strategy, rng);

    // Partition into rooms
    const placedRooms = treemapPartition(
      sorted,
      bb.minX,
      bb.minY,
      bb.width,
      bb.height,
      corridorWidth * 0.3 // Thin internal gaps
    );

    // Generate corridors
    const corridors = generateCorridors(
      placedRooms,
      bb.minX,
      bb.minY,
      bb.width,
      bb.height,
      corridorWidth
    );

    // Place doors
    const doors = placeDoors(placedRooms, corridors, floorAdjacencies);

    // Convert to RoomPlacement
    const rooms: RoomPlacement[] = placedRooms.map((pr) => ({
      spaceId: pr.spec.spaceId,
      name: pr.spec.name,
      category: pr.spec.category,
      polygon: createRect(pr.x, pr.y, pr.w, pr.h),
      areaM2: pr.w * pr.h,
      targetAreaM2: pr.spec.targetArea,
      touchesExterior: touchesBoundary(
        createRect(pr.x, pr.y, pr.w, pr.h).vertices,
        boundary.vertices,
        1.0
      ),
      colorHex: pr.spec.colorHex,
    }));

    // Score
    const quality = scoreLayout(
      placedRooms,
      corridors,
      floorAdjacencies,
      boundaryArea,
      boundary.vertices
    );

    candidates.push({
      id: `floor-${floorAssignment.floorIndex}-candidate-${ci}`,
      floorIndex: floorAssignment.floorIndex,
      rank: ci,
      rooms,
      corridors,
      doors,
      quality,
      boundary,
      generationStrategy: strategy,
    });
  }

  // Sort by quality and update ranks
  candidates.sort((a, b) => b.quality.totalScore - a.quality.totalScore);
  candidates.forEach((c, i) => {
    c.rank = i;
  });

  return candidates;
}

/**
 * Generate layouts for all floors.
 *
 * @param boundary - Site boundary polygon
 * @param floors - Floor assignments from the selected zoning
 * @param spec - Full ProgramSpec
 * @param candidatesPerFloor - Number of candidates per floor
 * @returns Record of floor index → candidates
 */
export function generateAllFloorLayouts(
  boundary: Polygon2D,
  floors: FloorAssignment[],
  spec: ProgramSpec,
  candidatesPerFloor: number = 5
): Record<string, FloorLayoutCandidate[]> {
  const result: Record<string, FloorLayoutCandidate[]> = {};

  for (const floor of floors) {
    if (floor.spaceIds.length === 0) {
      result[String(floor.floorIndex)] = [];
      continue;
    }
    result[String(floor.floorIndex)] = generateFloorLayouts(
      boundary,
      floor,
      spec,
      candidatesPerFloor
    );
  }

  return result;
}
