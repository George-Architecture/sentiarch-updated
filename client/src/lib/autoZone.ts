// ============================================================
// Auto-Zone Detection — Grid-based flood fill (v3)
// Detects enclosed spaces formed by boundary + wall shapes.
//
// Key design decisions:
// 1. Exclude regions that touch the grid boundary (= open/exterior space)
// 2. Each flood-fill region = one independent zone (NO dedup by boundary)
//    → walls correctly split a boundary into multiple zones
// 3. Zone bounds use the flood-fill region's ACTUAL cell bounding box
//    converted back to world coordinates (not the enclosing boundary bbox)
// 4. enclosingBoundary is used only to verify the region is inside a
//    boundary (not exterior), NOT for deduplication or bounds
// ============================================================

import type { Shape, Zone } from "./store";
import { defaultZoneEnv } from "./store";

// ---- Configuration ----
const CELL_SIZE = 500;      // mm per grid cell (resolution)
const WALL_THICKNESS = 3;   // cells to rasterize wall/boundary edge thickness
const MIN_REGION_CELLS = 9; // minimum cells for a region to become a zone

// ---- Grid cell states ----
const EMPTY = 0;
const WALL_CELL = -1;

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

// ---- Rasterization ----

function rasterizeLine(
  grid: Int32Array,
  cols: number,
  rows: number,
  x1g: number,
  y1g: number,
  x2g: number,
  y2g: number,
  thickness: number
): void {
  const dx = x2g - x1g;
  const dy = y2g - y1g;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const half = Math.floor(thickness / 2);
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const cx = Math.round(x1g + dx * t);
    const cy = Math.round(y1g + dy * t);
    for (let ox = -half; ox <= half; ox++) {
      for (let oy = -half; oy <= half; oy++) {
        const gx = cx + ox;
        const gy = cy + oy;
        if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
          grid[gy * cols + gx] = WALL_CELL;
        }
      }
    }
  }
}

function rasterizePolygonEdges(
  grid: Int32Array,
  cols: number,
  rows: number,
  points: [number, number][],
  originX: number,
  originY: number,
  thickness: number
): void {
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const x1g = Math.round((points[i][0] - originX) / CELL_SIZE);
    const y1g = Math.round((points[i][1] - originY) / CELL_SIZE);
    const x2g = Math.round((points[j][0] - originX) / CELL_SIZE);
    const y2g = Math.round((points[j][1] - originY) / CELL_SIZE);
    rasterizeLine(grid, cols, rows, x1g, y1g, x2g, y2g, thickness);
  }
}

// ---- Flood fill ----

interface FloodFillResult {
  count: number;
  touchesBorder: boolean;
  /** Grid-coordinate bounding box of all cells in this region */
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

    // Track bounding box
    if (cx < gMinX) gMinX = cx;
    if (cx > gMaxX) gMaxX = cx;
    if (cy < gMinY) gMinY = cy;
    if (cy > gMaxY) gMaxY = cy;

    // Check if this cell is on the grid border → exterior space
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
  /** The smallest boundary polygon that directly encloses this region */
  enclosingBoundary: Shape;
  /**
   * Bounding box in world coords derived from the flood-fill region's
   * ACTUAL cell bounding box (NOT the enclosing boundary's bbox).
   * This correctly reflects sub-divisions created by walls.
   */
  bounds: { x: number; y: number; width: number; height: number };
}

// ---- Main detection ----

/**
 * Detect enclosed regions formed by boundary + wall shapes.
 * Returns one DetectedRegion per enclosed space.
 * Walls that subdivide a boundary produce multiple regions.
 */
export function detectEnclosedRegions(shapes: Shape[]): DetectedRegion[] {
  const boundaries = shapes.filter((s) => s.type === "boundary" && s.points.length >= 3);
  const walls = shapes.filter((s) => s.type === "wall" && s.points.length >= 2);

  if (boundaries.length === 0) return [];

  // ---- Build grid ----
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of [...boundaries, ...walls]) {
    for (const [px, py] of s.points) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }

  // Padding: enough to ensure exterior space is fully connected across the grid
  const pad = CELL_SIZE * 6;
  const originX = minX - pad;
  const originY = minY - pad;
  const cols = Math.ceil((maxX + pad - originX) / CELL_SIZE) + 2;
  const rows = Math.ceil((maxY + pad - originY) / CELL_SIZE) + 2;

  if (cols * rows > 4_000_000) {
    console.warn("Auto-zone: grid too large, skipping");
    return [];
  }

  const grid = new Int32Array(cols * rows); // 0 = EMPTY

  // Rasterize boundary edges
  for (const b of boundaries) {
    rasterizePolygonEdges(grid, cols, rows, b.points, originX, originY, WALL_THICKNESS);
  }
  // Rasterize walls
  for (const w of walls) {
    for (let i = 0; i < w.points.length - 1; i++) {
      const x1g = Math.round((w.points[i][0] - originX) / CELL_SIZE);
      const y1g = Math.round((w.points[i][1] - originY) / CELL_SIZE);
      const x2g = Math.round((w.points[i + 1][0] - originX) / CELL_SIZE);
      const y2g = Math.round((w.points[i + 1][1] - originY) / CELL_SIZE);
      rasterizeLine(grid, cols, rows, x1g, y1g, x2g, y2g, WALL_THICKNESS);
    }
  }

  // ---- Flood fill all empty regions ----
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

  // ---- Filter and classify regions ----

  // Sort boundaries by area ascending (smallest first) for "smallest enclosing" lookup
  const boundariesByArea = [...boundaries].sort(
    (a, b) => polygonArea(a.points) - polygonArea(b.points)
  );

  const results: DetectedRegion[] = [];

  for (const [regionId, meta] of regionMeta) {
    // Skip: too small
    if (meta.count < MIN_REGION_CELLS) continue;
    // Skip: touches grid border = exterior/open space
    if (meta.touchesBorder) continue;

    const centroid = regionCentroid(grid, cols, regionId, originX, originY);

    // Find the SMALLEST boundary polygon that contains the centroid.
    // This is used only to confirm the region is inside a boundary (not exterior).
    // It is NOT used for deduplication or bounds computation.
    let enclosing: Shape | null = null;
    for (const b of boundariesByArea) {
      if (pointInPolygon(centroid[0], centroid[1], b.points)) {
        enclosing = b;
        break;
      }
    }
    if (!enclosing) continue;

    // ---- Zone bounds = flood-fill region's ACTUAL cell bounding box ----
    // Convert grid cell coordinates back to world coordinates.
    // Each cell spans [gx * CELL_SIZE + originX, (gx+1) * CELL_SIZE + originX).
    const wx1 = originX + meta.gMinX * CELL_SIZE;
    const wy1 = originY + meta.gMinY * CELL_SIZE;
    const wx2 = originX + (meta.gMaxX + 1) * CELL_SIZE;
    const wy2 = originY + (meta.gMaxY + 1) * CELL_SIZE;

    results.push({
      id: regionId,
      cellCount: meta.count,
      centroid,
      enclosingBoundary: enclosing,
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
 * Generate auto-zones from detected regions, preserving user-modified zones.
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
