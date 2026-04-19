/**
 * SentiArch — Simulation Results Dashboard
 *
 * Displays batch simulation results: per-room heatmap, per-cohort summary,
 * per-task detail, alerts panel, and global statistics.
 */
import { useState } from "react";
import type { SimulationResult, ScenarioResult } from "../../types/simulation";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ResultsDashboardProps {
  result: SimulationResult;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Map a 0-1 score to a green→yellow→red color */
function scoreToColor(score: number): string {
  // 1.0 = green, 0.5 = yellow, 0.0 = red
  const clamped = Math.max(0, Math.min(1, score));
  if (clamped >= 0.5) {
    const t = (clamped - 0.5) * 2; // 0→1
    const r = Math.round(255 * (1 - t));
    const g = Math.round(180 + 75 * t);
    return `rgb(${r}, ${g}, 60)`;
  } else {
    const t = clamped * 2; // 0→1
    const r = Math.round(220 - 30 * t);
    const g = Math.round(60 + 120 * t);
    return `rgb(${r}, ${g}, 50)`;
  }
}

/** Map a 0-1 load to a green→red color (inverse of score) */
function loadToColor(load: number): string {
  return scoreToColor(1 - load);
}

// ---------------------------------------------------------------------------
// Statistics Card
// ---------------------------------------------------------------------------

function StatisticsCard({ result }: { result: SimulationResult }) {
  const statistics = result.statistics;
  if (!statistics) {
    return (
      <div className="sa-card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>Global Statistics</h3>
        <div style={{ fontSize: 13, color: "var(--sa-text-secondary)" }}>No statistics available. Run a simulation first.</div>
      </div>
    );
  }
  return (
    <div className="sa-card" style={{ padding: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>Global Statistics</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <div style={{ textAlign: "center", padding: 8, background: "var(--sa-bg-secondary, #f8f8f8)", borderRadius: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: scoreToColor(statistics.avgScore) }}>
            {(statistics.avgScore * 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: 11, color: "var(--sa-text-secondary)" }}>Avg Comfort Score</div>
        </div>
        <div style={{ textAlign: "center", padding: 8, background: "var(--sa-bg-secondary, #f8f8f8)", borderRadius: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{statistics.totalScenarios}</div>
          <div style={{ fontSize: 11, color: "var(--sa-text-secondary)" }}>Scenarios Run</div>
        </div>
        <div style={{ textAlign: "center", padding: 8, background: "var(--sa-bg-secondary, #f8f8f8)", borderRadius: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: statistics.totalAlerts > 0 ? "#e74c3c" : "#27ae60" }}>
            {statistics.totalAlerts}
          </div>
          <div style={{ fontSize: 11, color: "var(--sa-text-secondary)" }}>Alerts</div>
        </div>
        <div style={{ textAlign: "center", padding: 8, background: "var(--sa-bg-secondary, #f8f8f8)", borderRadius: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{statistics.totalComputeTimeMs.toFixed(1)}ms</div>
          <div style={{ fontSize: 11, color: "var(--sa-text-secondary)" }}>Compute Time</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12, fontSize: 12 }}>
        <div>
          <span style={{ color: "var(--sa-text-secondary)" }}>Worst Room: </span>
          <strong style={{ color: "#e74c3c" }}>{statistics.worstRoom}</strong>
        </div>
        <div>
          <span style={{ color: "var(--sa-text-secondary)" }}>Best Room: </span>
          <strong style={{ color: "#27ae60" }}>{statistics.bestRoom}</strong>
        </div>
        <div>
          <span style={{ color: "var(--sa-text-secondary)" }}>Worst Cohort: </span>
          <strong style={{ color: "#e74c3c" }}>{statistics.worstCohort}</strong>
        </div>
        <div>
          <span style={{ color: "var(--sa-text-secondary)" }}>Best Cohort: </span>
          <strong style={{ color: "#27ae60" }}>{statistics.bestCohort}</strong>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Room Heatmap
// ---------------------------------------------------------------------------

function RoomHeatmap({ result }: { result: SimulationResult }) {
  const [sortBy, setSortBy] = useState<"load" | "pmv" | "ppd" | "visits">("load");

  if (!result.roomAggregates || result.roomAggregates.length === 0) {
    return (
      <div className="sa-card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Per-Room Heatmap</h3>
        <div style={{ fontSize: 13, color: "var(--sa-text-secondary)" }}>No room data available.</div>
      </div>
    );
  }

  const sorted = [...result.roomAggregates].sort((a, b) => {
    switch (sortBy) {
      case "load": return b.avgLoad - a.avgLoad;
      case "pmv": return Math.abs(b.avgPmv) - Math.abs(a.avgPmv);
      case "ppd": return b.avgPpd - a.avgPpd;
      case "visits": return b.visitCount - a.visitCount;
    }
  });

  return (
    <div className="sa-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Per-Room Heatmap</h3>
        <div style={{ display: "flex", gap: 4 }}>
          {(["load", "pmv", "ppd", "visits"] as const).map((key) => (
            <button
              key={key}
              className={`sa-btn sa-btn-sm ${sortBy === key ? "sa-btn-primary" : ""}`}
              onClick={() => setSortBy(key)}
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              {key.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--sa-border)" }}>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Room</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Category</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Visits</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Avg PMV</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Avg PPD</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Avg Load</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Worst Load</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Alerts</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Comfort Bar</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((room) => (
              <tr key={room.spaceId} style={{ borderBottom: "1px solid var(--sa-border-light, #eee)" }}>
                <td style={{ padding: "5px 8px", fontWeight: 500 }}>{room.spaceName}</td>
                <td style={{ padding: "5px 8px", textAlign: "center" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "1px 8px",
                      borderRadius: 10,
                      fontSize: 10,
                      background: room.colorHex + "20",
                      color: room.colorHex,
                      fontWeight: 600,
                    }}
                  >
                    {room.category}
                  </span>
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center" }}>{room.visitCount}</td>
                <td style={{ padding: "5px 8px", textAlign: "center", color: Math.abs(room.avgPmv) > 0.5 ? "#e74c3c" : "inherit" }}>
                  {room.avgPmv > 0 ? "+" : ""}{room.avgPmv.toFixed(2)}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center", color: room.avgPpd > 10 ? "#e74c3c" : "inherit" }}>
                  {room.avgPpd.toFixed(1)}%
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 600, color: loadToColor(room.avgLoad) }}>
                  {room.avgLoad.toFixed(2)}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center", color: loadToColor(room.worstLoad) }}>
                  {room.worstLoad.toFixed(2)}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center" }}>
                  {room.alertCount > 0 && (
                    <span style={{ color: "#e74c3c", fontWeight: 600 }}>{room.alertCount}</span>
                  )}
                </td>
                <td style={{ padding: "5px 8px", minWidth: 100 }}>
                  <div
                    style={{
                      height: 14,
                      borderRadius: 7,
                      background: "#eee",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${(1 - room.avgLoad) * 100}%`,
                        background: loadToColor(room.avgLoad),
                        borderRadius: 7,
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cohort Summary
// ---------------------------------------------------------------------------

function CohortSummaryTable({ result }: { result: SimulationResult }) {
  if (!result.cohortSummaries || result.cohortSummaries.length === 0) {
    return (
      <div className="sa-card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Per-Cohort Summary</h3>
        <div style={{ fontSize: 13, color: "var(--sa-text-secondary)" }}>No cohort data available.</div>
      </div>
    );
  }
  return (
    <div className="sa-card" style={{ padding: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>Per-Cohort Summary</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--sa-border)" }}>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Cohort</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Tasks</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Avg Score</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Best</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Worst</th>
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Alerts</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Worst Room</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Score Bar</th>
            </tr>
          </thead>
          <tbody>
            {result.cohortSummaries.map((cs) => (
              <tr key={cs.cohortId} style={{ borderBottom: "1px solid var(--sa-border-light, #eee)" }}>
                <td style={{ padding: "5px 8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: cs.colorHex,
                        display: "inline-block",
                      }}
                    />
                    <span style={{ fontWeight: 500 }}>{cs.cohortLabel}</span>
                  </div>
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center" }}>{cs.taskCount}</td>
                <td
                  style={{
                    padding: "5px 8px",
                    textAlign: "center",
                    fontWeight: 600,
                    color: scoreToColor(cs.avgScore),
                  }}
                >
                  {(cs.avgScore * 100).toFixed(1)}%
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center", color: scoreToColor(cs.bestScore) }}>
                  {(cs.bestScore * 100).toFixed(1)}%
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center", color: scoreToColor(cs.worstScore) }}>
                  {(cs.worstScore * 100).toFixed(1)}%
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center" }}>
                  {cs.alertCount > 0 ? (
                    <span style={{ color: "#e74c3c", fontWeight: 600 }}>{cs.alertCount}</span>
                  ) : (
                    <span style={{ color: "#27ae60" }}>0</span>
                  )}
                </td>
                <td style={{ padding: "5px 8px", fontSize: 11 }}>{cs.worstRoom}</td>
                <td style={{ padding: "5px 8px", minWidth: 80 }}>
                  <div
                    style={{
                      height: 12,
                      borderRadius: 6,
                      background: "#eee",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${cs.avgScore * 100}%`,
                        background: scoreToColor(cs.avgScore),
                        borderRadius: 6,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Detail (expandable)
// ---------------------------------------------------------------------------

function TaskDetail({ result }: { result: SimulationResult }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!result.scenarioResults || !result.tasks) {
    return (
      <div className="sa-card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Per-Task Detail</h3>
        <div style={{ fontSize: 13, color: "var(--sa-text-secondary)" }}>No task data available.</div>
      </div>
    );
  }

  // Group results by task
  const taskGroups = new Map<string, ScenarioResult[]>();
  for (const sr of result.scenarioResults) {
    const existing = taskGroups.get(sr.taskId) ?? [];
    existing.push(sr);
    taskGroups.set(sr.taskId, existing);
  }

  return (
    <div className="sa-card" style={{ padding: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>Per-Task Detail</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {result.tasks.map((task) => {
          const scenarios = taskGroups.get(task.id) ?? [];
          const isExpanded = expandedId === task.id;
          const avgScore =
            scenarios.length > 0
              ? scenarios.reduce((s, r) => s + r.combinedScore, 0) / scenarios.length
              : 0;

          return (
            <div key={task.id} style={{ border: "1px solid var(--sa-border-light, #eee)", borderRadius: 6 }}>
              <div
                style={{
                  padding: "8px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  background: isExpanded ? "var(--sa-bg-secondary, #f8f8f8)" : "transparent",
                }}
                onClick={() => setExpandedId(isExpanded ? null : task.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                    ▶
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{task.label}</span>
                  <span style={{ fontSize: 11, color: "var(--sa-text-secondary)" }}>
                    ({scenarios.length} cohorts)
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: scoreToColor(avgScore),
                  }}
                >
                  {(avgScore * 100).toFixed(1)}%
                </span>
              </div>
              {isExpanded && (
                <div style={{ padding: "0 12px 12px" }}>
                  {scenarios.map((sr) => {
                    const cohort = result.cohorts.find((c) => c.id === sr.cohortId);
                    return (
                      <div key={sr.scenarioId} style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: cohort?.colorHex ?? "#999",
                              display: "inline-block",
                            }}
                          />
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{cohort?.label ?? sr.cohortId}</span>
                          <span style={{ fontSize: 11, color: scoreToColor(sr.combinedScore), fontWeight: 600 }}>
                            {(sr.combinedScore * 100).toFixed(1)}%
                          </span>
                        </div>
                        {/* Route comfort strip */}
                        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                          {sr.routeComfort.map((rc, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                              <div
                                title={`${rc.spaceName}: PMV=${rc.pmv}, PPD=${rc.ppd}%, Load=${rc.aggregateLoad}`}
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  fontSize: 10,
                                  background: loadToColor(rc.aggregateLoad) + "30",
                                  border: `1px solid ${loadToColor(rc.aggregateLoad)}`,
                                  color: loadToColor(rc.aggregateLoad),
                                  fontWeight: rc.isAlert ? 700 : 400,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {rc.spaceName.length > 12 ? rc.spaceName.slice(0, 12) + "..." : rc.spaceName}
                              </div>
                              {i < sr.routeComfort.length - 1 && (
                                <span style={{ fontSize: 10, color: "var(--sa-text-secondary)" }}>→</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts Panel
// ---------------------------------------------------------------------------

function AlertsPanel({ result }: { result: SimulationResult }) {
  if (!result.alerts || result.alerts.length === 0) {
    return (
      <div className="sa-card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Alerts</h3>
        <div style={{ fontSize: 13, color: "#27ae60", fontWeight: 500 }}>
          No comfort alerts — all rooms within acceptable thresholds.
        </div>
      </div>
    );
  }

  const criticals = (result.alerts ?? []).filter((a) => a.severity === "critical");
  const warnings = (result.alerts ?? []).filter((a) => a.severity === "warning");

  return (
    <div className="sa-card" style={{ padding: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>
        Alerts ({result.alerts.length})
      </h3>
      {criticals.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#e74c3c", marginBottom: 6 }}>
            Critical ({criticals.length})
          </div>
          {criticals.map((alert, i) => (
            <div
              key={i}
              style={{
                padding: "6px 10px",
                marginBottom: 4,
                borderRadius: 4,
                background: "#fde8e8",
                border: "1px solid #f5c6c6",
                fontSize: 12,
              }}
            >
              <strong>{alert.spaceName}</strong> — {alert.cohortLabel}: {alert.reason}
            </div>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#f39c12", marginBottom: 6 }}>
            Warnings ({warnings.length})
          </div>
          {warnings.map((alert, i) => (
            <div
              key={i}
              style={{
                padding: "6px 10px",
                marginBottom: 4,
                borderRadius: 4,
                background: "#fef9e7",
                border: "1px solid #f9e79f",
                fontSize: 12,
              }}
            >
              <strong>{alert.spaceName}</strong> — {alert.cohortLabel}: {alert.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function ResultsDashboard({ result }: ResultsDashboardProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <StatisticsCard result={result} />
      <AlertsPanel result={result} />
      <RoomHeatmap result={result} />
      <CohortSummaryTable result={result} />
      <TaskDetail result={result} />
    </div>
  );
}
