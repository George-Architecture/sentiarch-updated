// ============================================================
// Auto-Zone Detection — Walkable-space with contour tracing (v5)
//
// Spatial model:
//   - Boundary polygon INTERIOR = solid / inaccessible
//   - Walkable space = inside the OUTERMOST boundary but NOT
//     inside any boundary polygon
//   - Auto-zones are generated only in walkable space
//   - Zone shapes are polygons traced from flood-fill contours
//
// Every boundary change triggers a FULL re-computation:
//   1. Find outermost boundary (largest area)
//   2. Grid: mark EXTERIOR / SOLID / EMPTY cells
//   3. Flood-fill EMPTY → connected walkable regions
//   4. Contour-trace each region → polygon vertices
//   5. Merge with existing zones (preserve user edits by centroid match)
// ============================================================

import type { Shape, Zone } from "./store";
import { defaultZoneEnv } from "./store";

// ---- Configuration ----
const CELL_SIZE = 500;        // mm per grid cell
const MIN_REGION_CELLS = 4;   // minimum cells for a valid zone
const SIMPLIFY_TOLERANCE = 0.8; // Douglas-Peucker tolerance in grid cells

// ---- Grid cell states ----
const EMPTY = 0;
const SOLID = -1;     // inside a boundary polygon (inaccessible)
const EXTERIOR = -2;  // outside the outermost boundary

// ---- Geometry helpers ----

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

function polygonArea(pts: [number, number][]): number {
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(area) / 2;
}

// ---- Douglas-Peucker line simplification ----

function perpendicularDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.sqrt((p[0] - projX) ** 2 + (p[1] - projY) ** 2);
}

function simplifyDP(pts: [number, number][], tolerance: number): [number, number][] {
  if (pts.length <= 3) return pts;

  let maxDist = 0;
  let maxIdx = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];

  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDist(pts[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyDP(pts.slice(0, maxIdx + 1), tolerance);
    const right = simplifyDP(pts.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

// ---- Contour tracing (Moore neighborhood) ----

/**
 * Trace the outer contour of a region in the grid using Moore neighborhood tracing.
 * Returns polygon vertices in grid coordinates.
 */
function traceContour(
  grid: Int32Array,
  cols: number,
  rows: number,
  regionId: number,
  startX: number,
  startY: number
): [number, number][] {
  // Moore neighborhood: 8 directions (clockwise from left)
  // 0=left, 1=up-left, 2=up, 3=up-right, 4=right, 5=down-right, 6=down, 7=down-left
  const dx = [-1, -1, 0, 1, 1, 1, 0, -1];
  const dy = [0, -1, -1, -1, 0, 1, 1, 1];

  const isRegion = (x: number, y: number): boolean => {
    if (x < 0 || x >= cols || y < 0 || y >= rows) return false;
    return grid[y * cols + x] === regionId;
  };

  // Find the topmost-leftmost cell of the region as start
  let sx = startX, sy = startY;
  outer:
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y * cols + x] === regionId) {
        sx = x;
        sy = y;
        break outer;
      }
    }
  }

  const contourPoints: [number, number][] = [];
  let cx = sx, cy = sy;
  let dir = 0; // start looking left (entering from the left)

  // Jacob's stopping criterion: stop when we return to start cell
  // entering from the same direction
  const maxSteps = grid.length * 2; // safety limit
  let steps = 0;
  let firstDir = -1;

  do {
    contourPoints.push([cx, cy]);

    // Look for next boundary cell by scanning Moore neighborhood
    // Start from (dir + 5) % 8 — i.e., backtrack direction + 1
    const startDir = (dir + 5) % 8;
    let found = false;

    for (let i = 0; i < 8; i++) {
      const d = (startDir + i) % 8;
      const nx = cx + dx[d];
      const ny = cy + dy[d];
      if (isRegion(nx, ny)) {
        dir = d;
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }

    if (!found) break; // isolated cell

    if (contourPoints.length === 1) {
      firstDir = dir;
    }

    steps++;
    if (steps > maxSteps) break;
  } while (!(cx === sx && cy === sy && dir === firstDir) && steps < maxSteps);

  // Remove duplicate last point if it equals start
  if (contourPoints.length > 1) {
    const last = contourPoints[contourPoints.length - 1];
    if (last[0] === contourPoints[0][0] && last[1] === contourPoints[0][1]) {
      contourPoints.pop();
    }
  }

  return contourPoints;
}

/**
 * Convert grid-coordinate contour to world-coordinate polygon.
 * Each grid cell center is at (originX + (gx + 0.5) * CELL_SIZE, originY + (gy + 0.5) * CELL_SIZE).
 * We trace the OUTER EDGE of the cells, so we use cell corners, not centers.
 *
 * Alternative simpler approach: use cell centers as polygon vertices,
 * then simplify with Douglas-Peucker.
 */
function contourToWorldPolygon(
  contour: [number, number][],
  originX: number,
  originY: number
): [number, number][] {
  // Convert grid coords to world coords (cell centers)
  const worldPts: [number, number][] = contour.map(([gx, gy]) => [
    originX + (gx + 0.5) * CELL_SIZE,
    originY + (gy + 0.5) * CELL_SIZE,
  ]);

  // Simplify to reduce vertex count
  const simplified = simplifyDP(worldPts, SIMPLIFY_TOLERANCE * CELL_SIZE);

  // Ensure at least 3 points
  if (simplified.length < 3) return worldPts.length >= 3 ? worldPts : [];

  return simplified;
}

