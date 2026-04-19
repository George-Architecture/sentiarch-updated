// ============================================================
// SentiArch — Geometry Utilities for Layout Engine
//
// Pure functions for 2D polygon operations: area calculation,
// point-in-polygon, bounding box, edge detection, etc.
// ============================================================

import type { Point2D, Polygon2D } from "@/types/layout";

/**
 * Compute the signed area of a polygon using the shoelace formula.
 *
 * Positive for counter-clockwise, negative for clockwise.
 */
export function signedArea(vertices: Point2D[]): number {
  const n = vertices.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return area / 2;
}

/**
 * Compute the absolute area of a polygon in m².
 */
export function polygonArea(polygon: Polygon2D): number {
  return Math.abs(signedArea(polygon.vertices));
}

/**
 * Compute the axis-aligned bounding box of a polygon.
 */
export function boundingBox(vertices: Point2D[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Create a rectangular polygon from position and dimensions.
 */
export function createRect(
  x: number,
  y: number,
  width: number,
  height: number
): Polygon2D {
  return {
    vertices: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
  };
}

/**
 * Check if a point is inside a polygon (ray-casting algorithm).
 */
export function pointInPolygon(point: Point2D, polygon: Polygon2D): boolean {
  const { vertices } = polygon;
  const n = vertices.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Compute the centroid of a polygon.
 */
export function centroid(vertices: Point2D[]): Point2D {
  let cx = 0;
  let cy = 0;
  for (const v of vertices) {
    cx += v.x;
    cy += v.y;
  }
  const n = vertices.length;
  return { x: cx / n, y: cy / n };
}

/**
 * Check if a rectangle (defined by its 4 corners) touches the
 * exterior boundary of a polygon.
 *
 * A room "touches exterior" if any of its edges are within a
 * tolerance of the boundary edges.
 */
export function touchesBoundary(
  roomVertices: Point2D[],
  boundaryVertices: Point2D[],
  tolerance: number = 0.5
): boolean {
  // Check if any room vertex is close to any boundary edge
  for (const rv of roomVertices) {
    for (let i = 0; i < boundaryVertices.length; i++) {
      const j = (i + 1) % boundaryVertices.length;
      const dist = pointToSegmentDistance(
        rv,
        boundaryVertices[i],
        boundaryVertices[j]
      );
      if (dist < tolerance) return true;
    }
  }
  return false;
}

/**
 * Distance from a point to a line segment.
 */
export function pointToSegmentDistance(
  p: Point2D,
  a: Point2D,
  b: Point2D
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    // a and b are the same point
    return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}

/**
 * Check if two axis-aligned rectangles overlap.
 */
export function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  margin: number = 0
): boolean {
  return !(
    a.x + a.w + margin <= b.x ||
    b.x + b.w + margin <= a.x ||
    a.y + a.h + margin <= b.y ||
    b.y + b.h + margin <= a.y
  );
}

/**
 * Check if two rectangles share an edge (are adjacent).
 *
 * Two rooms are adjacent if they share a wall segment of
 * non-trivial length.
 */
export function rectsAdjacent(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  tolerance: number = 0.5
): boolean {
  // Check horizontal adjacency (share vertical edge)
  const hAdj =
    (Math.abs(a.x + a.w - b.x) < tolerance ||
      Math.abs(b.x + b.w - a.x) < tolerance) &&
    a.y < b.y + b.h - tolerance &&
    b.y < a.y + a.h - tolerance;

  // Check vertical adjacency (share horizontal edge)
  const vAdj =
    (Math.abs(a.y + a.h - b.y) < tolerance ||
      Math.abs(b.y + b.h - a.y) < tolerance) &&
    a.x < b.x + b.w - tolerance &&
    b.x < a.x + a.w - tolerance;

  return hAdj || vAdj;
}

/**
 * Find the midpoint of the shared edge between two adjacent rectangles.
 */
export function sharedEdgeMidpoint(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  tolerance: number = 0.5
): Point2D | null {
  // Vertical shared edge (a right = b left or vice versa)
  if (Math.abs(a.x + a.w - b.x) < tolerance) {
    const overlapStart = Math.max(a.y, b.y);
    const overlapEnd = Math.min(a.y + a.h, b.y + b.h);
    if (overlapEnd > overlapStart) {
      return { x: a.x + a.w, y: (overlapStart + overlapEnd) / 2 };
    }
  }
  if (Math.abs(b.x + b.w - a.x) < tolerance) {
    const overlapStart = Math.max(a.y, b.y);
    const overlapEnd = Math.min(a.y + a.h, b.y + b.h);
    if (overlapEnd > overlapStart) {
      return { x: a.x, y: (overlapStart + overlapEnd) / 2 };
    }
  }
  // Horizontal shared edge (a bottom = b top or vice versa)
  if (Math.abs(a.y + a.h - b.y) < tolerance) {
    const overlapStart = Math.max(a.x, b.x);
    const overlapEnd = Math.min(a.x + a.w, b.x + b.w);
    if (overlapEnd > overlapStart) {
      return { x: (overlapStart + overlapEnd) / 2, y: a.y + a.h };
    }
  }
  if (Math.abs(b.y + b.h - a.y) < tolerance) {
    const overlapStart = Math.max(a.x, b.x);
    const overlapEnd = Math.min(a.x + a.w, b.x + b.w);
    if (overlapEnd > overlapStart) {
      return { x: (overlapStart + overlapEnd) / 2, y: a.y };
    }
  }
  return null;
}
