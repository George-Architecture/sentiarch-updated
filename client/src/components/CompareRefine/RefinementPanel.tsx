/**
 * SentiArch — Refinement Panel
 *
 * Detail drill-down for a selected candidate:
 * - Per-cohort comfort breakdown
 * - Room environment tweaks (what-if analysis)
 * - Design notes / annotations
 * - Version history (before/after comparison)
 */
import { useState, useCallback } from "react";
import type {
  DesignCandidate,
  RefinementVersion,
  RoomOverride,
  CohortComfort,
} from "../../types/comparison";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RefinementPanelProps {
  candidate: DesignCandidate;
  versions: RefinementVersion[];
  roomOverrides: RoomOverride[];
  onRoomOverrideChange: (overrides: RoomOverride[]) => void;
  onSaveVersion: (description: string) => void;
  onNotesChange: (notes: string) => void;
  onReSimulate: () => void;
  isSimulating: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Per-cohort comfort breakdown table. */
function CohortBreakdown({ cohorts }: { cohorts: CohortComfort[] }) {
  const sorted = [...cohorts].sort((a, b) => b.avgComfortScore - a.avgComfortScore);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: "4px 6px", textAlign: "left" }}>Cohort</th>
            <th style={{ padding: "4px 6px", textAlign: "right" }}>Comfort</th>
            <th style={{ padding: "4px 6px", textAlign: "right" }}>PMV</th>
            <th style={{ padding: "4px 6px", textAlign: "right" }}>PPD</th>
            <th style={{ padding: "4px 6px", textAlign: "right" }}>Load</th>
            <th style={{ padding: "4px 6px", textAlign: "right" }}>Alerts</th>
            <th style={{ padding: "4px 6px" }}>Bar</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.cohortId} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "4px 6px" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: c.colorHex,
                    marginRight: 6,
                  }}
                />
                {c.cohortLabel}
              </td>
              <td style={{ padding: "4px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>
                {(c.avgComfortScore * 100).toFixed(1)}%
              </td>
              <td
                style={{
                  padding: "4px 6px",
                  textAlign: "right",
                  fontFamily: "monospace",
                  color: Math.abs(c.avgPMV) > 0.5 ? "#e74c3c" : "#27ae60",
                }}
              >
                {c.avgPMV >= 0 ? "+" : ""}
                {c.avgPMV.toFixed(2)}
              </td>
              <td
                style={{
                  padding: "4px 6px",
                  textAlign: "right",
                  fontFamily: "monospace",
                  color: c.avgPPD > 10 ? "#e74c3c" : "#27ae60",
                }}
              >
                {c.avgPPD.toFixed(1)}%
              </td>
              <td
                style={{
                  padding: "4px 6px",
                  textAlign: "right",
                  fontFamily: "monospace",
                  color: c.avgLoad > 0.7 ? "#e74c3c" : c.avgLoad > 0.5 ? "#f39c12" : "#27ae60",
                }}
              >
                {c.avgLoad.toFixed(2)}
              </td>
              <td
                style={{
                  padding: "4px 6px",
                  textAlign: "right",
                  fontFamily: "monospace",
                  color: c.alertCount > 0 ? "#e74c3c" : "#27ae60",
                }}
              >
                {c.alertCount}
              </td>
              <td style={{ padding: "4px 6px", width: 100 }}>
                <div
                  style={{
                    height: 10,
                    background: "#f0f0f0",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${c.avgComfortScore * 100}%`,
                      background:
                        c.avgComfortScore >= 0.85
                          ? "#27ae60"
                          : c.avgComfortScore >= 0.7
                            ? "#f39c12"
                            : "#e74c3c",
                      borderRadius: 3,
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Room environment override editor. */
function RoomOverrideEditor({
  overrides,
  onChange,
}: {
  overrides: RoomOverride[];
  onChange: (overrides: RoomOverride[]) => void;
}) {
  const handleFieldChange = useCallback(
    (idx: number, field: keyof RoomOverride, value: number | undefined) => {
      const updated = [...overrides];
      updated[idx] = { ...updated[idx], [field]: value };
      onChange(updated);
    },
    [overrides, onChange],
  );

  const addOverride = useCallback(() => {
    onChange([
      ...overrides,
      {
        spaceId: "",
        roomName: "New Room",
        airTemp: 24,
        humidity: 55,
        airVelocity: 0.1,
        lux: 300,
        noiseDb: 45,
      },
    ]);
  }, [overrides, onChange]);

  const removeOverride = useCallback(
    (idx: number) => {
      onChange(overrides.filter((_, i) => i !== idx));
    },
    [overrides, onChange],
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Room Environment Overrides</span>
        <button className="sa-btn" onClick={addOverride} style={{ fontSize: 10, padding: "2px 8px" }}>
          + Add Override
        </button>
      </div>

      {overrides.length === 0 && (
        <p style={{ fontSize: 11, color: "#888", margin: "4px 0" }}>
          No overrides. Add one to test what-if scenarios.
        </p>
      )}

      {overrides.map((ov, idx) => (
        <div
          key={idx}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr repeat(5, 70px) 30px",
            gap: 4,
            marginBottom: 4,
            alignItems: "center",
            fontSize: 11,
          }}
        >
          <input
            className="sa-input"
            value={ov.roomName}
            onChange={(e) => {
              const updated = [...overrides];
              updated[idx] = { ...updated[idx], roomName: e.target.value };
              onChange(updated);
            }}
            style={{ fontSize: 11, padding: "2px 4px" }}
            placeholder="Room name"
          />
          <input
            className="sa-input"
            type="number"
            value={ov.airTemp ?? ""}
            onChange={(e) => handleFieldChange(idx, "airTemp", e.target.value ? Number(e.target.value) : undefined)}
            style={{ fontSize: 11, padding: "2px 4px" }}
            placeholder="Temp"
            title="Air Temperature (C)"
          />
          <input
            className="sa-input"
            type="number"
            value={ov.humidity ?? ""}
            onChange={(e) => handleFieldChange(idx, "humidity", e.target.value ? Number(e.target.value) : undefined)}
            style={{ fontSize: 11, padding: "2px 4px" }}
            placeholder="RH%"
            title="Relative Humidity (%)"
          />
          <input
            className="sa-input"
            type="number"
            value={ov.airVelocity ?? ""}
            onChange={(e) =>
              handleFieldChange(idx, "airVelocity", e.target.value ? Number(e.target.value) : undefined)
            }
            style={{ fontSize: 11, padding: "2px 4px" }}
            placeholder="m/s"
            title="Air Velocity (m/s)"
            step={0.05}
          />
          <input
            className="sa-input"
            type="number"
            value={ov.lux ?? ""}
            onChange={(e) => handleFieldChange(idx, "lux", e.target.value ? Number(e.target.value) : undefined)}
            style={{ fontSize: 11, padding: "2px 4px" }}
            placeholder="Lux"
            title="Illuminance (lux)"
          />
          <input
            className="sa-input"
            type="number"
            value={ov.noiseDb ?? ""}
            onChange={(e) => handleFieldChange(idx, "noiseDb", e.target.value ? Number(e.target.value) : undefined)}
            style={{ fontSize: 11, padding: "2px 4px" }}
            placeholder="dB"
            title="Noise Level (dB)"
          />
          <button
            onClick={() => removeOverride(idx)}
            style={{
              background: "none",
              border: "none",
              color: "#e74c3c",
              cursor: "pointer",
              fontSize: 14,
              padding: 0,
            }}
            title="Remove override"
          >
            x
          </button>
        </div>
      ))}

      {overrides.length > 0 && (
        <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
          Columns: Room | Temp (C) | RH (%) | Air Vel (m/s) | Lux | Noise (dB)
        </div>
      )}
    </div>
  );
}

/** Version history list. */
function VersionHistory({
  versions,
  currentCandidate,
}: {
  versions: RefinementVersion[];
  currentCandidate: DesignCandidate;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (versions.length === 0) {
    return (
      <p style={{ fontSize: 11, color: "#888", margin: "4px 0" }}>
        No saved versions yet. Make changes and save to track refinement history.
      </p>
    );
  }

  return (
    <div>
      {versions.map((v) => {
        const isExpanded = expandedId === v.versionId;
        const scoreDiff = currentCandidate.compositeScore - v.candidate.compositeScore;

        return (
          <div
            key={v.versionId}
            style={{
              border: "1px solid #eee",
              borderRadius: 6,
              marginBottom: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 10px",
                background: "#fafafa",
                cursor: "pointer",
                fontSize: 12,
              }}
              onClick={() => setExpandedId(isExpanded ? null : v.versionId)}
            >
              <div>
                <strong>{v.label}</strong>
                <span style={{ marginLeft: 8, color: "#888", fontSize: 10 }}>
                  {new Date(v.timestamp).toLocaleString()}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "monospace" }}>
                  {(v.candidate.compositeScore * 100).toFixed(1)}%
                </span>
                {scoreDiff !== 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      color: scoreDiff > 0 ? "#27ae60" : "#e74c3c",
                      fontWeight: 600,
                    }}
                  >
                    {scoreDiff > 0 ? "+" : ""}
                    {(scoreDiff * 100).toFixed(1)}%
                  </span>
                )}
                <span>{isExpanded ? "▲" : "▼"}</span>
              </div>
            </div>

            {isExpanded && (
              <div style={{ padding: "8px 10px", fontSize: 11 }}>
                <p style={{ margin: "0 0 6px", color: "#666" }}>{v.changeDescription}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                  <div>
                    <div style={{ color: "#888", fontSize: 9 }}>Area Eff.</div>
                    <div style={{ fontFamily: "monospace" }}>
                      {(v.candidate.radarScores.areaEfficiency * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#888", fontSize: 9 }}>Comfort</div>
                    <div style={{ fontFamily: "monospace" }}>
                      {(v.candidate.radarScores.comfortScore * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#888", fontSize: 9 }}>Adjacency</div>
                    <div style={{ fontFamily: "monospace" }}>
                      {(v.candidate.radarScores.adjacencyScore * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#888", fontSize: 9 }}>Light</div>
                    <div style={{ fontFamily: "monospace" }}>
                      {(v.candidate.radarScores.lightScore * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#c0392b" }}>Equity</div>
                    <div style={{ fontFamily: "monospace", fontWeight: 700, color: "#c0392b" }}>
                      {(v.candidate.radarScores.equityScore * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function RefinementPanel({
  candidate,
  versions,
  roomOverrides,
  onRoomOverrideChange,
  onSaveVersion,
  onNotesChange,
  onReSimulate,
  isSimulating,
}: RefinementPanelProps) {
  const [saveDesc, setSaveDesc] = useState("");

  const handleSave = useCallback(() => {
    if (saveDesc.trim()) {
      onSaveVersion(saveDesc.trim());
      setSaveDesc("");
    }
  }, [saveDesc, onSaveVersion]);

  return (
    <div>
      {/* Candidate Summary */}
      <div className="sa-card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            {candidate.label}
            {candidate.source === "refined" && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 9,
                  padding: "1px 6px",
                  background: "#e8f5e9",
                  color: "#27ae60",
                  borderRadius: 3,
                }}
              >
                REFINED
              </span>
            )}
          </h3>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>
            {(candidate.compositeScore * 100).toFixed(1)}%
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, fontSize: 11 }}>
          <div style={{ textAlign: "center", padding: 6, background: "#f8f9fa", borderRadius: 4 }}>
            <div style={{ fontWeight: 600 }}>{candidate.spatial.roomCount}</div>
            <div style={{ color: "#888", fontSize: 9 }}>Rooms</div>
          </div>
          <div style={{ textAlign: "center", padding: 6, background: "#f8f9fa", borderRadius: 4 }}>
            <div style={{ fontWeight: 600 }}>{candidate.spatial.totalAreaM2.toFixed(0)} m2</div>
            <div style={{ color: "#888", fontSize: 9 }}>Total Area</div>
          </div>
          <div style={{ textAlign: "center", padding: 6, background: "#f8f9fa", borderRadius: 4 }}>
            <div style={{ fontWeight: 600 }}>{candidate.spatial.floorCount}</div>
            <div style={{ color: "#888", fontSize: 9 }}>Floors</div>
          </div>
          <div style={{ textAlign: "center", padding: 6, background: "#f8f9fa", borderRadius: 4 }}>
            <div style={{ fontWeight: 600 }}>{candidate.comfort.alertCount}</div>
            <div style={{ color: "#888", fontSize: 9 }}>Alerts</div>
          </div>
          <div
            style={{
              textAlign: "center",
              padding: 6,
              background: "#fdf2f2",
              borderRadius: 4,
              border: "1px solid #f5c6cb",
            }}
          >
            <div style={{ fontWeight: 700, color: "#c0392b" }}>
              {(candidate.equity.comfortGap * 100).toFixed(1)}%
            </div>
            <div style={{ color: "#c0392b", fontSize: 9 }}>Equity Gap</div>
          </div>
        </div>
      </div>

      {/* Per-Cohort Breakdown */}
      <div className="sa-card" style={{ padding: 16, marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>
          Per-Cohort Comfort Breakdown
        </h3>
        <CohortBreakdown cohorts={candidate.equity.cohorts} />
      </div>

      {/* Room Environment Tweaks */}
      <div className="sa-card" style={{ padding: 16, marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>
          What-If Analysis
        </h3>
        <RoomOverrideEditor overrides={roomOverrides} onChange={onRoomOverrideChange} />
        <div style={{ marginTop: 10 }}>
          <button
            className="sa-btn sa-btn-primary"
            onClick={onReSimulate}
            disabled={isSimulating || roomOverrides.length === 0}
            style={{ fontSize: 12 }}
          >
            {isSimulating ? "Re-simulating..." : "Re-simulate with Overrides"}
          </button>
        </div>
      </div>

      {/* Design Notes */}
      <div className="sa-card" style={{ padding: 16, marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>
          Design Notes
        </h3>
        <textarea
          className="sa-input"
          value={candidate.notes ?? ""}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Add design notes, observations, or refinement rationale..."
          rows={4}
          style={{ width: "100%", fontSize: 12, resize: "vertical" }}
        />
      </div>

      {/* Save Version */}
      <div className="sa-card" style={{ padding: 16, marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>
          Save Refinement Version
        </h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="sa-input"
            value={saveDesc}
            onChange={(e) => setSaveDesc(e.target.value)}
            placeholder="Describe what changed (e.g. 'Increased gym ventilation')"
            style={{ flex: 1, fontSize: 12 }}
          />
          <button
            className="sa-btn sa-btn-primary"
            onClick={handleSave}
            disabled={!saveDesc.trim()}
            style={{ fontSize: 12 }}
          >
            Save Version
          </button>
        </div>
      </div>

      {/* Version History */}
      <div className="sa-card" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>
          Version History ({versions.length})
        </h3>
        <VersionHistory versions={versions} currentCandidate={candidate} />
      </div>
    </div>
  );
}
