// ============================================================
// SpatialMap Component - Multi-Agent 2D Canvas
// World coordinate system with pan + zoom
// Clean neumorphism UI with circle agents
// ============================================================

import { useRef, useCallback, useEffect, useState } from "react";
import type { Shape, AgentPosition, Zone } from "@/lib/store";
import { PERSONA_COLORS } from "@/lib/store";

// ---- World / Screen Transform ----
interface Camera {
  offsetX: number; // world X at screen left
  offsetY: number; // world Y at screen top
  zoom: number;    // pixels per world unit (mm)
}

const MIN_ZOOM = 0.005;
const MAX_ZOOM = 2;
const INITIAL_ZOOM = 0.03; // ~600px for 20000mm
const GRID_LEVELS = [500, 1000, 2000, 5000, 10000]; // mm

function getGridStep(zoom: number): number {
  // Pick grid step so that grid cells are ~60-150px on screen
  for (const step of GRID_LEVELS) {
    const px = step * zoom;
    if (px >= 40 && px <= 200) return step;
  }
  return zoom > 0.1 ? 500 : 5000;
}

function worldToScreen(wx: number, wy: number, cam: Camera): [number, number] {
  return [
    (wx - cam.offsetX) * cam.zoom,
    (cam.offsetY - wy) * cam.zoom, // Y flipped: world Y up, screen Y down
  ];
}

function screenToWorld(sx: number, sy: number, cam: Camera): [number, number] {
  return [
    sx / cam.zoom + cam.offsetX,
    cam.offsetY - sy / cam.zoom,
  ];
}

// ---- Shape styles ----
const SHAPE_STYLES: Record<string, { fill: string; stroke: string; label: string }> = {
  room: { fill: "rgba(29, 158, 117, 0.06)", stroke: "#1D9E75", label: "Room" },
  window: { fill: "rgba(59, 130, 246, 0.08)", stroke: "#3B82F6", label: "Window" },
  door: { fill: "rgba(180, 120, 70, 0.08)", stroke: "#B47846", label: "Door" },
};

