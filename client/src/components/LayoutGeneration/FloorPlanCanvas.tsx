// ============================================================
// FloorPlanCanvas — 2D canvas rendering of a floor layout
//
// Renders rooms (coloured by category), walls, doors, corridors,
// space labels, and a scale bar.
// ============================================================

import { useRef, useEffect, useCallback } from "react";
import type { FloorLayoutCandidate } from "@/types/layout";
import { boundingBox } from "@/engines/layout";

/** Category → colour mapping (same as Step 1/2). */
const CATEGORY_COLORS: Record<string, string> = {
  academic: "#4A90D9",
  art: "#9B59B6",
  science: "#27AE60",
  public: "#E67E22",
  sport: "#E74C3C",
  support: "#95A5A6",
  residential: "#F39C12",
  admin: "#3498DB",
};

interface FloorPlanCanvasProps {
  candidate: FloorLayoutCandidate;
  /** Canvas width in pixels. */
  width?: number;
  /** Canvas height in pixels. */
  height?: number;
  /** Whether this is a thumbnail (simplified rendering). */
  thumbnail?: boolean;
  /** Click handler for room selection. */
  onRoomClick?: (spaceId: string) => void;
}

export default function FloorPlanCanvas({
  candidate,
  width = 640,
  height = 480,
  thumbnail = false,
  onRoomClick,
}: FloorPlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compute scale to fit all rooms + boundary
  const allVertices = [
    ...candidate.boundary.vertices,
    ...candidate.rooms.flatMap((r) => r.polygon.vertices),
    ...candidate.corridors.flatMap((c) => c.polygon.vertices),
  ];

  const bb = boundingBox(allVertices);
  const padding = thumbnail ? 10 : 30;
  const scaleX = (width - padding * 2) / Math.max(bb.width, 1);
  const scaleY = (height - padding * 2) / Math.max(bb.height, 1);
  const scale = Math.min(scaleX, scaleY);

  const toCanvasX = useCallback(
    (x: number) => (x - bb.minX) * scale + padding,
    [bb.minX, scale, padding]
  );
  const toCanvasY = useCallback(
    (y: number) => (y - bb.minY) * scale + padding,
    [bb.minY, scale, padding]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = "#FAFAFA";
    ctx.fillRect(0, 0, width, height);

    // Draw boundary
    ctx.beginPath();
    const bv = candidate.boundary.vertices;
    ctx.moveTo(toCanvasX(bv[0].x), toCanvasY(bv[0].y));
    for (let i = 1; i < bv.length; i++) {
      ctx.lineTo(toCanvasX(bv[i].x), toCanvasY(bv[i].y));
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw corridors
    for (const corridor of candidate.corridors) {
      ctx.beginPath();
      const cv = corridor.polygon.vertices;
      ctx.moveTo(toCanvasX(cv[0].x), toCanvasY(cv[0].y));
      for (let i = 1; i < cv.length; i++) {
        ctx.lineTo(toCanvasX(cv[i].x), toCanvasY(cv[i].y));
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(220, 220, 220, 0.8)";
      ctx.fill();
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      if (!thumbnail) {
        // Corridor label
        const cbb = boundingBox(cv);
        const cx = toCanvasX(cbb.minX + cbb.width / 2);
        const cy = toCanvasY(cbb.minY + cbb.height / 2);
        ctx.fillStyle = "#999";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Corridor", cx, cy + 3);
      }
    }

    // Draw rooms
    for (const room of candidate.rooms) {
      const rv = room.polygon.vertices;
      const color = room.colorHex ?? CATEGORY_COLORS[room.category] ?? "#95A5A6";

      ctx.beginPath();
      ctx.moveTo(toCanvasX(rv[0].x), toCanvasY(rv[0].y));
      for (let i = 1; i < rv.length; i++) {
        ctx.lineTo(toCanvasX(rv[i].x), toCanvasY(rv[i].y));
      }
      ctx.closePath();

      // Fill with category colour
      ctx.fillStyle = color + "30";
      ctx.fill();

      // Wall stroke
      ctx.strokeStyle = color;
      ctx.lineWidth = thumbnail ? 1 : 1.5;
      ctx.stroke();

      // Exterior wall highlight
      if (room.touchesExterior) {
        ctx.strokeStyle = color + "80";
        ctx.lineWidth = thumbnail ? 1.5 : 2.5;
        ctx.stroke();
      }

      // Room label
      if (!thumbnail) {
        const rbb = boundingBox(rv);
        const cx = toCanvasX(rbb.minX + rbb.width / 2);
        const cy = toCanvasY(rbb.minY + rbb.height / 2);
        const roomW = rbb.width * scale;
        const roomH = rbb.height * scale;

        // Only show label if room is large enough
        if (roomW > 30 && roomH > 20) {
          ctx.fillStyle = "#333";
          ctx.font = `${Math.min(11, Math.max(8, roomW / 8))}px sans-serif`;
          ctx.textAlign = "center";

          // Truncate name if needed
          const maxChars = Math.floor(roomW / 6);
          const displayName =
            room.name.length > maxChars
              ? room.name.slice(0, maxChars - 1) + "…"
              : room.name;
          ctx.fillText(displayName, cx, cy - 2);

          // Area
          ctx.fillStyle = "#666";
          ctx.font = `${Math.min(9, Math.max(7, roomW / 10))}px sans-serif`;
          ctx.fillText(`${Math.round(room.areaM2)}m²`, cx, cy + 10);
        }
      }
    }

    // Draw doors
    if (!thumbnail) {
      for (const door of candidate.doors) {
        const dx = toCanvasX(door.position.x);
        const dy = toCanvasY(door.position.y);
        const doorW = door.widthM * scale;

        ctx.beginPath();
        ctx.arc(dx, dy, Math.max(2, doorW / 2), 0, Math.PI * 2);
        ctx.fillStyle = "#E67E22";
        ctx.fill();
        ctx.strokeStyle = "#D35400";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Scale bar
    if (!thumbnail) {
      const barLenM = 10; // 10m scale bar
      const barLenPx = barLenM * scale;
      const barX = width - padding - barLenPx;
      const barY = height - 15;

      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(barX, barY);
      ctx.lineTo(barX + barLenPx, barY);
      ctx.stroke();

      // End ticks
      ctx.beginPath();
      ctx.moveTo(barX, barY - 4);
      ctx.lineTo(barX, barY + 4);
      ctx.moveTo(barX + barLenPx, barY - 4);
      ctx.lineTo(barX + barLenPx, barY + 4);
      ctx.stroke();

      ctx.fillStyle = "#333";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${barLenM}m`, barX + barLenPx / 2, barY - 6);
    }

    // Floor label
    const floorLabel =
      candidate.floorIndex === 0
        ? "G/F"
        : `${candidate.floorIndex}/F`;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.font = thumbnail ? "10px sans-serif" : "12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(floorLabel, 4, thumbnail ? 12 : 16);
  }, [candidate, width, height, thumbnail, toCanvasX, toCanvasY, scale, padding]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onRoomClick) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Find which room was clicked
      for (const room of candidate.rooms) {
        const rv = room.polygon.vertices;
        const rbb = boundingBox(rv);
        const x1 = toCanvasX(rbb.minX);
        const y1 = toCanvasY(rbb.minY);
        const x2 = toCanvasX(rbb.minX + rbb.width);
        const y2 = toCanvasY(rbb.minY + rbb.height);
        if (mx >= x1 && mx <= x2 && my >= y1 && my <= y2) {
          onRoomClick(room.spaceId);
          return;
        }
      }
    },
    [candidate, onRoomClick, toCanvasX, toCanvasY]
  );

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleClick}
      style={{
        borderRadius: 6,
        border: "1px solid var(--border, #e5e5e5)",
        cursor: onRoomClick ? "pointer" : "default",
        maxWidth: "100%",
      }}
    />
  );
}
