// ============================================================
// SpatialMap Component - Multi-Agent 2D Canvas
// Supports 3 agents with distinct pixel avatars and colors
// ============================================================

import { useRef, useCallback, useEffect, useState } from "react";
import type { Shape, AgentPosition } from "@/lib/store";
import { PERSONA_COLORS } from "@/lib/store";

const CANVAS_SIZE = 620;
const WORLD_SIZE = 20000;
const GRID_STEP = 2000;
const MARGIN = 50;
const DRAW_SIZE = CANVAS_SIZE - MARGIN * 2;

function worldToCanvas(wx: number, wy: number): [number, number] {
  return [
    MARGIN + (wx / WORLD_SIZE) * DRAW_SIZE,
    MARGIN + ((WORLD_SIZE - wy) / WORLD_SIZE) * DRAW_SIZE,
  ];
}

function canvasToWorld(cx: number, cy: number): [number, number] {
  const wx = ((cx - MARGIN) / DRAW_SIZE) * WORLD_SIZE;
  const wy = WORLD_SIZE - ((cy - MARGIN) / DRAW_SIZE) * WORLD_SIZE;
  return [Math.round(wx / 100) * 100, Math.round(wy / 100) * 100];
}

const SHAPE_STYLES: Record<string, { fill: string; stroke: string; label: string }> = {
  room: { fill: "rgba(109, 142, 90, 0.12)", stroke: "#3D6B4F", label: "ROOM" },
  window: { fill: "rgba(74, 144, 184, 0.15)", stroke: "#4A90B8", label: "WIN" },
  door: { fill: "rgba(198, 123, 75, 0.15)", stroke: "#C67B4B", label: "DOOR" },
};

// Draw a pixel avatar on canvas
function drawPixelAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  index: number,
  isActive: boolean,
  scale: number = 1
) {
  const color = PERSONA_COLORS[index];
  const s = 2 * scale; // pixel size

  // Glow for active agent
  if (isActive) {
    ctx.beginPath();
    ctx.arc(cx, cy, 16 * scale, 0, Math.PI * 2);
    ctx.fillStyle = `${color.bg}`;
    ctx.fill();
    ctx.strokeStyle = color.primary;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Body
  ctx.fillStyle = color.primary;
  ctx.fillRect(cx - 3 * s, cy - 1 * s, 6 * s, 5 * s);

  // Head
  ctx.fillStyle = color.secondary;
  ctx.fillRect(cx - 3 * s, cy - 6 * s, 6 * s, 5 * s);

  // Eyes
  ctx.fillStyle = "#F2E8D5";
  ctx.fillRect(cx - 2 * s, cy - 4 * s, 2 * s, s);
  ctx.fillRect(cx + 1 * s, cy - 4 * s, 2 * s, s);

  // Distinct features
  if (index === 0) {
    // Hat
    ctx.fillStyle = color.primary;
    ctx.fillRect(cx - 4 * s, cy - 8 * s, 8 * s, 2 * s);
    ctx.fillRect(cx - 5 * s, cy - 7 * s, 10 * s, s);
  } else if (index === 1) {
    // Glasses
    ctx.strokeStyle = "#F2E8D5";
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 3 * s, cy - 5 * s, 3 * s, 3 * s);
    ctx.strokeRect(cx + 1 * s, cy - 5 * s, 3 * s, 3 * s);
    ctx.fillStyle = "#F2E8D5";
    ctx.fillRect(cx, cy - 4 * s, s, s);
  } else if (index === 2) {
    // Backpack
    ctx.fillStyle = color.primary;
    ctx.fillRect(cx + 3 * s, cy - 2 * s, 3 * s, 5 * s);
    ctx.fillStyle = color.secondary;
    ctx.fillRect(cx + 4 * s, cy - 1 * s, s, 2 * s);
  }

  // Legs
  ctx.fillStyle = color.primary;
  ctx.fillRect(cx - 3 * s, cy + 4 * s, 2 * s, 2 * s);
  ctx.fillRect(cx + 1 * s, cy + 4 * s, 2 * s, 2 * s);

  // Label
  ctx.font = "bold 9px 'Silkscreen', monospace";
  ctx.fillStyle = color.primary;
  ctx.textAlign = "center";
  ctx.fillText(`P${index + 1}`, cx, cy + 10 * s);
}

