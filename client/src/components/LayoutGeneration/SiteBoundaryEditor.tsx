// ============================================================
// SiteBoundaryEditor — Canvas-based polygon drawing tool
//
// The architect clicks to place vertices, double-clicks to
// close the polygon.  After closing, vertices can be dragged
// to adjust.  Area is computed and displayed in real-time.
// ============================================================

import { useRef, useState, useCallback, useEffect } from "react";
import type { Point2D, Polygon2D } from "@/types/layout";
import { polygonArea } from "@/engines/layout";

interface SiteBoundaryEditorProps {
  /** Initial polygon (if editing an existing boundary). */
  initialPolygon?: Polygon2D | null;
  /** Called when the polygon changes (closed or vertex moved). */
  onChange: (polygon: Polygon2D, areaM2: number) => void;
  /** Canvas width in pixels. */
  width?: number;
  /** Canvas height in pixels. */
  height?: number;
  /** Metres per pixel scale factor. */
  scale?: number;
}

/** Default site: ~40m × 60m at 8px/m = 320×480 canvas */
const DEFAULT_SCALE = 8; // px per metre

export default function SiteBoundaryEditor({
  initialPolygon,
  onChange,
  width = 640,
  height = 480,
  scale = DEFAULT_SCALE,
}: SiteBoundaryEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [vertices, setVertices] = useState<Point2D[]>(
    initialPolygon?.vertices ?? []
  );
  const [isClosed, setIsClosed] = useState(!!initialPolygon);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<Point2D | null>(null);

  // Convert canvas px to metres
  const pxToM = useCallback(
    (px: number, py: number): Point2D => ({
      x: px / scale,
      y: py / scale,
    }),
    [scale]
  );

  // Convert metres to canvas px
  const mToPx = useCallback(
    (p: Point2D): { px: number; py: number } => ({
      px: p.x * scale,
      py: p.y * scale,
    }),
    [scale]
  );

  // Area in m²
  const area =
    vertices.length >= 3 ? polygonArea({ vertices }) : 0;

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 0.5;
    const gridStep = 5 * scale; // 5m grid
    for (let x = 0; x < width; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Scale label
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.font = "10px monospace";
    ctx.fillText("5m grid", 4, height - 4);

    // Draw polygon
    if (vertices.length > 0) {
      ctx.beginPath();
      const first = mToPx(vertices[0]);
      ctx.moveTo(first.px, first.py);
      for (let i = 1; i < vertices.length; i++) {
        const p = mToPx(vertices[i]);
        ctx.lineTo(p.px, p.py);
      }

      if (isClosed) {
        ctx.closePath();
        ctx.fillStyle = "rgba(29, 107, 94, 0.1)";
        ctx.fill();
        ctx.strokeStyle = "var(--primary, #1D6B5E)";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // Draw to mouse position
        if (mousePos) {
          const mp = mToPx(mousePos);
          ctx.lineTo(mp.px, mp.py);
        }
        ctx.strokeStyle = "rgba(29, 107, 94, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw vertices
      for (let i = 0; i < vertices.length; i++) {
        const p = mToPx(vertices[i]);
        const isHover = hoverIdx === i;
        const isDrag = draggingIdx === i;
        ctx.beginPath();
        ctx.arc(p.px, p.py, isDrag ? 7 : isHover ? 6 : 5, 0, Math.PI * 2);
        ctx.fillStyle =
          isDrag || isHover
            ? "var(--primary, #1D6B5E)"
            : "#fff";
        ctx.fill();
        ctx.strokeStyle = "var(--primary, #1D6B5E)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Vertex label
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.font = "9px monospace";
        ctx.fillText(
          `(${vertices[i].x.toFixed(1)}, ${vertices[i].y.toFixed(1)})`,
          p.px + 8,
          p.py - 8
        );
      }

      // Edge lengths
      if (vertices.length >= 2) {
        ctx.fillStyle = "rgba(29, 107, 94, 0.7)";
        ctx.font = "10px sans-serif";
        const verts = isClosed
          ? [...vertices, vertices[0]]
          : vertices;
        for (let i = 0; i < verts.length - 1; i++) {
          const a = verts[i];
          const b = verts[i + 1];
          const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
          const mid = mToPx({
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
          });
          ctx.fillText(`${len.toFixed(1)}m`, mid.px + 4, mid.py - 4);
        }
      }
    }

    // Instructions
    if (!isClosed && vertices.length === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.font = "13px sans-serif";
      ctx.fillText("Click to place vertices. Double-click to close.", 10, 24);
    } else if (!isClosed) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.font = "11px sans-serif";
      ctx.fillText(
        `${vertices.length} vertices — double-click to close`,
        10,
        24
      );
    }
  }, [vertices, isClosed, mousePos, hoverIdx, draggingIdx, width, height, scale, mToPx]);

  // Find vertex near a point
  const findVertex = useCallback(
    (mx: number, my: number): number | null => {
      const threshold = 10 / scale; // 10px in metres
      for (let i = 0; i < vertices.length; i++) {
        const dx = vertices[i].x - mx / scale;
        const dy = vertices[i].y - my / scale;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) return i;
      }
      return null;
    },
    [vertices, scale]
  );

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (isClosed) {
        // Try to start dragging a vertex
        const idx = findVertex(mx, my);
        if (idx !== null) {
          setDraggingIdx(idx);
        }
      }
    },
    [isClosed, findVertex]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const mPt = pxToM(mx, my);

      setMousePos(mPt);

      if (draggingIdx !== null) {
        const newVerts = [...vertices];
        newVerts[draggingIdx] = mPt;
        setVertices(newVerts);
        const poly = { vertices: newVerts };
        onChange(poly, polygonArea(poly));
      } else if (isClosed) {
        setHoverIdx(findVertex(mx, my));
      }
    },
    [draggingIdx, vertices, isClosed, pxToM, findVertex, onChange]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingIdx(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isClosed) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const pt = pxToM(mx, my);

      const newVerts = [...vertices, pt];
      setVertices(newVerts);
    },
    [isClosed, vertices, pxToM]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (isClosed || vertices.length < 3) return;

      // Remove the last vertex (added by the single click)
      const finalVerts = vertices.slice(0, -1);
      if (finalVerts.length < 3) return;

      setVertices(finalVerts);
      setIsClosed(true);
      const poly = { vertices: finalVerts };
      onChange(poly, polygonArea(poly));
    },
    [isClosed, vertices, onChange]
  );

  const handleReset = useCallback(() => {
    setVertices([]);
    setIsClosed(false);
    setDraggingIdx(null);
    setHoverIdx(null);
  }, []);

  // Preset: simple rectangle
  const handlePresetRect = useCallback(() => {
    const w = 50; // 50m
    const h = 35; // 35m
    const margin = 5;
    const verts: Point2D[] = [
      { x: margin, y: margin },
      { x: margin + w, y: margin },
      { x: margin + w, y: margin + h },
      { x: margin, y: margin + h },
    ];
    setVertices(verts);
    setIsClosed(true);
    const poly = { vertices: verts };
    onChange(poly, polygonArea(poly));
  }, [onChange]);

  // Preset: L-shape
  const handlePresetL = useCallback(() => {
    const verts: Point2D[] = [
      { x: 5, y: 5 },
      { x: 55, y: 5 },
      { x: 55, y: 25 },
      { x: 35, y: 25 },
      { x: 35, y: 40 },
      { x: 5, y: 40 },
    ];
    setVertices(verts);
    setIsClosed(true);
    const poly = { vertices: verts };
    onChange(poly, polygonArea(poly));
  }, [onChange]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          Site Boundary
        </span>
        {isClosed && (
          <span
            className="sa-tag"
            style={{
              background: "rgba(29, 107, 94, 0.1)",
              color: "var(--primary)",
              fontSize: 10,
            }}
          >
            {area.toFixed(0)} m²
          </span>
        )}
        <div className="flex-1" />
        <button
          className="sa-btn"
          onClick={handlePresetRect}
          style={{ padding: "2px 8px", fontSize: 10 }}
        >
          Preset: Rectangle
        </button>
        <button
          className="sa-btn"
          onClick={handlePresetL}
          style={{ padding: "2px 8px", fontSize: 10 }}
        >
          Preset: L-Shape
        </button>
        {isClosed && (
          <button
            className="sa-btn"
            onClick={handleReset}
            style={{
              padding: "2px 8px",
              fontSize: 10,
              color: "#E74C3C",
            }}
          >
            Reset
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          border: "1px solid var(--border, #e5e5e5)",
          borderRadius: 6,
          cursor: isClosed
            ? hoverIdx !== null
              ? "grab"
              : "default"
            : "crosshair",
          background: "#fff",
          maxWidth: "100%",
        }}
      />
    </div>
  );
}
