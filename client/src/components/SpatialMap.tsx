// ============================================================
// SpatialMap Component - Multi-Agent 2D Canvas
// World coordinate system with pan + zoom (zoom to cursor)
// Toolbar for placing walls, windows, doors, zones, waypoints
// Object selection, drag-move, Ctrl+Z undo
// Window/Door snap-to-wall
// Agent route animation with path trails
// Clean neumorphism UI with circle agents
// ============================================================

import { useRef, useCallback, useEffect, useState } from "react";
import type { Shape, AgentPosition, Zone, Waypoint, HeatmapPoint } from "@/lib/store";
import { getPersonaColor, defaultZoneEnv } from "@/lib/store";
import { toast } from "sonner";

// ---- Types ----
type ToolMode = "select" | "wall" | "window" | "door" | "room" | "zone" | "zone_poly" | "waypoint";

// ---- Undo action types ----
interface UndoAction {
  type: "add_shape" | "add_zone" | "add_waypoint" | "move_shape" | "delete_shape" | "place_agent" | "remove_agent";
  payload: any;
}

// ---- World / Screen Transform ----
interface Camera {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

const MIN_ZOOM = 0.005;
const MAX_ZOOM = 2;
const INITIAL_ZOOM = 0.03;
const GRID_LEVELS = [500, 1000, 2000, 5000, 10000];
const SNAP_GRID = 100; // mm snap
const WALL_SNAP_DIST = 500; // mm — max distance to snap window/door to wall

function getGridStep(zoom: number): number {
  for (const step of GRID_LEVELS) {
    const px = step * zoom;
    if (px >= 40 && px <= 200) return step;
  }
  return zoom > 0.1 ? 500 : 5000;
}

function worldToScreen(wx: number, wy: number, cam: Camera): [number, number] {
  return [
    (wx - cam.offsetX) * cam.zoom,
    (cam.offsetY - wy) * cam.zoom,
  ];
}

function screenToWorld(sx: number, sy: number, cam: Camera): [number, number] {
  return [
    sx / cam.zoom + cam.offsetX,
    cam.offsetY - sy / cam.zoom,
  ];
}

function snapToGrid(v: number): number {
  return Math.round(v / SNAP_GRID) * SNAP_GRID;
}

// ---- Geometry helpers ----
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
}

function projectOntoSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): [number, number] {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return [x1, y1];
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return [x1 + t * dx, y1 + t * dy];
}

/** Find the nearest wall segment to a point, returns the projected point and distance */
function findNearestWallSnap(
  px: number, py: number, shapes: Shape[]
): { point: [number, number]; dist: number; wallIdx: number; segIdx: number } | null {
  let best: { point: [number, number]; dist: number; wallIdx: number; segIdx: number } | null = null;

  shapes.forEach((shape, shapeIdx) => {
    if (shape.type !== "wall" && shape.type !== "room") return;
    const pts = shape.points;
    const len = shape.type === "room" ? pts.length : pts.length - 1;
    for (let i = 0; i < len; i++) {
      const j = (i + 1) % pts.length;
      const d = distToSegment(px, py, pts[i][0], pts[i][1], pts[j][0], pts[j][1]);
      if (!best || d < best.dist) {
        const proj = projectOntoSegment(px, py, pts[i][0], pts[i][1], pts[j][0], pts[j][1]);
        best = { point: proj, dist: d, wallIdx: shapeIdx, segIdx: i };
      }
    }
  });

  return best;
}

// ---- Shape styles ----
const SHAPE_STYLES: Record<string, { fill: string; stroke: string; label: string; lineWidth: number; dash: number[] }> = {
  room: { fill: "rgba(29, 107, 94, 0.06)", stroke: "#1D6B5E", label: "Room", lineWidth: 2, dash: [] },
  wall: { fill: "rgba(80, 80, 80, 0.08)", stroke: "#555555", label: "Wall", lineWidth: 3, dash: [] },
  window: { fill: "rgba(59, 130, 246, 0.08)", stroke: "#3B82F6", label: "Window", lineWidth: 2.5, dash: [6, 4] },
  door: { fill: "rgba(180, 120, 70, 0.08)", stroke: "#B47846", label: "Door", lineWidth: 2.5, dash: [8, 3] },
};

// ---- Tool definitions ----
const TOOLS: { mode: ToolMode; label: string; icon: string; hint: string }[] = [
  { mode: "select", label: "Select", icon: "↖", hint: "Click to place agent · Click shape to select · Drag to move" },
  { mode: "room", label: "Room", icon: "□", hint: "Click points to draw room polygon, double-click to close" },
  { mode: "wall", label: "Wall", icon: "▬", hint: "Click 2 points to draw wall segment" },
  { mode: "window", label: "Window", icon: "▭", hint: "Click 2 points — auto-snaps to nearest wall" },
  { mode: "door", label: "Door", icon: "◫", hint: "Click 2 points — auto-snaps to nearest wall" },
  { mode: "zone", label: "Zone", icon: "▭", hint: "Click 2 corners to define zone rectangle" },
  { mode: "zone_poly", label: "Zone Poly", icon: "▦", hint: "Click points to draw zone polygon, double-click to close" },
  { mode: "waypoint", label: "Waypoint", icon: "◉", hint: "Click to place waypoint for active agent's route" },
];

// ---- Hit testing for shape selection ----
const HIT_THRESHOLD = 12; // pixels

function hitTestShape(
  sx: number, sy: number, shape: Shape, cam: Camera
): boolean {
  const pts = shape.points;
  if (pts.length < 2) return false;

  // Test distance to each segment
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = worldToScreen(pts[i][0], pts[i][1], cam);
    const [bx, by] = worldToScreen(pts[i + 1][0], pts[i + 1][1], cam);
    const d = distToSegmentScreen(sx, sy, ax, ay, bx, by);
    if (d < HIT_THRESHOLD) return true;
  }
  // For rooms, also test closing segment
  if (shape.type === "room" && pts.length >= 3) {
    const [ax, ay] = worldToScreen(pts[pts.length - 1][0], pts[pts.length - 1][1], cam);
    const [bx, by] = worldToScreen(pts[0][0], pts[0][1], cam);
    const d = distToSegmentScreen(sx, sy, ax, ay, bx, by);
    if (d < HIT_THRESHOLD) return true;
  }
  return false;
}

function distToSegmentScreen(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
}

