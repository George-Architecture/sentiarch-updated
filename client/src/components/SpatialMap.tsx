// ============================================================
// SpatialMap Component - 2D Canvas for room/window/door shapes
// Design: Pixel Architecture Art
// ============================================================

import { useRef, useCallback, useEffect, useState } from "react";
import type { Shape, AgentPosition } from "@/lib/store";

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

export default function SpatialMap({
  shapes,
  agentPosition,
  onAgentPlace,
}: {
  shapes: Shape[];
  agentPosition: AgentPosition | null;
  onAgentPlace: (pos: AgentPosition) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

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

    // Agent position
    if (agentPosition) {
      const [ax, ay] = worldToCanvas(agentPosition.x, agentPosition.y);
      // Glow
      ctx.beginPath();
      ctx.arc(ax, ay, 12, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(184, 92, 56, 0.15)";
      ctx.fill();
      // Outer
      ctx.beginPath();
      ctx.arc(ax, ay, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#B85C38";
      ctx.fill();
      // Inner
      ctx.beginPath();
      ctx.arc(ax, ay, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#F2E8D5";
      ctx.fill();
      // Label
      ctx.font = "9px 'Silkscreen', monospace";
      ctx.fillStyle = "#B85C38";
      ctx.textAlign = "left";
      ctx.fillText("AGENT", ax + 12, ay + 3);
    }

    // Hover crosshair
    if (hoverPos) {
      ctx.strokeStyle = "rgba(184, 92, 56, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hoverPos.x, MARGIN); ctx.lineTo(hoverPos.x, CANVAS_SIZE - MARGIN); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(MARGIN, hoverPos.y); ctx.lineTo(CANVAS_SIZE - MARGIN, hoverPos.y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [shapes, agentPosition, hoverPos]);

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
  };

  return (
    <div ref={containerRef}>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverPos(null)}
        style={{
          width: `${CANVAS_SIZE * scale}px`,
          height: `${CANVAS_SIZE * scale}px`,
          cursor: "crosshair",
          border: "3px solid #B85C38",
          boxShadow: "3px 3px 0px #6B4C3B",
        }}
      />
    </div>
  );
}