// ---- Draw circle agent ----
function drawAgent(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  index: number,
  isActive: boolean,
  zoom: number,
) {
  const color = PERSONA_COLORS[index];
  const r = Math.max(6, Math.min(14, 10 / (zoom * 50))); // adaptive radius

  // Outer glow for active
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

  // Main circle
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = color.primary;
  ctx.fill();

  // Inner highlight
  ctx.beginPath();
  ctx.arc(sx - r * 0.25, sy - r * 0.25, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();

  // Border
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.strokeStyle = isActive ? "#FFFFFF" : "rgba(255,255,255,0.5)";
  ctx.lineWidth = isActive ? 2 : 1;
  ctx.stroke();

  // Label
  ctx.font = `600 ${Math.max(10, r)}px 'Inter', sans-serif`;
  ctx.fillStyle = color.primary;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(`P${index + 1}`, sx, sy + r + 4);
  ctx.textBaseline = "alphabetic";
}

export default function SpatialMap({
  shapes,
  zones = [],
  agentPositions,
  activeAgentIdx,
  onAgentPlace,
  onAgentRemove,
}: {
  shapes: Shape[];
  zones?: Zone[];
  agentPositions: (AgentPosition | null)[];
  activeAgentIdx: number;
  onAgentPlace: (pos: AgentPosition) => void;
  onAgentRemove?: (idx: number) => void;
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

  // Interaction state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const [hoverWorld, setHoverWorld] = useState<{ x: number; y: number } | null>(null);
  const [hoveredAgentIdx, setHoveredAgentIdx] = useState<number | null>(null);

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
    let minX = 0, minY = 0, maxX = 20000, maxY = 20000;
    if (shapes.length > 0) {
      minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
      for (const s of shapes) {
        for (const [px, py] of s.points) {
          if (px < minX) minX = px;
          if (py < minY) minY = py;
          if (px > maxX) maxX = px;
          if (py > maxY) maxY = py;
        }
      }
      // Add padding
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
  }, [shapes, canvasW, canvasH]);

  // Fit on first mount or when shapes change significantly
  useEffect(() => {
    fitToContent();
  }, [shapes.length, canvasW, canvasH]);

  // ---- Draw ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = camRef.current;

    // HiDPI
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

    // Vertical grid lines
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
      // Label
      ctx.textAlign = "left";
      ctx.fillText(`${(wx / 1000).toFixed(wx % 1000 === 0 ? 0 : 1)}m`, sx + 3, canvasH - 16);
    }
    // Horizontal grid lines
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
      const [zx1, zy1] = worldToScreen(b.x, b.y + b.height, c);
      const [zx2, zy2] = worldToScreen(b.x + b.width, b.y, c);
      const zw = zx2 - zx1;
      const zh = zy2 - zy1;

      // Zone fill
      ctx.fillStyle = "rgba(29, 158, 117, 0.04)";
      ctx.fillRect(zx1, zy1, zw, zh);

      // Zone border
      ctx.strokeStyle = "rgba(29, 158, 117, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(zx1, zy1, zw, zh);
      ctx.setLineDash([]);

      // Zone label
      const zlabel = zone.label || zone.id;
      ctx.font = "500 10px 'Inter', sans-serif";
      ctx.fillStyle = "rgba(29, 158, 117, 0.6)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(zlabel, zx1 + 4, zy1 + 4);

      // Zone env summary
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(29, 158, 117, 0.45)";
      const envTxt = `${zone.env.temperature}°C  ${zone.env.light}lx  ${zone.env.noise}dB`;
      ctx.fillText(envTxt, zx1 + 4, zy1 + 18);
      ctx.textBaseline = "alphabetic";
    });

    // Draw shapes
    shapes.forEach((shape) => {
      if (shape.points.length < 2) return;
      const style = SHAPE_STYLES[shape.type] || SHAPE_STYLES.room;

      ctx.beginPath();
      const [sx0, sy0] = worldToScreen(shape.points[0][0], shape.points[0][1], c);
      ctx.moveTo(sx0, sy0);
      for (let i = 1; i < shape.points.length; i++) {
        const [px, py] = worldToScreen(shape.points[i][0], shape.points[i][1], c);
        ctx.lineTo(px, py);
      }
      if (shape.type === "room") {
        ctx.closePath();
        ctx.fillStyle = style.fill;
        ctx.fill();
      }
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = shape.type === "room" ? 2 : 2.5;
      ctx.setLineDash(shape.type === "window" ? [6, 4] : shape.type === "door" ? [8, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);

      // Vertex dots
      shape.points.forEach(([wx, wy]) => {
        const [vx, vy] = worldToScreen(wx, wy, c);
        ctx.beginPath();
        ctx.arc(vx, vy, 3, 0, Math.PI * 2);
        ctx.fillStyle = style.stroke;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(vx, vy, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "#FAFAF6";
        ctx.fill();
      });

      // Shape label
      const label = shape.label || style.label;
      const cx = shape.points.reduce((s, p) => s + p[0], 0) / shape.points.length;
      const cy = shape.points.reduce((s, p) => s + p[1], 0) / shape.points.length;
      const [lx, ly] = worldToScreen(cx, cy, c);
      ctx.font = "500 11px 'Inter', sans-serif";
      const tw = ctx.measureText(label);
      ctx.fillStyle = "rgba(255,252,247,0.85)";
      const pad = 5;
      ctx.beginPath();
      const rx = lx - tw.width / 2 - pad;
      const ry = ly - 8;
      const rw = tw.width + pad * 2;
      const rh = 18;
      const rr = 4;
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
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = style.stroke;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lx, ly + 1);
      ctx.textBaseline = "alphabetic";
    });

    // Draw agents (inactive first, active last)
    const drawOrder = agentPositions
      .map((pos, i) => ({ pos, i }))
      .filter((a) => a.pos !== null)
      .sort((a, b) => (a.i === activeAgentIdx ? 1 : 0) - (b.i === activeAgentIdx ? 1 : 0));

    drawOrder.forEach(({ pos, i }) => {
      if (!pos) return;
      const [ax, ay] = worldToScreen(pos.x, pos.y, c);
      drawAgent(ctx, ax, ay, i, i === activeAgentIdx, c.zoom);
    });

    // Hover crosshair
    if (hoverWorld) {
      const [hx, hy] = worldToScreen(hoverWorld.x, hoverWorld.y, c);
      ctx.strokeStyle = `${PERSONA_COLORS[activeAgentIdx].primary}30`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, canvasH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(canvasW, hy); ctx.stroke();
      ctx.setLineDash([]);

      // Coordinate tooltip
      ctx.font = "11px 'JetBrains Mono', monospace";
      const txt = `(${Math.round(hoverWorld.x)}, ${Math.round(hoverWorld.y)})`;
      const tw2 = ctx.measureText(txt);
      const tx = Math.min(hx + 12, canvasW - tw2.width - 10);
      const ty = Math.max(hy - 12, 18);
      ctx.fillStyle = "rgba(45,42,38,0.8)";
      ctx.beginPath();
      ctx.roundRect(tx - 4, ty - 13, tw2.width + 8, 18, 4);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      ctx.fillText(txt, tx, ty);
    }
  }, [shapes, zones, agentPositions, activeAgentIdx, hoverWorld, canvasW, canvasH, cam]);

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
      // Middle click or Alt+Left = pan
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    } else if (e.button === 0) {
      // Left click = place agent (handled in mouseUp to distinguish from drag)
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
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

    const [wx, wy] = getMouseWorld(e);
    setHoverWorld({ x: Math.round(wx / 100) * 100, y: Math.round(wy / 100) * 100 });

    // Check hover over agents
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
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) {
      isPanning.current = false;
      return;
    }
    if (e.button === 0 && !e.altKey) {
      const [wx, wy] = getMouseWorld(e);
      const snappedX = Math.round(wx / 100) * 100;
      const snappedY = Math.round(wy / 100) * 100;
      onAgentPlace({ x: snappedX, y: snappedY });
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvasW / rect.width);
    const sy = (e.clientY - rect.top) * (canvasH / rect.height);

    const c = camRef.current;
    const [wxBefore, wyBefore] = screenToWorld(sx, sy, c);

    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    c.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, c.zoom * factor));

    // Keep mouse position fixed in world coords
    c.offsetX = wxBefore - sx / c.zoom;
    c.offsetY = wyBefore + sy / c.zoom;

    setCam({ ...c });
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (hoveredAgentIdx !== null && onAgentRemove) {
      onAgentRemove(hoveredAgentIdx);
      setHoveredAgentIdx(null);
    }
  };

  return (
    <div ref={containerRef} className="w-full">
      {/* Agent legend */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {agentPositions.map((pos, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all" style={{
            background: i === activeAgentIdx ? `${PERSONA_COLORS[i].primary}12` : "transparent",
            border: i === activeAgentIdx ? `1.5px solid ${PERSONA_COLORS[i].primary}40` : "1.5px solid transparent",
          }}>
            <div className="w-3 h-3 rounded-full" style={{
              background: PERSONA_COLORS[i].primary,
              opacity: pos ? 1 : 0.3,
              boxShadow: pos ? `0 0 6px ${PERSONA_COLORS[i].primary}40` : "none",
            }} />
            <span className="text-xs font-medium" style={{
              color: i === activeAgentIdx ? PERSONA_COLORS[i].primary : "#8A847A",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
            }}>
              P{i + 1} {pos ? `(${pos.x}, ${pos.y})` : "not placed"}
            </span>
            {pos && onAgentRemove && (
              <button
                onClick={() => onAgentRemove(i)}
                className="ml-0.5 w-5 h-5 flex items-center justify-center rounded-full text-xs transition-colors"
                style={{
                  background: `${PERSONA_COLORS[i].primary}15`,
                  color: PERSONA_COLORS[i].primary,
                }}
                title="Remove this agent"
              >
                x
              </button>
            )}
          </div>
        ))}
        <div className="flex-1" />
        <button
          onClick={fitToContent}
          className="sa-btn text-xs px-3 py-1"
          title="Fit view to content"
        >
          Fit View
        </button>
      </div>

      <canvas
        ref={canvasRef}
        style={{
          width: `${canvasW}px`,
          height: `${canvasH}px`,
          cursor: isPanning.current ? "grabbing" : hoveredAgentIdx !== null ? "pointer" : "crosshair",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          boxShadow: "4px 4px 12px rgba(0,0,0,0.06), -2px -2px 8px rgba(255,255,255,0.7)",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHoverWorld(null); setHoveredAgentIdx(null); isPanning.current = false; }}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        title="Left-click: place agent | Alt+drag or middle-drag: pan | Scroll: zoom | Right-click agent: remove"
      />

      {/* Controls hint */}
      <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "#8A847A" }}>
        <span>Click to place agent</span>
        <span>Alt+drag to pan</span>
        <span>Scroll to zoom</span>
        <span>Right-click agent to remove</span>
      </div>
    </div>
  );
}
