// ============================================================
// Auto-Zone Detection — Walkable-space approach (v4)
//
// New spatial model:
//   - Boundary polygon INTERIOR = solid / inaccessible
//   - Walkable space = inside the OUTERMOST boundary but NOT
//     inside any boundary polygon
//   - Auto-zones are generated only in walkable space
//
// Algorithm:
//   1. Find the outermost boundary (largest area)
//   2. Build a grid covering the outermost boundary bbox
//   3. Mark cells INSIDE any boundary polygon as SOLID
//   4. Mark cells OUTSIDE the outermost boundary as EXTERIOR
//   5. Flood-fill remaining EMPTY cells → each connected region
//      is a walkable zone
//   6. Convert regions to Zone objects, preserving user edits
// ============================================================

import type { Shape, Zone } from "./store";
import { defaultZoneEnv } from "./store";

// ---- Configuration ----
const CELL_SIZE = 500;        // mm per grid cell
const MIN_REGION_CELLS = 4;   // minimum cells for a valid zone

// ---- Grid cell states ----
const EMPTY = 0;
const SOLID = -1;     // inside a boundary polygon (inaccessible)
const EXTERIOR = -2;  // outside the outermost boundary

// ---- Geometry helpers ----

/** Ray-casting point-in-polygon test (world coordinates). */
function pointInPolygon(px: number, py: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Signed area of a polygon (shoelace formula). */
function polygonArea(pts: [number, number][]): number {
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(area) / 2;
}

// ---- Flood fill ----

interface FloodFillResult {
  count: number;
  touchesBorder: boolean;
  gMinX: number;
  gMinY: number;
  gMaxX: number;
  gMaxY: number;
}

function floodFill(
  grid: Int32Array,
  cols: number,
  rows: number,
  sx: number,
  sy: number,
  regionId: number
): FloodFillResult {
  const startIdx = sy * cols + sx;
  if (grid[startIdx] !== EMPTY) {
    return { count: 0, touchesBorder: false, gMinX: sx, gMinY: sy, gMaxX: sx, gMaxY: sy };
  }

  grid[startIdx] = regionId;
  const stack: number[] = [startIdx];
  let count = 0;
  let touchesBorder = false;
  let gMinX = sx, gMinY = sy, gMaxX = sx, gMaxY = sy;

  while (stack.length > 0) {
    const ci = stack.pop()!;
    count++;
    const cx = ci % cols;
    const cy = (ci - cx) / cols;

    if (cx < gMinX) gMinX = cx;
    if (cx > gMaxX) gMaxX = cx;
    if (cy < gMinY) gMinY = cy;
    if (cy > gMaxY) gMaxY = cy;

    if (cx === 0 || cx === cols - 1 || cy === 0 || cy === rows - 1) {
      touchesBorder = true;
    }

    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as [number, number][]) {
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
        const ni = ny * cols + nx;
        if (grid[ni] === EMPTY) {
          grid[ni] = regionId;
          stack.push(ni);
        }
      }
    }
  }

  return { count, touchesBorder, gMinX, gMinY, gMaxX, gMaxY };
}

// ---- Centroid calculation ----

function regionCentroid(
  grid: Int32Array,
  cols: number,
  regionId: number,
  originX: number,
  originY: number
): [number, number] {
  let sumX = 0, sumY = 0, count = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === regionId) {
      const gx = i % cols;
      const gy = (i - gx) / cols;
      sumX += gx;
      sumY += gy;
      count++;
    }
  }
  if (count === 0) return [originX, originY];
  return [
    originX + (sumX / count + 0.5) * CELL_SIZE,
    originY + (sumY / count + 0.5) * CELL_SIZE,
  ];
}

// ---- Public types ----

export interface DetectedRegion {
  id: number;
  cellCount: number;
  centroid: [number, number];
  bounds: { x: number; y: number; width: number; height: number };
}

// ---- Main detection ----

/**
 * Detect walkable regions:
 *   - Inside the outermost boundary (largest area)
 *   - NOT inside any boundary polygon interior
 *
 * Each connected walkable region becomes a zone.
 */
