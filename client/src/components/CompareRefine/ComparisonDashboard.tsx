/**
 * SentiArch — Comparison Dashboard
 *
 * Side-by-side comparison of design candidates with:
 * - Ranking table (sortable by composite score)
 * - Adjustable metric weights
 * - Equity Score prominence (thesis key element)
 * - Cohort comfort equity bar
 */
import { useState, useMemo, useCallback } from "react";
import RadarChart from "./RadarChart";
import type {
  DesignCandidate,
  MetricWeights,
  CohortComfort,
} from "../../types/comparison";
import { computeCompositeScore, DEFAULT_WEIGHTS } from "../../types/comparison";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ComparisonDashboardProps {
  candidates: DesignCandidate[];
  weights: MetricWeights;
  onWeightsChange: (w: MetricWeights) => void;
  selectedId?: string;
  onSelect: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Weight Slider
// ---------------------------------------------------------------------------

function WeightSlider({
  label,
  value,
  onChange,
  highlight,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  highlight?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span
        style={{
          width: 100,
          fontWeight: highlight ? 700 : 400,
          color: highlight ? "#c0392b" : "inherit",
        }}
      >
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{ flex: 1, accentColor: highlight ? "#c0392b" : "var(--sa-primary, #2E6B8A)" }}
      />
      <span style={{ width: 36, textAlign: "right", fontFamily: "monospace" }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Equity Bar — horizontal bar showing each cohort's comfort level
// ---------------------------------------------------------------------------

function EquityBar({ cohorts }: { cohorts: CohortComfort[] }) {
  if (cohorts.length === 0) return null;

  const sorted = [...cohorts].sort((a, b) => b.avgComfortScore - a.avgComfortScore);
  const maxScore = Math.max(...sorted.map((c) => c.avgComfortScore));

  return (
    <div style={{ fontSize: 11 }}>
      {sorted.map((c) => (
        <div
          key={c.cohortId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: c.colorHex,
              flexShrink: 0,
            }}
          />
          <span style={{ width: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.cohortLabel}
          </span>
          <div
            style={{
              flex: 1,
              height: 14,
              background: "#f0f0f0",
              borderRadius: 3,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(c.avgComfortScore / Math.max(maxScore, 0.01)) * 100}%`,
                background:
                  c.avgComfortScore >= 0.85
                    ? "#27ae60"
                    : c.avgComfortScore >= 0.7
                      ? "#f39c12"
                      : "#e74c3c",
                borderRadius: 3,
                transition: "width 0.3s",
              }}
            />
          </div>
          <span style={{ width: 40, textAlign: "right", fontFamily: "monospace" }}>
            {(c.avgComfortScore * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ComparisonDashboard({
  candidates,
  weights,
  onWeightsChange,
  selectedId,
  onSelect,
}: ComparisonDashboardProps) {
  const [sortKey, setSortKey] = useState<"composite" | "equity" | "comfort" | "area" | "adjacency" | "light">(
    "composite",
  );

  // Recompute composite scores with current weights
  const rankedCandidates = useMemo(() => {
    const updated = candidates.map((c) => ({
      ...c,
      compositeScore: computeCompositeScore(c.radarScores, weights),
    }));

    const sortFn: Record<string, (a: DesignCandidate, b: DesignCandidate) => number> = {
      composite: (a, b) => b.compositeScore - a.compositeScore,
      equity: (a, b) => b.equity.equityScore - a.equity.equityScore,
      comfort: (a, b) => b.comfort.overallComfortScore - a.comfort.overallComfortScore,
      area: (a, b) => b.spatial.areaEfficiency - a.spatial.areaEfficiency,
      adjacency: (a, b) => b.adjacency.adjacencyScore - a.adjacency.adjacencyScore,
      light: (a, b) => b.light.lightAccessRatio - a.light.lightAccessRatio,
    };

    return [...updated].sort(sortFn[sortKey] ?? sortFn.composite);
  }, [candidates, weights, sortKey]);

  const handleWeightChange = useCallback(
    (key: keyof MetricWeights, value: number) => {
      onWeightsChange({ ...weights, [key]: value });
    },
    [weights, onWeightsChange],
  );

  const resetWeights = useCallback(() => {
    onWeightsChange({ ...DEFAULT_WEIGHTS });
  }, [onWeightsChange]);

  // Best candidate
  const bestCandidate = rankedCandidates[0];

  return (
    <div>
      {/* Top: Radar Chart + Weight Controls side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Radar Chart */}
        <div className="sa-card" style={{ padding: 16 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>
            Radar Comparison
          </h3>
          <RadarChart candidates={rankedCandidates} selectedId={selectedId} size={300} />
        </div>

        {/* Weight Controls + Equity Highlight */}
        <div>
          {/* Equity Score Highlight */}
          {bestCandidate && (
            <div
              className="sa-card"
              style={{
                padding: 16,
                marginBottom: 12,
                border: "2px solid #c0392b",
                background: "#fdf2f2",
              }}
            >
              <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#c0392b" }}>
                Thermal Equity Analysis
              </h3>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "#666" }}>
                Comfort gap between best-served and worst-served cohorts
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#c0392b" }}>
                    {(bestCandidate.equity.equityScore * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 10, color: "#888" }}>Equity Score</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#e67e22" }}>
                    {(bestCandidate.equity.comfortGap * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 10, color: "#888" }}>Comfort Gap</div>
                </div>
              </div>

              <div style={{ fontSize: 11, marginBottom: 8 }}>
                <div>
                  <span style={{ color: "#27ae60" }}>Best served:</span>{" "}
                  <strong>{bestCandidate.equity.bestCohortLabel}</strong>{" "}
                  ({(bestCandidate.equity.bestCohortScore * 100).toFixed(1)}%)
                </div>
                <div>
                  <span style={{ color: "#e74c3c" }}>Most disadvantaged:</span>{" "}
                  <strong>{bestCandidate.equity.worstCohortLabel}</strong>{" "}
                  ({(bestCandidate.equity.worstCohortScore * 100).toFixed(1)}%)
                </div>
              </div>

              <EquityBar cohorts={bestCandidate.equity.cohorts} />
            </div>
          )}

          {/* Weight Controls */}
          <div className="sa-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Metric Weights</h3>
              <button className="sa-btn" onClick={resetWeights} style={{ fontSize: 10, padding: "2px 8px" }}>
                Reset
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <WeightSlider
                label="Area Efficiency"
                value={weights.areaEfficiency}
                onChange={(v) => handleWeightChange("areaEfficiency", v)}
              />
              <WeightSlider
                label="Comfort"
                value={weights.comfortScore}
                onChange={(v) => handleWeightChange("comfortScore", v)}
              />
              <WeightSlider
                label="Adjacency"
                value={weights.adjacencyScore}
                onChange={(v) => handleWeightChange("adjacencyScore", v)}
              />
              <WeightSlider
                label="Light Access"
                value={weights.lightScore}
                onChange={(v) => handleWeightChange("lightScore", v)}
              />
              <WeightSlider
                label="Equity"
                value={weights.equityScore}
                onChange={(v) => handleWeightChange("equityScore", v)}
                highlight
              />
            </div>
          </div>
        </div>
      </div>

      {/* Ranking Table */}
      <div className="sa-card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>
          Candidate Ranking
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd" }}>
                <th style={{ padding: "6px 8px", textAlign: "left" }}>#</th>
                <th style={{ padding: "6px 8px", textAlign: "left" }}>Candidate</th>
                <th
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    cursor: "pointer",
                    color: sortKey === "composite" ? "var(--sa-primary, #2E6B8A)" : "inherit",
                  }}
                  onClick={() => setSortKey("composite")}
                >
                  Composite ▼
                </th>
                <th
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    cursor: "pointer",
                    color: sortKey === "equity" ? "#c0392b" : "inherit",
                    fontWeight: 700,
                  }}
                  onClick={() => setSortKey("equity")}
                >
                  Equity ▼
                </th>
                <th
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    cursor: "pointer",
                    color: sortKey === "comfort" ? "var(--sa-primary, #2E6B8A)" : "inherit",
                  }}
                  onClick={() => setSortKey("comfort")}
                >
                  Comfort ▼
                </th>
                <th
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    cursor: "pointer",
                    color: sortKey === "area" ? "var(--sa-primary, #2E6B8A)" : "inherit",
                  }}
                  onClick={() => setSortKey("area")}
                >
                  Area Eff. ▼
                </th>
                <th
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    cursor: "pointer",
                    color: sortKey === "adjacency" ? "var(--sa-primary, #2E6B8A)" : "inherit",
                  }}
                  onClick={() => setSortKey("adjacency")}
                >
                  Adjacency ▼
                </th>
                <th
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    cursor: "pointer",
                    color: sortKey === "light" ? "var(--sa-primary, #2E6B8A)" : "inherit",
                  }}
                  onClick={() => setSortKey("light")}
                >
                  Light ▼
                </th>
                <th style={{ padding: "6px 8px", textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rankedCandidates.map((c, i) => {
                const isSelected = c.id === selectedId;
                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: "1px solid #eee",
                      background: isSelected ? "rgba(46, 107, 138, 0.08)" : i === 0 ? "rgba(39, 174, 96, 0.05)" : "transparent",
                      cursor: "pointer",
                    }}
                    onClick={() => onSelect(c.id)}
                  >
                    <td style={{ padding: "8px", fontWeight: 600 }}>
                      {i === 0 ? "🏆" : `${i + 1}`}
                    </td>
                    <td style={{ padding: "8px", fontWeight: isSelected ? 700 : 400 }}>
                      {c.label}
                      {c.source === "refined" && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 9,
                            padding: "1px 4px",
                            background: "#e8f5e9",
                            color: "#27ae60",
                            borderRadius: 3,
                          }}
                        >
                          REFINED
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>
                      {(c.compositeScore * 100).toFixed(1)}%
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        textAlign: "right",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: c.equity.equityScore >= 0.85 ? "#27ae60" : c.equity.equityScore >= 0.7 ? "#f39c12" : "#e74c3c",
                      }}
                    >
                      {(c.equity.equityScore * 100).toFixed(1)}%
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>
                      {(c.comfort.overallComfortScore * 100).toFixed(1)}%
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>
                      {(c.spatial.areaEfficiency * 100).toFixed(1)}%
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>
                      {(c.adjacency.adjacencyScore * 100).toFixed(1)}%
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>
                      {(c.light.lightAccessRatio * 100).toFixed(1)}%
                    </td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      <button
                        className={`sa-btn ${isSelected ? "sa-btn-primary" : ""}`}
                        style={{ fontSize: 10, padding: "2px 8px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(c.id);
                        }}
                      >
                        {isSelected ? "Selected" : "Select"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
