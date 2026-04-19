// ============================================================
// SentiArch — Layout Generation Engine
// Phase 1, Step 3
//
// Public API for the layout generation engine.
// ============================================================

export { generateFloorLayouts, generateAllFloorLayouts } from "./solver";
export {
  polygonArea,
  boundingBox,
  createRect,
  pointInPolygon,
  centroid,
  touchesBoundary,
  rectsAdjacent,
  sharedEdgeMidpoint,
} from "./geometry";