export function detectEnclosedRegions(shapes: Shape[]): DetectedRegion[] {
  const boundaries = shapes.filter((s) => s.type === "boundary" && s.points.length >= 3);
  if (boundaries.length === 0) return [];

  // Find the outermost boundary (largest area)
  const sorted = [...boundaries].sort((a, b) => polygonArea(b.points) - polygonArea(a.points));
  const outermost = sorted[0];
  const innerBoundaries = sorted.slice(1);

  // ---- Build grid covering the outermost boundary bbox ----
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of outermost.points) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }

  const pad = CELL_SIZE * 2;
  const originX = minX - pad;
  const originY = minY - pad;
  const cols = Math.ceil((maxX + pad - originX) / CELL_SIZE) + 2;
  const rows = Math.ceil((maxY + pad - originY) / CELL_SIZE) + 2;

  if (cols * rows > 4_000_000) {
    console.warn("Auto-zone: grid too large, skipping");
    return [];
  }

  const grid = new Int32Array(cols * rows); // 0 = EMPTY

  // ---- Classify each cell ----
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      // Cell center in world coordinates
      const wx = originX + (gx + 0.5) * CELL_SIZE;
      const wy = originY + (gy + 0.5) * CELL_SIZE;

      // Check if outside outermost boundary → EXTERIOR
      if (!pointInPolygon(wx, wy, outermost.points)) {
        grid[gy * cols + gx] = EXTERIOR;
        continue;
      }

      // Check if inside any inner boundary polygon → SOLID (inaccessible)
      let isSolid = false;
      for (const b of innerBoundaries) {
        if (pointInPolygon(wx, wy, b.points)) {
          isSolid = true;
          break;
        }
      }
      if (isSolid) {
        grid[gy * cols + gx] = SOLID;
      }
      // else: remains EMPTY = walkable
    }
  }

  // ---- Flood fill all walkable (EMPTY) cells ----
  let nextId = 1;
  const regionMeta: Map<number, FloodFillResult> = new Map();

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y * cols + x] === EMPTY) {
        const meta = floodFill(grid, cols, rows, x, y, nextId);
        regionMeta.set(nextId, meta);
        nextId++;
      }
    }
  }

  // ---- Build results ----
  const results: DetectedRegion[] = [];

  for (const [regionId, meta] of regionMeta) {
    if (meta.count < MIN_REGION_CELLS) continue;
    // Skip regions that touch the grid border (shouldn't happen with EXTERIOR marking, but safety check)
    if (meta.touchesBorder) continue;

    const centroid = regionCentroid(grid, cols, regionId, originX, originY);

    // Zone bounds = flood-fill region's actual cell bounding box in world coords
    const wx1 = originX + meta.gMinX * CELL_SIZE;
    const wy1 = originY + meta.gMinY * CELL_SIZE;
    const wx2 = originX + (meta.gMaxX + 1) * CELL_SIZE;
    const wy2 = originY + (meta.gMaxY + 1) * CELL_SIZE;

    results.push({
      id: regionId,
      cellCount: meta.count,
      centroid,
      bounds: { x: wx1, y: wy1, width: wx2 - wx1, height: wy2 - wy1 },
    });
  }

  // Sort top-left to bottom-right for consistent numbering
  results.sort((a, b) => {
    const dy = a.centroid[1] - b.centroid[1];
    if (Math.abs(dy) > 2000) return dy;
    return a.centroid[0] - b.centroid[0];
  });

  return results;
}

// ---- Zone generation ----

/**
 * Generate auto-zones from detected walkable regions, preserving user-modified zones.
 * Auto-zones are identified by the "auto_zone_" prefix in their ID.
 */
export function generateAutoZones(shapes: Shape[], existingZones: Zone[]): Zone[] {
  const regions = detectEnclosedRegions(shapes);

  const manualZones = existingZones.filter((z) => !z.id.startsWith("auto_zone_"));
  const autoZones   = existingZones.filter((z) =>  z.id.startsWith("auto_zone_"));

  // Build lookup of existing auto-zones by approximate centroid key
  // so user edits (label, env) are preserved across re-detections
  const existingByKey = new Map<string, Zone>();
  for (const az of autoZones) {
    const cx = az.bounds.x + az.bounds.width  / 2;
    const cy = az.bounds.y + az.bounds.height / 2;
    const key = `${Math.round(cx / 1000)}_${Math.round(cy / 1000)}`;
    existingByKey.set(key, az);
  }

  const newAutoZones: Zone[] = [];
  let labelCounter = 1;

  for (const region of regions) {
    const cx = region.centroid[0];
    const cy = region.centroid[1];
    const key = `${Math.round(cx / 1000)}_${Math.round(cy / 1000)}`;

    const existing = existingByKey.get(key);
    if (existing) {
      // Preserve user edits; update bounds to match current geometry
      newAutoZones.push({
        ...existing,
        bounds: {
          x:      region.bounds.x,
          y:      region.bounds.y,
          width:  region.bounds.width,
          height: region.bounds.height,
        },
      });
      existingByKey.delete(key);
    } else {
      newAutoZones.push({
        id:    `auto_zone_${Date.now()}_${labelCounter}`,
        label: `Zone ${labelCounter}`,
        bounds: {
          x:      region.bounds.x,
          y:      region.bounds.y,
          width:  region.bounds.width,
          height: region.bounds.height,
        },
        env: { ...defaultZoneEnv },
      });
    }
    labelCounter++;
  }

  // Re-number default labels sequentially
  let num = 1;
  for (const z of newAutoZones) {
    if (z.label?.match(/^Zone \d+$/)) z.label = `Zone ${num}`;
    num++;
  }

  return [...manualZones, ...newAutoZones];
}
