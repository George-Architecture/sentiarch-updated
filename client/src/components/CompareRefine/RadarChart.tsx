/**
 * SentiArch — Radar / Spider Chart
 *
 * Pure SVG radar chart for comparing design candidates across 5 axes:
 * Area Efficiency, Comfort Score, Adjacency Score, Light Score, Equity Score.
 *
 * Each candidate is rendered as a coloured polygon overlay.
 */
import { useMemo } from "react";
import type { DesignCandidate } from "../../types/comparison";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RadarChartProps {
  candidates: DesignCandidate[];
  /** Which candidate is currently selected / highlighted. */
  selectedId?: string;
  /** Size of the chart (width = height). */
  size?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AXES = [
  { key: "areaEfficiency" as const, label: "Area\nEfficiency" },
  { key: "comfortScore" as const, label: "Comfort\nScore" },
  { key: "adjacencyScore" as const, label: "Adjacency\nScore" },
  { key: "lightScore" as const, label: "Light\nScore" },
  { key: "equityScore" as const, label: "Equity\nScore" },
];

const CANDIDATE_COLORS = [
  "#2E6B8A",
  "#E67E22",
  "#27AE60",
  "#8E44AD",
  "#E74C3C",
  "#16A085",
  "#D35400",
  "#2980B9",
];

const GRID_LEVELS = [0.2, 0.4, 0.6, 0.8, 1.0];

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleRad: number,
): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function getAxisAngle(index: number, total: number): number {
  // Start from top (−π/2) and go clockwise
  return -Math.PI / 2 + (2 * Math.PI * index) / total;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RadarChart({ candidates, selectedId, size = 320 }: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.36; // Leave room for labels
  const labelR = size * 0.46;

  const axisCount = AXES.length;

  // Pre-compute axis endpoints
  const axisPoints = useMemo(
    () =>
      AXES.map((_, i) => {
        const angle = getAxisAngle(i, axisCount);
        return {
          end: polarToCartesian(cx, cy, maxR, angle),
          label: polarToCartesian(cx, cy, labelR, angle),
          angle,
        };
      }),
    [cx, cy, maxR, labelR, axisCount],
  );

  // Grid polygons
  const gridPolygons = useMemo(
    () =>
      GRID_LEVELS.map((level) => {
        const points = AXES.map((_, i) => {
          const angle = getAxisAngle(i, axisCount);
          const p = polarToCartesian(cx, cy, maxR * level, angle);
          return `${p.x},${p.y}`;
        }).join(" ");
        return { level, points };
      }),
    [cx, cy, maxR, axisCount],
  );

  // Candidate polygons
  const candidatePolygons = useMemo(
    () =>
      candidates.map((c, idx) => {
        const points = AXES.map((axis, i) => {
          const value = c.radarScores[axis.key];
          const angle = getAxisAngle(i, axisCount);
          const p = polarToCartesian(cx, cy, maxR * value, angle);
          return `${p.x},${p.y}`;
        }).join(" ");

        const color = CANDIDATE_COLORS[idx % CANDIDATE_COLORS.length];
        const isSelected = c.id === selectedId;

        return { id: c.id, label: c.label, points, color, isSelected };
      }),
    [candidates, selectedId, cx, cy, maxR, axisCount],
  );

  return (
    <div>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block", margin: "0 auto" }}
      >
        {/* Grid polygons */}
        {gridPolygons.map((g) => (
          <polygon
            key={g.level}
            points={g.points}
            fill="none"
            stroke="#ddd"
            strokeWidth={g.level === 1 ? 1.5 : 0.8}
          />
        ))}

        {/* Grid level labels */}
        {GRID_LEVELS.map((level) => (
          <text
            key={`label-${level}`}
            x={cx + 2}
            y={cy - maxR * level + 10}
            fontSize={8}
            fill="#bbb"
          >
            {(level * 100).toFixed(0)}
          </text>
        ))}

        {/* Axis lines */}
        {axisPoints.map((ap, i) => (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={ap.end.x}
            y2={ap.end.y}
            stroke="#ccc"
            strokeWidth={1}
          />
        ))}

        {/* Candidate polygons (non-selected first, selected on top) */}
        {candidatePolygons
          .filter((cp) => !cp.isSelected)
          .map((cp) => (
            <polygon
              key={cp.id}
              points={cp.points}
              fill={cp.color}
              fillOpacity={0.1}
              stroke={cp.color}
              strokeWidth={1.5}
              strokeOpacity={0.6}
            />
          ))}
        {candidatePolygons
          .filter((cp) => cp.isSelected)
          .map((cp) => (
            <polygon
              key={cp.id}
              points={cp.points}
              fill={cp.color}
              fillOpacity={0.25}
              stroke={cp.color}
              strokeWidth={2.5}
              strokeOpacity={1}
            />
          ))}

        {/* Candidate data points */}
        {candidatePolygons.map((cp) =>
          AXES.map((axis, i) => {
            const c = candidates.find((cc) => cc.id === cp.id);
            if (!c) return null;
            const value = c.radarScores[axis.key];
            const angle = getAxisAngle(i, axisCount);
            const p = polarToCartesian(cx, cy, maxR * value, angle);
            return (
              <circle
                key={`${cp.id}-${axis.key}`}
                cx={p.x}
                cy={p.y}
                r={cp.isSelected ? 4 : 2.5}
                fill={cp.color}
                stroke="#fff"
                strokeWidth={1}
              />
            );
          }),
        )}

        {/* Axis labels */}
        {axisPoints.map((ap, i) => {
          const lines = AXES[i].label.split("\n");
          return (
            <text
              key={`axislabel-${i}`}
              x={ap.label.x}
              y={ap.label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fontWeight={AXES[i].key === "equityScore" ? 700 : 500}
              fill={AXES[i].key === "equityScore" ? "#c0392b" : "#555"}
            >
              {lines.map((line, li) => (
                <tspan key={li} x={ap.label.x} dy={li === 0 ? 0 : 12}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 16px",
          justifyContent: "center",
          marginTop: 8,
          fontSize: 11,
        }}
      >
        {candidatePolygons.map((cp) => (
          <div
            key={cp.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontWeight: cp.isSelected ? 700 : 400,
              opacity: cp.isSelected ? 1 : 0.7,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: cp.color,
              }}
            />
            {cp.label}
          </div>
        ))}
      </div>
    </div>
  );
}