export default function SpatialMap({
  shapes,
  agentPositions,
  activeAgentIdx,
  onAgentPlace,
  onAgentRemove,
}: {
  shapes: Shape[];
  agentPositions: (AgentPosition | null)[];
  activeAgentIdx: number;
  onAgentPlace: (pos: AgentPosition) => void;
  onAgentRemove?: (idx: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredAgentIdx, setHoveredAgentIdx] = useState<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear & background
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = "#F5ECD8";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Texture dots
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `rgba(160, 132, 92, ${Math.random() * 0.03})`;
      ctx.fillRect(Math.random() * CANVAS_SIZE, Math.random() * CANVAS_SIZE, 1, 1);
    }

    // Grid border
    ctx.strokeStyle = "#D4C4A8";
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN, MARGIN, DRAW_SIZE, DRAW_SIZE);

    // Grid lines
    ctx.strokeStyle = "#E0D5C0";
    ctx.lineWidth = 0.5;
    for (let g = 0; g <= WORLD_SIZE; g += GRID_STEP) {
      const [gx] = worldToCanvas(g, 0);
      const [, gyTop] = worldToCanvas(0, WORLD_SIZE);
      const [, gyBot] = worldToCanvas(0, 0);
      ctx.beginPath(); ctx.moveTo(gx, gyTop); ctx.lineTo(gx, gyBot); ctx.stroke();
      const [, gy] = worldToCanvas(0, g);
      const [gxL] = worldToCanvas(0, 0);
      const [gxR] = worldToCanvas(WORLD_SIZE, 0);
      ctx.beginPath(); ctx.moveTo(gxL, gy); ctx.lineTo(gxR, gy); ctx.stroke();
    }

    // Axis labels
    ctx.font = "11px 'VT323', monospace";
    ctx.fillStyle = "#B8A890";
    ctx.textAlign = "center";
    for (let g = 0; g <= WORLD_SIZE; g += GRID_STEP * 2) {
      const [gx] = worldToCanvas(g, 0);
      const [, gyBot] = worldToCanvas(0, 0);
      ctx.fillText(`${(g / 1000).toFixed(0)}k`, gx, gyBot + 16);
    }
    ctx.textAlign = "right";
    for (let g = 0; g <= WORLD_SIZE; g += GRID_STEP * 2) {
      const [, gy] = worldToCanvas(0, g);
      ctx.fillText(`${(g / 1000).toFixed(0)}k`, MARGIN - 6, gy + 4);
    }

    // Axis titles
    ctx.font = "9px 'Silkscreen', monospace";
    ctx.fillStyle = "#A89B8C";
    ctx.textAlign = "center";
    ctx.fillText("X (mm)", CANVAS_SIZE / 2, CANVAS_SIZE - 8);
    ctx.save();
    ctx.translate(12, CANVAS_SIZE / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Y (mm)", 0, 0);
    ctx.restore();

    // Draw shapes
    shapes.forEach((shape) => {
      if (shape.points.length < 2) return;
      const style = SHAPE_STYLES[shape.type] || SHAPE_STYLES.room;

      ctx.beginPath();
      const [sx, sy] = worldToCanvas(shape.points[0][0], shape.points[0][1]);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < shape.points.length; i++) {
        const [px, py] = worldToCanvas(shape.points[i][0], shape.points[i][1]);
        ctx.lineTo(px, py);
      }
      if (shape.type === "room") {
        ctx.closePath();
        ctx.fillStyle = style.fill;
        ctx.fill();
      }
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 2;
      ctx.setLineDash(shape.type === "window" ? [4, 3] : shape.type === "door" ? [6, 2] : []);
      ctx.stroke();
      ctx.setLineDash([]);

      // Vertex dots
      shape.points.forEach(([wx, wy], idx) => {
        const [vx, vy] = worldToCanvas(wx, wy);
        ctx.fillStyle = style.stroke;
        ctx.fillRect(vx - 4, vy - 4, 8, 8);
        ctx.fillStyle = "#F5ECD8";
        ctx.fillRect(vx - 2, vy - 2, 4, 4);
        ctx.font = "9px 'VT323', monospace";
        ctx.fillStyle = style.stroke;
        ctx.textAlign = "left";
        ctx.fillText(`${idx}`, vx + 6, vy - 4);
      });

      // Shape label
      const label = shape.label || style.label;
      const cx = shape.points.reduce((s, p) => s + p[0], 0) / shape.points.length;
      const cy = shape.points.reduce((s, p) => s + p[1], 0) / shape.points.length;
      const [lx, ly] = worldToCanvas(cx, cy);
      ctx.font = "11px 'Silkscreen', monospace";
      const tw = ctx.measureText(label);
      ctx.fillStyle = "#F5ECD8";
      ctx.fillRect(lx - tw.width / 2 - 3, ly - 7, tw.width + 6, 14);
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(lx - tw.width / 2 - 3, ly - 7, tw.width + 6, 14);
      ctx.fillStyle = style.stroke;
      ctx.textAlign = "center";
      ctx.fillText(label, lx, ly + 4);
    });

    // Draw all agents (inactive first, active last so it's on top)
    const drawOrder = agentPositions
      .map((pos, i) => ({ pos, i }))
      .filter((a) => a.pos !== null)
      .sort((a, b) => (a.i === activeAgentIdx ? 1 : 0) - (b.i === activeAgentIdx ? 1 : 0));

    drawOrder.forEach(({ pos, i }) => {
      if (!pos) return;
      const [ax, ay] = worldToCanvas(pos.x, pos.y);
      drawPixelAvatar(ctx, ax, ay, i, i === activeAgentIdx);
    });

    // Hover crosshair
    if (hoverPos) {
      ctx.strokeStyle = `${PERSONA_COLORS[activeAgentIdx].primary}60`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hoverPos.x, MARGIN); ctx.lineTo(hoverPos.x, CANVAS_SIZE - MARGIN); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(MARGIN, hoverPos.y); ctx.lineTo(CANVAS_SIZE - MARGIN, hoverPos.y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [shapes, agentPositions, activeAgentIdx, hoverPos]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const resize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        setScale(Math.min(1, w / CANVAS_SIZE));
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const [wx, wy] = canvasToWorld(cx, cy);
    if (wx >= 0 && wx <= WORLD_SIZE && wy >= 0 && wy <= WORLD_SIZE) {
      onAgentPlace({ x: wx, y: wy });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    setHoverPos({ x: cx, y: cy });

    // Check if hovering over any agent
    let hoveredIdx: number | null = null;
    for (let i = 0; i < agentPositions.length; i++) {
      const pos = agentPositions[i];
      if (!pos) continue;
      const [ax, ay] = worldToCanvas(pos.x, pos.y);
      const dist = Math.sqrt((cx - ax) ** 2 + (cy - ay) ** 2);
      if (dist < 16) {
        hoveredIdx = i;
        break;
      }
    }
    setHoveredAgentIdx(hoveredIdx);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (hoveredAgentIdx !== null && onAgentRemove) {
      onAgentRemove(hoveredAgentIdx);
      setHoveredAgentIdx(null);
    }
  };

  return (
    <div ref={containerRef}>
      {/* Agent legend with Remove buttons */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {agentPositions.map((pos, i) => (
          <div key={i} className="flex items-center gap-1.5 px-2 py-1" style={{
            background: i === activeAgentIdx ? PERSONA_COLORS[i].bg : "transparent",
            border: i === activeAgentIdx ? `1px solid ${PERSONA_COLORS[i].primary}` : "none",
          }}>
            <div className="w-3 h-3" style={{
              background: PERSONA_COLORS[i].primary,
              border: i === activeAgentIdx ? "2px solid #6B4C3B" : "1px solid #D4C4A8",
              opacity: pos ? 1 : 0.3,
            }} />
            <span className="font-pixel text-[8px]" style={{
              color: i === activeAgentIdx ? PERSONA_COLORS[i].primary : "#A89B8C",
            }}>
              P{i + 1} {pos ? `(${pos.x}, ${pos.y})` : "not placed"}
            </span>
            {pos && onAgentRemove && (
              <button
                onClick={() => onAgentRemove(i)}
                className="ml-1 px-1.5 py-0 text-[10px]"
                style={{
                  background: "#EDE3D0",
                  color: PERSONA_COLORS[i].primary,
                  border: `1px solid ${PERSONA_COLORS[i].primary}`,
                  cursor: "pointer",
                  fontFamily: "var(--font-pixel)",
                }}
                title="Remove this agent"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoverPos(null); setHoveredAgentIdx(null); }}
        onContextMenu={handleContextMenu}
        title="Left-click to place agent | Right-click on agent to remove"
        style={{
          width: `${CANVAS_SIZE * scale}px`,
          height: `${CANVAS_SIZE * scale}px`,
          cursor: hoveredAgentIdx !== null ? "pointer" : "crosshair",
          border: `3px solid ${PERSONA_COLORS[activeAgentIdx].primary}`,
          boxShadow: "3px 3px 0px #6B4C3B",
        }}
      />
    </div>
  );
}
