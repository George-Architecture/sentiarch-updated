// ============================================================
// Auto-Zone Detection — Grid-based flood fill
// Detects enclosed spaces formed by boundary + wall shapes
// ============================================================

import type { Shape, Zone, ZoneEnv } from "./store";
import { defaultZoneEnv } from "./store";

// ---- Configuration ----
const CELL_SIZE = 500; // mm per grid cell (resolution)
const WALL_THICKNESS = 3; // cells to rasterize wall thickness
const MIN_REGION_CELLS = 16; // minimum cells for a region to become a zone

// ---- Grid cell states ----
const EMPTY = 0;
const WALL_CELL = -1;

/**
 * Rasterize a line segment onto the grid, marking cells as walls.
 * Uses Bresenham-like thick line rasterization.
 */
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

/**
 * Rasterize a polygon boundary onto the grid (edges only).
 */
function rasterizePolygon(
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

/**
 * Flood-fill from (sx, sy) marking all connected EMPTY cells with regionId.
 * Returns the number of cells filled.
 */
function floodFill(
  grid: Int32Array,
  cols: number,
  rows: number,
  sx: number,
  sy: number,
  regionId: number
): number {
  const stack: number[] = [];
  const idx = sy * cols + sx;
  if (grid[idx] !== EMPTY) return 0;
  grid[idx] = regionId;
  stack.push(idx);
  let count = 0;
  while (stack.length > 0) {
    const ci = stack.pop()!;
    count++;
    const cx = ci % cols;
    const cy = (ci - cx) / cols;
    // 4-connected neighbors
    const neighbors = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
        const ni = ny * cols + nx;
        if (grid[ni] === EMPTY) {
          grid[ni] = regionId;
          stack.push(ni);
        }
      }
    }
  }
  return count;
}

/**
 * Check if a point is inside a polygon using ray casting.
 */
function pointInPolygon(px: number, py: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Compute the bounding polygon (convex hull or axis-aligned bbox) for a set of grid cells.
 * Returns polygon points in world coordinates.
 */
function regionBoundsToPolygon(
  grid: Int32Array,
  cols: number,
  regionId: number,
  originX: number,
  originY: number
): [number, number][] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === regionId) {
      const gx = i % cols;
      const gy = (i - gx) / cols;
      if (gx < minX) minX = gx;
      if (gx > maxX) maxX = gx;
      if (gy < minY) minY = gy;
      if (gy > maxY) maxY = gy;
    }
  }
  // Convert to world coords
  const wx1 = originX + minX * CELL_SIZE;
  const wy1 = originY + minY * CELL_SIZE;
  const wx2 = originX + (maxX + 1) * CELL_SIZE;
  const wy2 = originY + (maxY + 1) * CELL_SIZE;
  return [
    [wx1, wy1],
    [wx2, wy1],
    [wx2, wy2],
    [wx1, wy2],
  ];
}

/**
 * Compute the centroid of a region's cells in world coordinates.
 */
function regionCentroid(
  grid: Int32Array,
  cols: number,
  regionId: number,
  originX: number,
  originY: number
): [number, number] {
  let sumX = 0,
    sumY = 0,
    count = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === regionId) {
      const gx = i % cols;
      const gy = (i - gx) / cols;
      sumX += gx;
      sumY += gy;
      count++;
    }
  }
  return [
    originX + (sumX / count + 0.5) * CELL_SIZE,
    originY + (sumY / count + 0.5) * CELL_SIZE,
  ];
}

export interface DetectedRegion {
  id: number;
  cellCount: number;
  centroid: [number, number];
  bounds: { x: number; y: number; width: number; height: number };
  polygon: [number, number][];
}

/**
 * Main auto-zone detection function.
 * Scans all boundary and wall shapes, finds enclosed regions via flood fill.
 *
 * @param shapes - All shapes on the map
 * @returns Array of detected enclosed regions
 */
