// SpatialMap Component - Pure Grid System
// Multi-Agent 2D Canvas with pan + zoom
// Fixed X * Y grid cells, no background import
// ============================================================

import { useRef, useCallback, useEffect, useState } from "react";
import type { AgentPosition, Waypoint, HeatmapPoint, GridConfig } from "@/lib/store";
import { getPersonaColor } from "@/lib/store";
import { toast } from "sonner";

// ---- Types ----
type ToolMode = "select" | "waypoint";

interface Camera {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

const MIN_ZOOM = 0.005;
const MAX_ZOOM = 2;
const INITIAL_ZOOM = 0.03;

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
  gridConfig,
  agentPositions,
  activeAgentIdx,
  onAgentPlace,
  onAgentRemove,
  allWaypoints = {},
  onAddWaypoint,
  onRemoveWaypoint,
  onClearWaypoints,
  animatingAgents = {},
  pathTrails = {},
  heatmapPoints = [],
  showHeatmap = false,
}: {
  gridConfig: GridConfig;
  agentPositions: (AgentPosition | null)[];
  activeAgentIdx: number;
  onAgentPlace: (pos: AgentPosition) => void;
  onAgentRemove?: (agentIdx: number) => void;
  allWaypoints?: Record<number, Waypoint[]>;
  onAddWaypoint?: (agentIdx: number, wp: Waypoint) => void;
  onRemoveWaypoint?: (agentIdx: number, wpId: string) => void;
  onClearWaypoints?: (agentIdx: number) => void;
  animatingAgents?: Record<number, AgentPosition>;
  pathTrails?: Record<number, AgentPosition[]>;
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

  // Resize observer
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

  // Fit to content
  const fitToContent = useCallback(() => {
    const { cols, rows, cellSize } = gridConfig;
    const totalWidth = cols * cellSize;
    const totalHeight = rows * cellSize;
    
    const pad = cellSize * 2;
    const rangeX = totalWidth + pad * 2;
    const rangeY = totalHeight + pad * 2;
    
    const zoom = Math.min(canvasW / rangeX, canvasH / rangeY);
    const cx = totalWidth / 2;
    const cy = totalHeight / 2;
    
    const newCam: Camera = {
      offsetX: cx - canvasW / (2 * zoom),
      offsetY: cy + canvasH / (2 * zoom),
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)),
    };
    camRef.current = newCam;
    setCam({ ...newCam });
  }, [gridConfig, canvasW, canvasH]);

  // Initial fit
  useEffect(() => {
    fitToContent();
  }, []);

  // Snap to grid helper
  const snapToGrid = (v: number): number => {
    return Math.round(v / gridConfig.cellSize) * gridConfig.cellSize;
  };

  // Draw
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

    // Pure Grid System
    const { cols, rows, cellSize } = gridConfig;
    const totalWidth = cols * cellSize;
    const totalHeight = rows * cellSize;

    // Draw grid lines
    ctx.strokeStyle = "#E8E3DA";
    ctx.lineWidth = 0.5;
    
    for (let i = 0; i <= cols; i++) {
      const wx = i * cellSize;
      const [sx] = worldToScreen(wx, 0, c);
      const [, syStart] = worldToScreen(wx, 0, c);
      const [, syEnd] = worldToScreen(wx, totalHeight, c);
      ctx.beginPath();
      ctx.moveTo(sx, syStart);
      ctx.lineTo(sx, syEnd);
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const wy = j * cellSize;
      const [sxStart, sy] = worldToScreen(0, wy, c);
      const [sxEnd] = worldToScreen(totalWidth, wy, c);
      ctx.beginPath();
      ctx.moveTo(sxStart, sy);
      ctx.lineTo(sxEnd, sy);
      ctx.stroke();
    }

    // Boundary box
    const [bx1, by1] = worldToScreen(0, totalHeight, c);
    const [bx2, by2] = worldToScreen(totalWidth, 0, c);
    ctx.strokeStyle = "#1D6B5E";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);

    // Grid Labels
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#C0BAB0";
    for (let i = 0; i <= cols; i++) {
      const [sx] = worldToScreen(i * cellSize, 0, c);
      ctx.textAlign = "center";
      ctx.fillText(`${i}`, sx, by2 + 15);
    }
    for (let j = 0; j <= rows; j++) {
      const [, sy] = worldToScreen(0, j * cellSize, c);
      ctx.textAlign = "right";
      ctx.fillText(`${j}`, bx1 - 8, sy + 4);
    }

    // Draw path trails (history)
    for (const [idxStr, trail] of Object.entries(pathTrails)) {
      const idx = parseInt(idxStr);
      const color = getPersonaColor(idx);
      if (!trail || trail.length < 2) continue;

      ctx.beginPath();
      const [tx0, ty0] = worldToScreen(trail[0].x, trail[0].y, c);
      ctx.moveTo(tx0, ty0);
      for (let k = 1; k < trail.length; k++) {
        const [tx, ty] = worldToScreen(trail[k].x, trail[k].y, c);
        ctx.lineTo(tx, ty);
      }
      ctx.strokeStyle = color.primary;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw waypoints
    for (const [idxStr, wps] of Object.entries(allWaypoints)) {
      const idx = parseInt(idxStr);
      const color = getPersonaColor(idx);
      const isActive = idx === activeAgentIdx;

      wps.forEach((wp, wpIdx) => {
        const [wx, wy] = worldToScreen(wp.position.x, wp.position.y, c);
        
        // WP Circle
        ctx.beginPath();
        ctx.arc(wx, wy, 5, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? color.primary : `${color.primary}60`;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // WP Label
        ctx.font = `bold 10px 'JetBrains Mono', monospace`;
        ctx.fillStyle = isActive ? color.primary : "rgba(0,0,0,0.4)";
        ctx.textAlign = "center";
        ctx.fillText(`${wpIdx + 1}`, wx, wy - 8);
      });
    }

    // Draw agents (static positions)
    const drawOrder = agentPositions
      .map((pos, i) => ({ pos, i }))
      .filter((a) => a.pos !== null && !animatingAgents[a.i])
      .sort((a, b) => (a.i === activeAgentIdx ? 1 : 0) - (b.i === activeAgentIdx ? 1 : 0));

    drawOrder.forEach(({ pos, i }) => {
      if (!pos) return;
      const [ax, ay] = worldToScreen(pos.x, pos.y, c);
      drawAgent(ctx, ax, ay, i, i === activeAgentIdx, c.zoom);
    });

    // Draw animating agents
    for (const [idxStr, pos] of Object.entries(animatingAgents)) {
      const idx = parseInt(idxStr);
      const [ax, ay] = worldToScreen(pos.x, pos.y, c);
      drawAnimatedAgent(ctx, ax, ay, idx, c.zoom, animPulse);
    }

    // Draw heatmap overlay
    if (showHeatmap && heatmapPoints.length > 0) {
      for (const hp of heatmapPoints) {
        const [hx, hy] = worldToScreen(hp.x, hp.y, c);
        const radius = Math.max(50, 3500 * c.zoom);
        const intensity = Math.min(1, hp.value / 10);

        let r: number, g: number, b: number;
        if (intensity < 0.2) { r = 30; g = 200; b = 60; } 
        else if (intensity < 0.4) { const t = (intensity - 0.2) / 0.2; r = Math.round(30 + 210 * t); g = 200; b = Math.round(60 - 60 * t); } 
        else if (intensity < 0.65) { const t = (intensity - 0.4) / 0.25; r = 240; g = Math.round(200 - 100 * t); b = 0; } 
        else { const t = (intensity - 0.65) / 0.35; r = Math.round(240 - 40 * t); g = Math.round(100 - 80 * t); b = Math.round(20 * t); }

        const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.65)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(hx, hy, radius, 0, Math.PI * 2); ctx.fill();

        ctx.font = "bold 16px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillText(hp.value.toFixed(1), hx, hy);
        ctx.textBaseline = "alphabetic";
      }
    }

    // Hover crosshair
    if (hoverWorld) {
      const [hx, hy] = worldToScreen(hoverWorld.x, hoverWorld.y, c);
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, canvasH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(canvasW, hy); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [gridConfig, agentPositions, activeAgentIdx, hoverWorld, canvasW, canvasH, cam, allWaypoints, animatingAgents, pathTrails, animPulse, heatmapPoints, showHeatmap]);

  useEffect(() => { draw(); }, [draw]);

  // Mouse handlers
  const getMouseWorld = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvasW / rect.width);
    const sy = (e.clientY - rect.top) * (canvasH / rect.height);
    return screenToWorld(sx, sy, camRef.current);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanning.current = true;
      dragMoved.current = false;
      panStart.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
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

    const [wx, wy] = getMouseWorld(e);
    const finalX = snapToGrid(wx);
    const finalY = snapToGrid(wy);
    setHoverWorld({ x: finalX, y: finalY });

    // Check hover over agents
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvasW / rect.width);
    const sy = (e.clientY - rect.top) * (canvasH / rect.height);
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

    if (e.button !== 0 || e.altKey || dragMoved.current) return;

    const [wx, wy] = getMouseWorld(e);
    const snappedX = snapToGrid(wx);
    const snappedY = snapToGrid(wy);

    // Clamp to grid boundaries
    const { cols, rows, cellSize } = gridConfig;
    if (snappedX < 0 || snappedX > cols * cellSize || snappedY < 0 || snappedY > rows * cellSize) {
      toast.error("Click inside the grid boundary");
      return;
    }

    if (activeTool === "select") {
      onAgentPlace({ x: snappedX, y: snappedY });
    } else if (activeTool === "waypoint") {
      if (!agentPositions[activeAgentIdx]) {
        toast.error("Please place agent first before adding waypoints");
        return;
      }
      if (onAddWaypoint) {
        const wpNum = (allWaypoints[activeAgentIdx] || []).length + 1;
        const wp: Waypoint = {
          id: `wp_${activeAgentIdx}_${Date.now()}`,
          label: `WP${wpNum}`,
          position: { x: snappedX, y: snappedY },
          dwell_minutes: 5,
        };
        onAddWaypoint(activeAgentIdx, wp);
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (canvasW / rect.width);
      const sy = (e.clientY - rect.top) * (canvasH / rect.height);
      const c = camRef.current;
      const [wxBefore, wyBefore] = screenToWorld(sx, sy, c);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      c.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, c.zoom * factor));
      c.offsetX = wxBefore - sx / c.zoom;
      c.offsetY = wyBefore + sy / c.zoom;
      setCam({ ...c });
    };

    canvas.addEventListener("wheel", handleWheelNative, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheelNative);
  }, [canvasW, canvasH]);

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (hoveredAgentIdx !== null && onAgentRemove) {
      onAgentRemove(hoveredAgentIdx);
    }
  };

  const TOOLS_LIST = [
    { mode: "select" as ToolMode, label: "Place Agent", icon: "↖", hint: "Click grid to place active agent" },
    { mode: "waypoint" as ToolMode, label: "Waypoint", icon: "◉", hint: "Click grid to add waypoint for route" },
  ];

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden select-none bg-card border border-border rounded-xl">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 p-1.5 rounded-xl shadow-lg border border-border bg-white/90 backdrop-blur">
          {TOOLS_LIST.map((tool) => (
            <button
              key={tool.mode}
              onClick={() => setActiveTool(tool.mode)}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
              style={{
                background: activeTool === tool.mode ? "var(--primary)" : "transparent",
                color: activeTool === tool.mode ? "#fff" : "var(--foreground)",
              }}
              title={`${tool.label}: ${tool.hint}`}
            >
              <span className="text-lg">{tool.icon}</span>
            </button>
          ))}
          <div className="w-px h-6 mx-1 bg-border" />
          <button onClick={fitToContent} className="px-3 h-9 flex items-center justify-center rounded-lg hover:bg-black/5 text-xs font-semibold">
            Fit Grid
          </button>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10">
        <div className="px-3 py-1.5 rounded-lg bg-black/70 text-white text-[10px] font-mono shadow-lg backdrop-blur">
          ZOOM: {(cam.zoom * 100).toFixed(0)}%
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-10">
        <div className="px-4 py-2 rounded-xl shadow-lg border border-border bg-white/90 backdrop-blur max-w-xs">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
            {TOOLS_LIST.find(t => t.mode === activeTool)?.label} Tool
          </p>
          <p className="text-xs font-medium leading-relaxed">
            {TOOLS_LIST.find(t => t.mode === activeTool)?.hint}
          </p>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        className="block cursor-crosshair touch-none"
        style={{ width: canvasW, height: canvasH }}
      />
    </div>
  );
}