// ---- Draw circle agent ----
function drawAgent(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  index: number,
  isActive: boolean,
  zoom: number,
) {
  const color = getPersonaColor(index);
  const r = Math.max(6, Math.min(14, 10 / (zoom * 50)));

  if (isActive) {
    ctx.beginPath();
    ctx.arc(sx, sy, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = `${color.primary}18`;
    ctx.fill();
    ctx.strokeStyle = color.primary;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = color.primary;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(sx - r * 0.25, sy - r * 0.25, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.strokeStyle = isActive ? "#FFFFFF" : "rgba(255,255,255,0.5)";
  ctx.lineWidth = isActive ? 2 : 1;
  ctx.stroke();

  ctx.font = `600 ${Math.max(10, r)}px 'Inter', sans-serif`;
  ctx.fillStyle = color.primary;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(`P${index + 1}`, sx, sy + r + 4);
  ctx.textBaseline = "alphabetic";
}

// ---- Animated agent (smaller, pulsing) ----
function drawAnimatedAgent(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  index: number,
  zoom: number,
  pulse: number,
) {
  const color = getPersonaColor(index);
  const r = Math.max(5, Math.min(12, 8 / (zoom * 50)));
  const pulseR = r + 3 * Math.sin(pulse * Math.PI * 2);

  ctx.beginPath();
  ctx.arc(sx, sy, pulseR + 4, 0, Math.PI * 2);
  ctx.fillStyle = `${color.primary}10`;
  ctx.fill();
  ctx.strokeStyle = `${color.primary}40`;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = color.primary;
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = `600 ${Math.max(9, r - 1)}px 'Inter', sans-serif`;
  ctx.fillStyle = color.primary;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(`P${index + 1}`, sx, sy + r + 3);
  ctx.textBaseline = "alphabetic";
}

export default function SpatialMap({
  shapes,
  zones = [],
  agentPositions,
  activeAgentIdx,
  onAgentPlace,
  onAgentRemove,
  onAddShape,
  onAddZone,
  onUpdateShapes,
  onDeleteShape,
  // Waypoint props
  allWaypoints = {},
  onAddWaypoint,
  onRemoveWaypoint,
  // Animation props
  animatingAgents = {},
  pathTrails = {},
  // Heatmap props
  heatmapPoints = [],
  showHeatmap = false,
}: {
  shapes: Shape[];
  zones?: Zone[];
  agentPositions: (AgentPosition | null)[];
  activeAgentIdx: number;
  onAgentPlace: (pos: AgentPosition) => void;
  onAgentRemove?: (idx: number) => void;
  onAddShape?: (shape: Shape) => void;
  onAddZone?: (zone: Zone) => void;
  onUpdateShapes?: (shapes: Shape[]) => void;
  onDeleteShape?: (idx: number) => void;
  // Waypoint props
  allWaypoints?: Record<number, Waypoint[]>;
  onAddWaypoint?: (agentIdx: number, wp: Waypoint) => void;
  onRemoveWaypoint?: (agentIdx: number, wpId: string) => void;
  // Animation props
  animatingAgents?: Record<number, AgentPosition>;
  pathTrails?: Record<number, AgentPosition[]>;
  // Heatmap props
  heatmapPoints?: HeatmapPoint[];
  showHeatmap?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(700);
  const [canvasH, setCanvasH] = useState(500);

  // Camera state
  const camRef = useRef<Camera>({
    offsetX: -1000,
    offsetY: 21000,
    zoom: INITIAL_ZOOM,
  });
  const [cam, setCam] = useState<Camera>({ ...camRef.current });

  // Tool state
  const [activeTool, setActiveTool] = useState<ToolMode>("select");
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);

  // Selection state
  const [selectedShapeIdx, setSelectedShapeIdx] = useState<number | null>(null);

  // Drag-move state
  const isDraggingShape = useRef(false);
  const dragShapeIdx = useRef<number | null>(null);
  const dragStartWorld = useRef<[number, number]>([0, 0]);
  const dragOriginalPoints = useRef<[number, number][]>([]);

  // Undo stack
  const undoStack = useRef<UndoAction[]>([]);
  const MAX_UNDO = 50;

  // Wall snap preview (for window/door tools)
  const [wallSnapPreview, setWallSnapPreview] = useState<{ point: [number, number]; wallIdx: number } | null>(null);

  // Interaction state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const [hoverWorld, setHoverWorld] = useState<{ x: number; y: number } | null>(null);
  const [hoveredAgentIdx, setHoveredAgentIdx] = useState<number | null>(null);

  // Animation pulse
  const [animPulse, setAnimPulse] = useState(0);
  const hasAnimating = Object.keys(animatingAgents).length > 0;

  useEffect(() => {
    if (!hasAnimating) return;
    let frame: number;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = (now - start) / 1000;
      setAnimPulse(elapsed % 1);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [hasAnimating]);

  // ---- Push undo ----
  const pushUndo = useCallback((action: UndoAction) => {
    undoStack.current.push(action);
    if (undoStack.current.length > MAX_UNDO) {
      undoStack.current.shift();
    }
  }, []);

  // ---- Undo handler ----
  const handleUndo = useCallback(() => {
    const action = undoStack.current.pop();
    if (!action) return;

    switch (action.type) {
      case "add_shape":
        // Remove the last added shape
        if (onDeleteShape) {
          onDeleteShape(action.payload.index);
        }
        break;
      case "move_shape":
        // Restore original points
        if (onUpdateShapes) {
          const restored = [...shapes];
          restored[action.payload.index] = {
            ...restored[action.payload.index],
            points: action.payload.originalPoints,
          };
          onUpdateShapes(restored);
        }
        break;
      case "delete_shape":
        // Re-add the deleted shape
        if (onAddShape) {
          onAddShape(action.payload.shape);
        }
        break;
      default:
        break;
    }
    toast.info("Undo");
  }, [shapes, onDeleteShape, onUpdateShapes, onAddShape]);

  // ---- Resize observer ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width);
        const h = Math.max(400, Math.min(700, Math.floor(w * 0.7)));
        setCanvasW(w);
        setCanvasH(h);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ---- Fit to content ----
  const fitToContent = useCallback(() => {
    const allPoints: [number, number][] = [];
    for (const s of shapes) {
      for (const p of s.points) allPoints.push(p);
    }
    for (const z of zones) {
      allPoints.push([z.bounds.x, z.bounds.y]);
      allPoints.push([z.bounds.x + z.bounds.width, z.bounds.y + z.bounds.height]);
    }
    for (const wps of Object.values(allWaypoints)) {
      for (const wp of wps) {
        allPoints.push([wp.position.x, wp.position.y]);
      }
    }

    let minX = 0, minY = 0, maxX = 20000, maxY = 20000;
    if (allPoints.length > 0) {
      minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
      for (const [px, py] of allPoints) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      const padX = (maxX - minX) * 0.15 || 2000;
      const padY = (maxY - minY) * 0.15 || 2000;
      minX -= padX; minY -= padY; maxX += padX; maxY += padY;
    }
    const rangeX = maxX - minX || 20000;
    const rangeY = maxY - minY || 20000;
    const zoom = Math.min(canvasW / rangeX, canvasH / rangeY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const newCam: Camera = {
      offsetX: cx - canvasW / (2 * zoom),
      offsetY: cy + canvasH / (2 * zoom),
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)),
    };
    camRef.current = newCam;
    setCam({ ...newCam });
  }, [shapes, zones, allWaypoints, canvasW, canvasH]);

  useEffect(() => {
    fitToContent();
  }, [shapes.length, zones.length, canvasW, canvasH]);

  // ---- Keyboard: Escape to cancel, Ctrl+Z to undo, Delete to remove selected ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawingPoints([]);
        setSelectedShapeIdx(null);
        if (activeTool !== "select") {
          setActiveTool("select");
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedShapeIdx !== null) {
        e.preventDefault();
        if (onDeleteShape) {
          pushUndo({ type: "delete_shape", payload: { shape: shapes[selectedShapeIdx], index: selectedShapeIdx } });
          onDeleteShape(selectedShapeIdx);
          setSelectedShapeIdx(null);
          toast.info("Shape deleted");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTool, handleUndo, selectedShapeIdx, shapes, onDeleteShape, pushUndo]);

  // ---- Draw ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = camRef.current;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = "#FAFAF6";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Grid
    const gridStep = getGridStep(c.zoom);
    ctx.strokeStyle = "#E8E3DA";
    ctx.lineWidth = 0.5;
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#C0BAB0";
    ctx.textBaseline = "top";

    const worldLeft = c.offsetX;
    const worldRight = c.offsetX + canvasW / c.zoom;
    const worldTop = c.offsetY;
    const worldBottom = c.offsetY - canvasH / c.zoom;
    const startX = Math.floor(worldLeft / gridStep) * gridStep;
    for (let wx = startX; wx <= worldRight; wx += gridStep) {
      const [sx] = worldToScreen(wx, 0, c);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvasH);
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillText(`${(wx / 1000).toFixed(wx % 1000 === 0 ? 0 : 1)}m`, sx + 3, canvasH - 16);
    }
    const startY = Math.floor(worldBottom / gridStep) * gridStep;
    for (let wy = startY; wy <= worldTop; wy += gridStep) {
      const [, sy] = worldToScreen(0, wy, c);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(canvasW, sy);
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillText(`${(wy / 1000).toFixed(wy % 1000 === 0 ? 0 : 1)}m`, 4, sy + 3);
    }

    // Origin crosshair
    const [ox, oy] = worldToScreen(0, 0, c);
    ctx.strokeStyle = "#D0CBC2";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, canvasH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(canvasW, oy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#B0AAA0";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("O", ox + 4, oy - 4);
    ctx.textBaseline = "alphabetic";

    // Draw zones
    zones.forEach((zone) => {
      const b = zone.bounds;
      let zx1, zy1, zw, zh;

      if (b.points && b.points.length >= 3) {
        ctx.beginPath();
        const [p0x, p0y] = worldToScreen(b.points[0][0], b.points[0][1], c);
        ctx.moveTo(p0x, p0y);
        for (let i = 1; i < b.points.length; i++) {
          const [px, py] = worldToScreen(b.points[i][0], b.points[i][1], c);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(29, 107, 94, 0.04)";
        ctx.fill();
        ctx.strokeStyle = "rgba(29, 107, 94, 0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label position for polygon (centroid-ish)
        zx1 = b.points.reduce((s, p) => s + p[0], 0) / b.points.length;
        zy1 = b.points.reduce((s, p) => s + p[1], 0) / b.points.length;
        const [lsx, lsy] = worldToScreen(zx1, zy1, c);
        zx1 = lsx; zy1 = lsy;
      } else {
        const [x1, y1] = worldToScreen(b.x, b.y + b.height, c);
        const [x2, y2] = worldToScreen(b.x + b.width, b.y, c);
        zx1 = x1; zy1 = y1;
        zw = x2 - x1;
        zh = y2 - y1;

        ctx.fillStyle = "rgba(29, 107, 94, 0.04)";
        ctx.fillRect(zx1, zy1, zw, zh);
        ctx.strokeStyle = "rgba(29, 107, 94, 0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(zx1, zy1, zw, zh);
        ctx.setLineDash([]);
      }

      const zlabel = zone.label || zone.id;
      ctx.font = "500 10px 'Inter', sans-serif";
      ctx.fillStyle = "rgba(29, 107, 94, 0.6)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(zlabel, zx1 + 4, zy1 + 4);
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(29, 107, 94, 0.45)";
      ctx.fillText(`${zone.env.temperature}°C  ${zone.env.light}lx  ${zone.env.noise}dB`, zx1 + 4, zy1 + 18);
      ctx.textBaseline = "alphabetic";
    });

    // ---- Draw heatmap overlay ----
    if (showHeatmap && heatmapPoints.length > 0) {
      for (const hp of heatmapPoints) {
        const [hx, hy] = worldToScreen(hp.x, hp.y, c);
        const radius = Math.max(30, 2000 * c.zoom);
        const intensity = Math.min(1, hp.value / 10);

        let r: number, g: number, b: number;
        if (intensity < 0.4) {
          const t = intensity / 0.4;
          r = Math.round(29 + (230 - 29) * t);
          g = Math.round(107 + (126 - 107) * t);
          b = Math.round(94 + (34 - 94) * t);
        } else {
          const t = (intensity - 0.4) / 0.6;
          r = Math.round(230 + (217 - 230) * t);
          g = Math.round(126 + (79 - 126) * t);
          b = Math.round(34 + (79 - 34) * t);
        }

        const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.35)`);
        grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.15)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(hx, hy, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "bold 11px 'JetBrains Mono', monospace";
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(hp.value.toFixed(1), hx, hy - radius * 0.15);
        ctx.font = "8px 'Inter', sans-serif";
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;
        ctx.fillText("stress", hx, hy + radius * 0.15);
        ctx.textBaseline = "alphabetic";
      }
    }

    // Draw shapes
    shapes.forEach((shape, shapeIdx) => {
      if (shape.points.length < 2) return;
      const style = SHAPE_STYLES[shape.type] || SHAPE_STYLES.room;
      const isSelected = shapeIdx === selectedShapeIdx;

      ctx.beginPath();
      const [sx0, sy0] = worldToScreen(shape.points[0][0], shape.points[0][1], c);
      ctx.moveTo(sx0, sy0);
      for (let i = 1; i < shape.points.length; i++) {
        const [px, py] = worldToScreen(shape.points[i][0], shape.points[i][1], c);
        ctx.lineTo(px, py);
      }
      if (shape.type === "room") {
        ctx.closePath();
        ctx.fillStyle = isSelected ? style.fill.replace("0.06", "0.15") : style.fill;
        ctx.fill();
      }
      ctx.strokeStyle = isSelected ? "#FF6B35" : style.stroke;
      ctx.lineWidth = isSelected ? style.lineWidth + 1.5 : style.lineWidth;
      ctx.setLineDash(style.dash);
      ctx.stroke();
      ctx.setLineDash([]);

      // Selection highlight glow
      if (isSelected) {
        ctx.beginPath();
        ctx.moveTo(sx0, sy0);
        for (let i = 1; i < shape.points.length; i++) {
          const [px, py] = worldToScreen(shape.points[i][0], shape.points[i][1], c);
          ctx.lineTo(px, py);
        }
        if (shape.type === "room") ctx.closePath();
        ctx.strokeStyle = "rgba(255, 107, 53, 0.25)";
        ctx.lineWidth = style.lineWidth + 6;
        ctx.stroke();
      }

      // Vertex dots
      shape.points.forEach(([wx, wy]) => {
        const [vx, vy] = worldToScreen(wx, wy, c);
        ctx.beginPath();
        ctx.arc(vx, vy, isSelected ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "#FF6B35" : style.stroke;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(vx, vy, isSelected ? 2.5 : 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "#FAFAF6";
        ctx.fill();
      });

      // Shape label
      const label = shape.label || style.label;
      const cx2 = shape.points.reduce((s, p) => s + p[0], 0) / shape.points.length;
      const cy2 = shape.points.reduce((s, p) => s + p[1], 0) / shape.points.length;
      const [lx, ly] = worldToScreen(cx2, cy2, c);
      ctx.font = "500 11px 'Inter', sans-serif";
      const tw = ctx.measureText(label);
      ctx.fillStyle = isSelected ? "rgba(255,252,247,0.95)" : "rgba(255,252,247,0.85)";
      const pad = 5;
      const rx = lx - tw.width / 2 - pad;
      const ry = ly - 8;
      const rw = tw.width + pad * 2;
      const rh = 18;
      const rr = 4;
      ctx.beginPath();
      ctx.moveTo(rx + rr, ry);
      ctx.lineTo(rx + rw - rr, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rr);
      ctx.lineTo(rx + rw, ry + rh - rr);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rr, ry + rh);
      ctx.lineTo(rx + rr, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rr);
      ctx.lineTo(rx, ry + rr);
      ctx.quadraticCurveTo(rx, ry, rx + rr, ry);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#FF6B35" : style.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = isSelected ? "#FF6B35" : style.stroke;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lx, ly + 1);
      ctx.textBaseline = "alphabetic";
    });

    // ---- Draw wall snap preview (for window/door tools) ----
    if (wallSnapPreview && (activeTool === "window" || activeTool === "door")) {
      const [spx, spy] = worldToScreen(wallSnapPreview.point[0], wallSnapPreview.point[1], c);
      // Highlight the wall being snapped to
      const wall = shapes[wallSnapPreview.wallIdx];
      if (wall) {
        ctx.beginPath();
        const [wx0, wy0] = worldToScreen(wall.points[0][0], wall.points[0][1], c);
        ctx.moveTo(wx0, wy0);
        for (let i = 1; i < wall.points.length; i++) {
          const [wpx, wpy] = worldToScreen(wall.points[i][0], wall.points[i][1], c);
          ctx.lineTo(wpx, wpy);
        }
        if (wall.type === "room") ctx.closePath();
        ctx.strokeStyle = "#FF6B3580";
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Snap point indicator
      ctx.beginPath();
      ctx.arc(spx, spy, 8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 107, 53, 0.2)";
      ctx.fill();
      ctx.strokeStyle = "#FF6B35";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(spx, spy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#FF6B35";
      ctx.fill();
    }

    // ---- Draw path trails (history) ----
    for (const [idxStr, trail] of Object.entries(pathTrails)) {
      const idx = parseInt(idxStr);
      const color = getPersonaColor(idx);
      if (!trail || trail.length < 2) continue;

      ctx.beginPath();
      const [tx0, ty0] = worldToScreen(trail[0].x, trail[0].y, c);
      ctx.moveTo(tx0, ty0);
      for (let i = 1; i < trail.length; i++) {
        const [tx, ty] = worldToScreen(trail[i].x, trail[i].y, c);
        ctx.lineTo(tx, ty);
      }
      ctx.strokeStyle = `${color.primary}60`;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- Draw waypoints for all agents ----
    for (const [idxStr, wps] of Object.entries(allWaypoints)) {
      const idx = parseInt(idxStr);
      const color = getPersonaColor(idx);
      if (!wps || wps.length === 0) continue;

      const agentPos = agentPositions[idx];
      const points: AgentPosition[] = [];
      if (agentPos) points.push(agentPos);
      wps.forEach(wp => points.push(wp.position));

      if (points.length >= 2) {
        ctx.beginPath();
        const [lx0, ly0] = worldToScreen(points[0].x, points[0].y, c);
        ctx.moveTo(lx0, ly0);
        for (let i = 1; i < points.length; i++) {
          const [lxi, lyi] = worldToScreen(points[i].x, points[i].y, c);
          ctx.lineTo(lxi, lyi);
        }
        ctx.strokeStyle = `${color.primary}50`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        for (let i = 0; i < points.length - 1; i++) {
          const [ax1, ay1] = worldToScreen(points[i].x, points[i].y, c);
          const [ax2, ay2] = worldToScreen(points[i + 1].x, points[i + 1].y, c);
          const mx = (ax1 + ax2) / 2;
          const my = (ay1 + ay2) / 2;
          const angle = Math.atan2(ay2 - ay1, ax2 - ax1);
          const arrowSize = 6;
          ctx.beginPath();
          ctx.moveTo(mx + Math.cos(angle) * arrowSize, my + Math.sin(angle) * arrowSize);
          ctx.lineTo(mx + Math.cos(angle + 2.5) * arrowSize, my + Math.sin(angle + 2.5) * arrowSize);
          ctx.lineTo(mx + Math.cos(angle - 2.5) * arrowSize, my + Math.sin(angle - 2.5) * arrowSize);
          ctx.closePath();
          ctx.fillStyle = `${color.primary}70`;
          ctx.fill();
        }
      }

      wps.forEach((wp, wpIdx) => {
        const [wpx, wpy] = worldToScreen(wp.position.x, wp.position.y, c);

        ctx.beginPath();
        ctx.arc(wpx, wpy, 10, 0, Math.PI * 2);
        ctx.fillStyle = `${color.primary}15`;
        ctx.fill();
        ctx.strokeStyle = `${color.primary}80`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(wpx, wpy, 4, 0, Math.PI * 2);
        ctx.fillStyle = color.primary;
        ctx.fill();

        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        ctx.fillStyle = color.primary;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${wpIdx + 1}`, wpx, wpy - 12); // Already starting from 1 in original code, confirmed.

        ctx.font = "500 9px 'Inter', sans-serif";
        ctx.fillStyle = `${color.primary}90`;
        ctx.textBaseline = "top";
        ctx.fillText(wp.label, wpx, wpy + 14);
        ctx.textBaseline = "alphabetic";

        if (wp.dwell_minutes > 0) {
          const dwellTxt = `${wp.dwell_minutes}min`;
          const dtw = ctx.measureText(dwellTxt);
          ctx.fillStyle = `${color.primary}15`;
          ctx.beginPath();
          ctx.roundRect(wpx - dtw.width / 2 - 3, wpy + 24, dtw.width + 6, 14, 3);
          ctx.fill();
          ctx.font = "8px 'JetBrains Mono', monospace";
          ctx.fillStyle = `${color.primary}80`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(dwellTxt, wpx, wpy + 26);
          ctx.textBaseline = "alphabetic";
        }
      });
    }

    // Draw in-progress drawing
    if (drawingPoints.length > 0 && activeTool !== "select" && activeTool !== "waypoint") {
      const toolType = (activeTool === "zone" || activeTool === "zone_poly") ? "room" : activeTool;
      const style = SHAPE_STYLES[toolType] || SHAPE_STYLES.room;

      if (activeTool === "zone" && drawingPoints.length >= 1 && hoverWorld) {
        const p0 = drawingPoints[0];
        const p1: [number, number] = [snapToGrid(hoverWorld.x), snapToGrid(hoverWorld.y)];
        const minXz = Math.min(p0[0], p1[0]);
        const minYz = Math.min(p0[1], p1[1]);
        const maxXz = Math.max(p0[0], p1[0]);
        const maxYz = Math.max(p0[1], p1[1]);
        const [zx1, zy1] = worldToScreen(minXz, maxYz, c);
        const [zx2, zy2] = worldToScreen(maxXz, minYz, c);
        ctx.fillStyle = "rgba(29, 107, 94, 0.08)";
        ctx.fillRect(zx1, zy1, zx2 - zx1, zy2 - zy1);
        ctx.strokeStyle = "rgba(29, 107, 94, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(zx1, zy1, zx2 - zx1, zy2 - zy1);
        ctx.setLineDash([]);
      } else {
        ctx.beginPath();
        const [sx0, sy0] = worldToScreen(drawingPoints[0][0], drawingPoints[0][1], c);
        ctx.moveTo(sx0, sy0);
        for (let i = 1; i < drawingPoints.length; i++) {
          const [px, py] = worldToScreen(drawingPoints[i][0], drawingPoints[i][1], c);
          ctx.lineTo(px, py);
        }
        if (hoverWorld) {
          let hx2: number, hy2: number;
          if ((activeTool === "window" || activeTool === "door") && wallSnapPreview) {
            [hx2, hy2] = worldToScreen(wallSnapPreview.point[0], wallSnapPreview.point[1], c);
          } else {
            [hx2, hy2] = worldToScreen(snapToGrid(hoverWorld.x), snapToGrid(hoverWorld.y), c);
          }
          ctx.lineTo(hx2, hy2);
        }
        ctx.strokeStyle = (activeTool === "zone_poly" || activeTool === "zone") ? "rgba(29, 107, 94, 0.5)" : style.stroke;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        drawingPoints.forEach(([wx, wy]) => {
          const [vx, vy] = worldToScreen(wx, wy, c);
          ctx.beginPath();
          ctx.arc(vx, vy, 4, 0, Math.PI * 2);
          ctx.fillStyle = (activeTool === "zone_poly" || activeTool === "zone") ? "rgba(29, 107, 94, 0.8)" : style.stroke;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(vx, vy, 2, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.fill();
        });
      }
    }

    // ---- Draw agents (static positions) ----
    const drawOrder = agentPositions
      .map((pos, i) => ({ pos, i }))
      .filter((a) => a.pos !== null && !animatingAgents[a.i])
      .sort((a, b) => (a.i === activeAgentIdx ? 1 : 0) - (b.i === activeAgentIdx ? 1 : 0));

    drawOrder.forEach(({ pos, i }) => {
      if (!pos) return;
      const [ax, ay] = worldToScreen(pos.x, pos.y, c);
      drawAgent(ctx, ax, ay, i, i === activeAgentIdx, c.zoom);
    });

    // ---- Draw animating agents ----
    for (const [idxStr, pos] of Object.entries(animatingAgents)) {
      const idx = parseInt(idxStr);
      const [ax, ay] = worldToScreen(pos.x, pos.y, c);
      drawAnimatedAgent(ctx, ax, ay, idx, c.zoom, animPulse);
    }

    // Hover crosshair
    if (hoverWorld && (activeTool === "select" || activeTool === "waypoint")) {
      const color = activeTool === "waypoint" ? "#E67E22" : getPersonaColor(activeAgentIdx).primary;
      const [hx, hy] = worldToScreen(hoverWorld.x, hoverWorld.y, c);
      ctx.strokeStyle = `${color}30`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, canvasH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(canvasW, hy); ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = "11px 'JetBrains Mono', monospace";
      const txt = `(${Math.round(hoverWorld.x)}, ${Math.round(hoverWorld.y)})`;
      const tw2 = ctx.measureText(txt);
      const tx = Math.min(hx + 12, canvasW - tw2.width - 10);
      const ty = Math.max(hy - 12, 18);
      ctx.fillStyle = "rgba(60,50,40,0.7)";
      ctx.beginPath();
      ctx.roundRect(tx - 4, ty - 14, tw2.width + 8, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      ctx.fillText(txt, tx, ty);
    }

    // Coordinate tooltip for drawing tools
    if (hoverWorld && activeTool !== "select" && activeTool !== "waypoint") {
      let displayX: number, displayY: number;
      if ((activeTool === "window" || activeTool === "door") && wallSnapPreview) {
        displayX = Math.round(wallSnapPreview.point[0]);
        displayY = Math.round(wallSnapPreview.point[1]);
      } else {
        displayX = snapToGrid(hoverWorld.x);
        displayY = snapToGrid(hoverWorld.y);
      }
      const [hx, hy] = worldToScreen(displayX, displayY, c);

      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.strokeStyle = SHAPE_STYLES[activeTool === "zone" ? "room" : activeTool]?.stroke || "#555";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = "11px 'JetBrains Mono', monospace";
      const snapLabel = (activeTool === "window" || activeTool === "door") && wallSnapPreview ? " [SNAP]" : "";
      const txt = `(${displayX}, ${displayY})${snapLabel}`;
      const tw2 = ctx.measureText(txt);
      const tx = Math.min(hx + 12, canvasW - tw2.width - 10);
      const ty = Math.max(hy - 12, 18);
      ctx.fillStyle = "rgba(60,50,40,0.7)";
      ctx.beginPath();
      ctx.roundRect(tx - 4, ty - 14, tw2.width + 8, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      ctx.fillText(txt, tx, ty);
    }
  }, [shapes, zones, agentPositions, activeAgentIdx, hoverWorld, canvasW, canvasH, cam, drawingPoints, activeTool, allWaypoints, animatingAgents, pathTrails, animPulse, heatmapPoints, showHeatmap, selectedShapeIdx, wallSnapPreview]);

  useEffect(() => { draw(); }, [draw]);

  // ---- Mouse handlers ----
  const getMouseWorld = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvasW / rect.width);
    const sy = (e.clientY - rect.top) * (canvasH / rect.height);
    return screenToWorld(sx, sy, camRef.current);
  };

  const getMouseScreen = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [
      (e.clientX - rect.left) * (canvasW / rect.width),
      (e.clientY - rect.top) * (canvasH / rect.height),
    ];
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Pan
      isPanning.current = true;
      dragMoved.current = false;
      panStart.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    } else if (e.button === 0 && activeTool === "select") {
      dragMoved.current = false;

      // Check if clicking on a selected shape to start drag
      if (selectedShapeIdx !== null) {
        const [sx, sy] = getMouseScreen(e);
        if (hitTestShape(sx, sy, shapes[selectedShapeIdx], camRef.current)) {
          // Start dragging the selected shape
          isDraggingShape.current = true;
          dragShapeIdx.current = selectedShapeIdx;
          const [wx, wy] = getMouseWorld(e);
          dragStartWorld.current = [wx, wy];
          dragOriginalPoints.current = shapes[selectedShapeIdx].points.map(p => [...p] as [number, number]);
          e.preventDefault();
          return;
        }
      }

      // Check if clicking on any shape to select it
      const [sx, sy] = getMouseScreen(e);
      for (let i = shapes.length - 1; i >= 0; i--) {
        if (hitTestShape(sx, sy, shapes[i], camRef.current)) {
          setSelectedShapeIdx(i);
          // Start drag immediately
          isDraggingShape.current = true;
          dragShapeIdx.current = i;
          const [wx, wy] = getMouseWorld(e);
          dragStartWorld.current = [wx, wy];
          dragOriginalPoints.current = shapes[i].points.map(p => [...p] as [number, number]);
          e.preventDefault();
          return;
        }
      }
    } else if (e.button === 0) {
      dragMoved.current = false;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      const c = camRef.current;
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleRatio = canvasW / rect.width;
      c.offsetX -= (dx * scaleRatio) / c.zoom;
      c.offsetY += (dy * scaleRatio) / c.zoom;
      setCam({ ...c });
      return;
    }

    // Dragging a shape
    if (isDraggingShape.current && dragShapeIdx.current !== null && onUpdateShapes) {
      const [wx, wy] = getMouseWorld(e);
      const dxW = snapToGrid(wx - dragStartWorld.current[0]);
      const dyW = snapToGrid(wy - dragStartWorld.current[1]);
      if (Math.abs(dxW) > 0 || Math.abs(dyW) > 0) {
        dragMoved.current = true;
        const newShapes = [...shapes];
        const newPoints = dragOriginalPoints.current.map(
          ([px, py]) => [px + dxW, py + dyW] as [number, number]
        );
        newShapes[dragShapeIdx.current] = {
          ...newShapes[dragShapeIdx.current],
          points: newPoints,
        };
        onUpdateShapes(newShapes);
      }
      return;
    }

    const [wx, wy] = getMouseWorld(e);
    setHoverWorld({ x: snapToGrid(wx), y: snapToGrid(wy) });

    // Wall snap preview for window/door tools
    if (activeTool === "window" || activeTool === "door") {
      const snap = findNearestWallSnap(wx, wy, shapes);
      if (snap && snap.dist <= WALL_SNAP_DIST) {
        setWallSnapPreview({ point: snap.point, wallIdx: snap.wallIdx });
      } else {
        setWallSnapPreview(null);
      }
    } else {
      setWallSnapPreview(null);
    }

    // Check hover over agents (only in select mode)
    if (activeTool === "select") {
      const [sx, sy] = getMouseScreen(e);
      let hovIdx: number | null = null;
      for (let i = 0; i < agentPositions.length; i++) {
        const pos = agentPositions[i];
        if (!pos) continue;
        const [ax, ay] = worldToScreen(pos.x, pos.y, camRef.current);
        const dist = Math.sqrt((sx - ax) ** 2 + (sy - ay) ** 2);
        if (dist < 18) { hovIdx = i; break; }
      }
      setHoveredAgentIdx(hovIdx);
    } else {
      setHoveredAgentIdx(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) {
      isPanning.current = false;
      return;
    }

    // End shape drag
    if (isDraggingShape.current && dragShapeIdx.current !== null) {
      isDraggingShape.current = false;
      if (dragMoved.current) {
        // Push undo for the move
        pushUndo({
          type: "move_shape",
          payload: {
            index: dragShapeIdx.current,
            originalPoints: dragOriginalPoints.current,
          },
        });
        toast.success("Shape moved");
      }
      dragShapeIdx.current = null;
      if (dragMoved.current) return; // Don't process as click if we dragged
    }

    if (e.button !== 0 || e.altKey || dragMoved.current) return;

    const [wx, wy] = getMouseWorld(e);
    const snappedX = snapToGrid(wx);
    const snappedY = snapToGrid(wy);

    if (activeTool === "select") {
      // Check if clicking on a shape
      const [sx, sy] = getMouseScreen(e);
      let clickedShape = false;
      for (let i = shapes.length - 1; i >= 0; i--) {
        if (hitTestShape(sx, sy, shapes[i], camRef.current)) {
          setSelectedShapeIdx(i);
          clickedShape = true;
          break;
        }
      }

      if (!clickedShape) {
        // Deselect if clicking on empty space
        if (selectedShapeIdx !== null) {
          setSelectedShapeIdx(null);
        } else {
          // Place agent only if nothing is selected and clicking empty space
          onAgentPlace({ x: snappedX, y: snappedY });
        }
      }
    } else if (activeTool === "waypoint") {
      if (!agentPositions[activeAgentIdx]) {
        toast.error("Please place agent first before adding waypoints");
        return;
      }
      if (onAddWaypoint) {
        const existingWps = allWaypoints[activeAgentIdx] || [];
        const wpNum = existingWps.length + 1;
        const wp: Waypoint = {
          id: `wp_${activeAgentIdx}_${Date.now()}`,
          label: `WP${wpNum}`,
          position: { x: snappedX, y: snappedY },
          dwell_minutes: 5,
        };
        onAddWaypoint(activeAgentIdx, wp);
        pushUndo({ type: "add_waypoint", payload: { agentIdx: activeAgentIdx, wp } });
        toast.success(`Waypoint ${wpNum} placed for P${activeAgentIdx + 1}`);
      }
    } else if (activeTool === "zone") {
      const newPoints = [...drawingPoints, [snappedX, snappedY] as [number, number]];
      if (newPoints.length >= 2) {
        const p0 = newPoints[0];
        const p1 = newPoints[1];
        const minXz = Math.min(p0[0], p1[0]);
        const minYz = Math.min(p0[1], p1[1]);
        const maxXz = Math.max(p0[0], p1[0]);
        const maxYz = Math.max(p0[1], p1[1]);
        const w = maxXz - minXz;
        const h = maxYz - minYz;
        if (w > 0 && h > 0 && onAddZone) {
          const zone: Zone = {
            id: `zone_${Date.now()}`,
            label: `Zone ${zones.length + 1}`,
            bounds: { x: minXz, y: minYz, width: w, height: h },
            env: { ...defaultZoneEnv },
          };
          onAddZone(zone);
          pushUndo({ type: "add_zone", payload: { zone } });
          toast.success(`Zone created: ${w}mm × ${h}mm`);
        }
        setDrawingPoints([]);
      } else {
        setDrawingPoints(newPoints);
      }
    } else if (activeTool === "room" || activeTool === "zone_poly") {
      setDrawingPoints([...drawingPoints, [snappedX, snappedY]]);
    } else if (activeTool === "window" || activeTool === "door") {
      // Window/Door: snap to wall
      let pointToAdd: [number, number];
      if (wallSnapPreview) {
        pointToAdd = [Math.round(wallSnapPreview.point[0]), Math.round(wallSnapPreview.point[1])];
      } else {
        // No wall nearby — still allow placement but warn
        pointToAdd = [snappedX, snappedY];
      }

      const newPoints = [...drawingPoints, pointToAdd];
      if (newPoints.length >= 2) {
        if (onAddShape) {
          const newShape: Shape = {
            type: activeTool,
            points: newPoints,
          };
          onAddShape(newShape);
          pushUndo({ type: "add_shape", payload: { shape: newShape, index: shapes.length } });
          if (!wallSnapPreview) {
            toast.warning(`${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} placed (not snapped to wall)`);
          } else {
            toast.success(`${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} snapped to wall`);
          }
        }
        setDrawingPoints([]);
      } else {
        setDrawingPoints(newPoints);
      }
    } else {
      // Wall
      const newPoints = [...drawingPoints, [snappedX, snappedY] as [number, number]];
      if (newPoints.length >= 2) {
        if (onAddShape) {
          const newShape: Shape = {
            type: activeTool as "wall",
            points: newPoints,
          };
          onAddShape(newShape);
          pushUndo({ type: "add_shape", payload: { shape: newShape, index: shapes.length } });
          toast.success(`${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} added`);
        }
        setDrawingPoints([]);
      } else {
        setDrawingPoints(newPoints);
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === "room" && drawingPoints.length >= 3 && onAddShape) {
      const newShape: Shape = {
        type: "room",
        points: drawingPoints,
      };
      onAddShape(newShape);
      pushUndo({ type: "add_shape", payload: { shape: newShape, index: shapes.length } });
      toast.success(`Room created with ${drawingPoints.length} points`);
      setDrawingPoints([]);
      e.preventDefault();
    } else if (activeTool === "zone_poly" && drawingPoints.length >= 3 && onAddZone) {
      // Find bounding box for polygon zone
      const minX = Math.min(...drawingPoints.map(p => p[0]));
      const minY = Math.min(...drawingPoints.map(p => p[1]));
      const maxX = Math.max(...drawingPoints.map(p => p[0]));
      const maxY = Math.max(...drawingPoints.map(p => p[1]));
      
      const zone: Zone = {
        id: `zone_${Date.now()}`,
        label: `Zone ${zones.length + 1}`,
        bounds: { 
          x: minX, 
          y: minY, 
          width: maxX - minX, 
          height: maxY - minY,
          points: drawingPoints.map(p => [...p] as [number, number])
        },
        env: { ...defaultZoneEnv },
      };
      onAddZone(zone);
      pushUndo({ type: "add_zone", payload: { zone } });
      toast.success(`Polygon zone created with ${drawingPoints.length} points`);
      setDrawingPoints([]);
      e.preventDefault();
    }
  };

  // ---- Zoom to cursor (native wheel listener with passive:false) ----
  // We use a native event listener instead of React onWheel because
  // React registers wheel events as passive, making preventDefault() impossible.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (canvasW / rect.width);
      const sy = (e.clientY - rect.top) * (canvasH / rect.height);

      const c = camRef.current;

      // Get world position under cursor BEFORE zoom
      const [wxBefore, wyBefore] = screenToWorld(sx, sy, c);

      // Apply zoom factor
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      c.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, c.zoom * factor));

      // Adjust offset so the world position under cursor stays at the same screen position
      c.offsetX = wxBefore - sx / c.zoom;
      c.offsetY = wyBefore + sy / c.zoom;

      setCam({ ...c });
    };

    canvas.addEventListener("wheel", handleWheelNative, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheelNative);
    };
  }, [canvasW, canvasH]);

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (activeTool !== "select") {
      setDrawingPoints([]);
      return;
    }

    // Delete selected shape on right-click
    if (selectedShapeIdx !== null && onDeleteShape) {
      pushUndo({ type: "delete_shape", payload: { shape: shapes[selectedShapeIdx], index: selectedShapeIdx } });
      onDeleteShape(selectedShapeIdx);
      setSelectedShapeIdx(null);
      toast.info("Shape deleted");
      return;
    }

    if (hoveredAgentIdx !== null && onAgentRemove) {
      onAgentRemove(hoveredAgentIdx);
      setHoveredAgentIdx(null);
    }
  };

  const getCursor = (): string => {
    if (isPanning.current) return "grabbing";
    if (isDraggingShape.current) return "move";
    if (activeTool === "select") {
      if (hoveredAgentIdx !== null) return "pointer";
      // Check if hovering over a shape
      if (hoverWorld) {
        const canvas = canvasRef.current;
        if (canvas) {
          // Use approximate screen coords from hover
          const [sx, sy] = worldToScreen(hoverWorld.x, hoverWorld.y, camRef.current);
          for (let i = shapes.length - 1; i >= 0; i--) {
            if (hitTestShape(sx, sy, shapes[i], camRef.current)) {
              return selectedShapeIdx === i ? "move" : "pointer";
            }
          }
        }
      }
      return "crosshair";
    }
    return "crosshair";
  };

  const currentToolInfo = TOOLS.find((t) => t.mode === activeTool);

  return (
    <div ref={containerRef} className="w-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {TOOLS.map((tool) => (
          <button
            key={tool.mode}
            onClick={() => { setActiveTool(tool.mode); setDrawingPoints([]); setSelectedShapeIdx(null); }}
            className="sa-tool-btn"
            style={{
              background: activeTool === tool.mode ? "var(--primary)" : "var(--card)",
              color: activeTool === tool.mode ? "#fff" : "var(--foreground)",
              border: `1.5px solid ${activeTool === tool.mode ? "var(--primary)" : "var(--border)"}`,
              boxShadow: activeTool === tool.mode
                ? "0 2px 8px rgba(29, 107, 94, 0.3), inset 0 1px 0 rgba(255,255,255,0.15)"
                : "2px 2px 6px rgba(0,0,0,0.05), -1px -1px 4px rgba(255,255,255,0.8), inset 0 1px 0 rgba(255,255,255,0.6)",
              padding: "6px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
            title={tool.hint}
          >
            <span style={{ fontSize: "14px", lineHeight: 1 }}>{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}

        <div className="flex-1" />

        {/* Undo button */}
        <button
          onClick={handleUndo}
          className="sa-tool-btn"
          style={{
            background: "var(--card)",
            color: "var(--muted-foreground)",
            border: "1.5px solid var(--border)",
            boxShadow: "2px 2px 6px rgba(0,0,0,0.05), -1px -1px 4px rgba(255,255,255,0.8)",
            padding: "6px 10px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 500,
          }}
          title="Undo (Ctrl+Z)"
        >
          ↩ Undo
        </button>

        {/* Drawing status */}
        {drawingPoints.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded" style={{
              background: "var(--primary-light)",
              color: "var(--primary)",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {drawingPoints.length} point{drawingPoints.length > 1 ? "s" : ""}
            </span>
            <button
              className="sa-btn text-xs px-2 py-1"
              style={{ background: "#D94F4F20", color: "#D94F4F", borderColor: "#D94F4F40" }}
              onClick={() => setDrawingPoints([])}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Selected shape info */}
        {selectedShapeIdx !== null && (
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded" style={{
              background: "#FF6B3515",
              color: "#FF6B35",
              fontFamily: "'JetBrains Mono', monospace",
              border: "1px solid #FF6B3530",
            }}>
              Selected: {shapes[selectedShapeIdx]?.label || shapes[selectedShapeIdx]?.type}
            </span>
            <button
              className="sa-btn text-xs px-2 py-1"
              style={{ background: "#D94F4F20", color: "#D94F4F", borderColor: "#D94F4F40" }}
              onClick={() => {
                if (onDeleteShape && selectedShapeIdx !== null) {
                  pushUndo({ type: "delete_shape", payload: { shape: shapes[selectedShapeIdx], index: selectedShapeIdx } });
                  onDeleteShape(selectedShapeIdx);
                  setSelectedShapeIdx(null);
                  toast.info("Shape deleted");
                }
              }}
            >
              Delete
            </button>
            <button
              className="sa-btn text-xs px-2 py-1"
              onClick={() => setSelectedShapeIdx(null)}
            >
              Deselect
            </button>
          </div>
        )}

        <button
          onClick={fitToContent}
          className="sa-tool-btn"
          style={{
            background: "var(--card)",
            color: "var(--foreground)",
            border: "1.5px solid var(--border)",
            boxShadow: "2px 2px 6px rgba(0,0,0,0.05), -1px -1px 4px rgba(255,255,255,0.8)",
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 500,
          }}
          title="Fit view to content"
        >
          Fit View
        </button>
      </div>

      {/* Tool hint */}
      {currentToolInfo && (
        <div className="text-xs mb-2 px-1" style={{ color: "var(--muted-foreground)" }}>
          {currentToolInfo.hint}
          {activeTool !== "select" && activeTool !== "waypoint" && " · Right-click or Esc to cancel"}
          {activeTool === "select" && " · Ctrl+Z to undo · Delete key to remove selected"}
        </div>
      )}

      {/* Agent legend + waypoint counts */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {agentPositions.map((pos, i) => {
          const wps = allWaypoints[i] || [];
          return (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all" style={{
              background: i === activeAgentIdx ? `${getPersonaColor(i).primary}12` : "transparent",
              border: i === activeAgentIdx ? `1.5px solid ${getPersonaColor(i).primary}40` : "1.5px solid transparent",
            }}>
              <div className="w-3 h-3 rounded-full" style={{
                background: getPersonaColor(i).primary,
                opacity: pos ? 1 : 0.3,
                boxShadow: pos ? `0 0 6px ${getPersonaColor(i).primary}40` : "none",
              }} />
              <span className="text-xs font-medium" style={{
                color: i === activeAgentIdx ? getPersonaColor(i).primary : "#8A847A",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "11px",
              }}>
                P{i + 1} {pos ? `(${pos.x}, ${pos.y})` : "not placed"}
                {wps.length > 0 && ` · ${wps.length} WP`}
              </span>
              {pos && onAgentRemove && (
                <button
                  onClick={() => onAgentRemove(i)}
                  className="ml-0.5 w-5 h-5 flex items-center justify-center rounded-full text-xs transition-colors"
                  style={{
                    background: `${getPersonaColor(i).primary}15`,
                    color: getPersonaColor(i).primary,
                  }}
                  title="Remove this agent"
                >
                  x
                </button>
              )}
            </div>
          );
        })}
      </div>

      <canvas
        ref={canvasRef}
        style={{
          width: `${canvasW}px`,
          height: `${canvasH}px`,
          cursor: getCursor(),
          borderRadius: "12px",
          border: "1.5px solid var(--border)",
          boxShadow: "4px 4px 14px rgba(0,0,0,0.07), -2px -2px 8px rgba(255,255,255,0.8), inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={() => {
          setHoverWorld(null);
          setHoveredAgentIdx(null);
          isPanning.current = false;
          if (isDraggingShape.current) {
            isDraggingShape.current = false;
            dragShapeIdx.current = null;
          }
        }}
        onContextMenu={handleContextMenu}
      />

      {/* Controls hint */}
      <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "#8A847A" }}>
        <span>Alt+drag to pan</span>
        <span>Scroll to zoom (to cursor)</span>
        {activeTool === "select" && <span>Click shape to select · Drag to move · Del to delete · Click empty to place agent</span>}
        {(activeTool === "room" || activeTool === "zone_poly") && <span>Double-click to close polygon</span>}
        {activeTool === "waypoint" && <span>Click to place waypoint for P{activeAgentIdx + 1} (requires agent placed)</span>}
        {(activeTool === "window" || activeTool === "door") && <span>Auto-snaps to nearest wall (within 500mm)</span>}
      </div>
    </div>
  );
}