export function detectEnclosedRegions(shapes: Shape[]): DetectedRegion[] {
  const boundaries = shapes.filter((s) => s.type === "boundary");
  const walls = shapes.filter((s) => s.type === "wall");

  if (boundaries.length === 0) return [];

  // Compute bounding box of all shapes
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of shapes) {
    if (s.type !== "boundary" && s.type !== "wall") continue;
    for (const [px, py] of s.points) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }

  // Add padding
  const pad = CELL_SIZE * 5;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;

  const cols = Math.ceil((maxX - minX) / CELL_SIZE) + 1;
  const rows = Math.ceil((maxY - minY) / CELL_SIZE) + 1;

  // Safety check: limit grid size to prevent memory issues
  if (cols * rows > 4_000_000) {
    console.warn("Auto-zone: grid too large, skipping detection");
    return [];
  }

  const grid = new Int32Array(cols * rows); // initialized to EMPTY (0)

  // Rasterize all boundary edges
  for (const b of boundaries) {
    if (b.points.length >= 3) {
      rasterizePolygon(grid, cols, rows, b.points, minX, minY, WALL_THICKNESS);
    }
  }

  // Rasterize all walls
  for (const w of walls) {
    if (w.points.length >= 2) {
      for (let i = 0; i < w.points.length - 1; i++) {
        const x1g = Math.round((w.points[i][0] - minX) / CELL_SIZE);
        const y1g = Math.round((w.points[i][1] - minY) / CELL_SIZE);
        const x2g = Math.round((w.points[i + 1][0] - minX) / CELL_SIZE);
        const y2g = Math.round((w.points[i + 1][1] - minY) / CELL_SIZE);
        rasterizeLine(grid, cols, rows, x1g, y1g, x2g, y2g, WALL_THICKNESS);
      }
    }
  }

  // Flood fill to find regions
  let nextRegionId = 1;
  const regionCounts: Map<number, number> = new Map();

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y * cols + x] === EMPTY) {
        const count = floodFill(grid, cols, rows, x, y, nextRegionId);
        regionCounts.set(nextRegionId, count);
        nextRegionId++;
      }
    }
  }

  // Filter: only keep regions that are inside a boundary polygon
  // and meet minimum size requirement
  const results: DetectedRegion[] = [];

  for (const [regionId, cellCount] of regionCounts) {
    if (cellCount < MIN_REGION_CELLS) continue;

    const centroid = regionCentroid(grid, cols, regionId, minX, minY);

    // Check if centroid is inside any boundary polygon
    const insideBoundary = boundaries.some(
      (b) => b.points.length >= 3 && pointInPolygon(centroid[0], centroid[1], b.points)
    );
    if (!insideBoundary) continue;

    const polygon = regionBoundsToPolygon(grid, cols, regionId, minX, minY);
    const bx = polygon[0][0];
    const by = polygon[0][1];
    const bw = polygon[1][0] - polygon[0][0];
    const bh = polygon[2][1] - polygon[0][1];

    results.push({
      id: regionId,
      cellCount,
      centroid,
      bounds: { x: bx, y: by, width: bw, height: bh },
      polygon,
    });
  }

  // Sort by position (top-left to bottom-right) for consistent numbering
  results.sort((a, b) => {
    const ay = a.centroid[1];
    const by2 = b.centroid[1];
    if (Math.abs(ay - by2) > 2000) return ay - by2;
    return a.centroid[0] - b.centroid[0];
  });

  return results;
}

/**
 * Generate auto-zones from detected regions, preserving user-modified zones.
 *
 * @param shapes - All shapes on the map
 * @param existingZones - Current zones (may include auto-generated and manual ones)
 * @returns Updated zones array
 */
export function generateAutoZones(
  shapes: Shape[],
  existingZones: Zone[]
): Zone[] {
  const regions = detectEnclosedRegions(shapes);

  // Separate existing zones into auto-generated and manual
  const autoZones = existingZones.filter((z) => z.id.startsWith("auto_zone_"));
  const manualZones = existingZones.filter((z) => !z.id.startsWith("auto_zone_"));

  // Build a map of existing auto-zones by their approximate centroid
  // so we can match them to new regions and preserve user edits
  const existingAutoMap = new Map<string, Zone>();
  for (const az of autoZones) {
    // Use centroid as key (rounded to nearest 1000mm)
    const cx = az.bounds.x + az.bounds.width / 2;
    const cy = az.bounds.y + az.bounds.height / 2;
    const key = `${Math.round(cx / 1000)}_${Math.round(cy / 1000)}`;
    existingAutoMap.set(key, az);
  }

  // Generate new auto-zones, preserving user modifications
  const newAutoZones: Zone[] = [];
  let labelCounter = 1;

  for (const region of regions) {
    const cx = region.centroid[0];
    const cy = region.centroid[1];
    const key = `${Math.round(cx / 1000)}_${Math.round(cy / 1000)}`;

    const existing = existingAutoMap.get(key);
    if (existing) {
      // Preserve user-modified label and env, update bounds
      newAutoZones.push({
        ...existing,
        bounds: {
          x: region.bounds.x,
          y: region.bounds.y,
          width: region.bounds.width,
          height: region.bounds.height,
          points: region.polygon,
        },
      });
      existingAutoMap.delete(key);
    } else {
      // Create new auto-zone
      newAutoZones.push({
        id: `auto_zone_${Date.now()}_${labelCounter}`,
        label: `Zone ${labelCounter}`,
        bounds: {
          x: region.bounds.x,
          y: region.bounds.y,
          width: region.bounds.width,
          height: region.bounds.height,
          points: region.polygon,
        },
        env: { ...defaultZoneEnv },
      });
    }
    labelCounter++;
  }

  // Re-number labels for new auto-zones that don't have user-modified labels
  let zoneNum = 1;
  for (const z of newAutoZones) {
    if (z.label?.match(/^Zone \d+$/)) {
      z.label = `Zone ${zoneNum}`;
    }
    zoneNum++;
  }

  // Combine: manual zones + new auto-zones
  return [...manualZones, ...newAutoZones];
}