// ---- Flood fill ----

interface FloodFillResult {
  count: number;
  touchesBorder: boolean;
  gMinX: number;
  gMinY: number;
  gMaxX: number;
  gMaxY: number;
  /** First cell found (for contour tracing start) */
  startX: number;
  startY: number;
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
    return { count: 0, touchesBorder: false, gMinX: sx, gMinY: sy, gMaxX: sx, gMaxY: sy, startX: sx, startY: sy };
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

  return { count, touchesBorder, gMinX, gMinY, gMaxX, gMaxY, startX: sx, startY: sy };
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
  /** Polygon vertices in world coordinates */
  polygon: [number, number][];
}

// ---- Main detection ----

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

  const grid = new Int32Array(cols * rows);

  // ---- Classify each cell ----
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const wx = originX + (gx + 0.5) * CELL_SIZE;
      const wy = originY + (gy + 0.5) * CELL_SIZE;

      if (!pointInPolygon(wx, wy, outermost.points)) {
        grid[gy * cols + gx] = EXTERIOR;
        continue;
      }

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

  // ---- Build results with contour polygons ----
  const results: DetectedRegion[] = [];

  for (const [regionId, meta] of regionMeta) {
    if (meta.count < MIN_REGION_CELLS) continue;
    if (meta.touchesBorder) continue;

    const centroid = regionCentroid(grid, cols, regionId, originX, originY);

    // Bounding box in world coords
    const wx1 = originX + meta.gMinX * CELL_SIZE;
    const wy1 = originY + meta.gMinY * CELL_SIZE;
    const wx2 = originX + (meta.gMaxX + 1) * CELL_SIZE;
    const wy2 = originY + (meta.gMaxY + 1) * CELL_SIZE;

    // Trace contour and convert to world polygon
    const contour = traceContour(grid, cols, rows, regionId, meta.startX, meta.startY);
    const polygon = contourToWorldPolygon(contour, originX, originY);

    if (polygon.length < 3) continue;

    results.push({
      id: regionId,
      cellCount: meta.count,
      centroid,
      bounds: { x: wx1, y: wy1, width: wx2 - wx1, height: wy2 - wy1 },
      polygon,
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
 * Generate auto-zones from detected walkable regions.
 * FULL re-computation: all auto-zones are replaced.
 * User edits (label, env) are preserved by matching centroids.
 */
export function generateAutoZones(shapes: Shape[], existingZones: Zone[]): Zone[] {
  const regions = detectEnclosedRegions(shapes);

  const manualZones = existingZones.filter((z) => !z.id.startsWith("auto_zone_"));
  const autoZones   = existingZones.filter((z) =>  z.id.startsWith("auto_zone_"));

  // Build lookup of existing auto-zones by approximate centroid key
  // so user edits (label, env) are preserved across re-detections.
  // Use a coarser key (round to nearest 2000mm) for better matching
  // when boundaries shift slightly.
  const existingByKey = new Map<string, Zone>();
  for (const az of autoZones) {
    // Compute centroid from polygon if available, else from bounds center
    let cx: number, cy: number;
    if (az.bounds.points && az.bounds.points.length >= 3) {
      cx = az.bounds.points.reduce((s, p) => s + p[0], 0) / az.bounds.points.length;
      cy = az.bounds.points.reduce((s, p) => s + p[1], 0) / az.bounds.points.length;
    } else {
      cx = az.bounds.x + az.bounds.width / 2;
      cy = az.bounds.y + az.bounds.height / 2;
    }
    const key = `${Math.round(cx / 2000)}_${Math.round(cy / 2000)}`;
    existingByKey.set(key, az);
  }

  const newAutoZones: Zone[] = [];
  let labelCounter = 1;

  for (const region of regions) {
    const cx = region.centroid[0];
    const cy = region.centroid[1];
    const key = `${Math.round(cx / 2000)}_${Math.round(cy / 2000)}`;

    const existing = existingByKey.get(key);
    if (existing) {
      // Preserve user edits (label, env); update bounds + polygon
      const userModifiedLabel = existing.label && !existing.label.match(/^Zone \d+$/);
      newAutoZones.push({
        ...existing,
        bounds: {
          x:      region.bounds.x,
          y:      region.bounds.y,
          width:  region.bounds.width,
          height: region.bounds.height,
          points: region.polygon,
        },
        // Keep user-modified label, otherwise will be re-numbered below
        label: userModifiedLabel ? existing.label : `Zone ${labelCounter}`,
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
          points: region.polygon,
        },
        env: { ...defaultZoneEnv },
      });
    }
    labelCounter++;
  }

  // Re-number default labels sequentially (only those not user-modified)
  let num = 1;
  for (const z of newAutoZones) {
    if (z.label?.match(/^Zone \d+$/)) {
      z.label = `Zone ${num}`;
    }
    num++;
  }

  return [...manualZones, ...newAutoZones];
}
