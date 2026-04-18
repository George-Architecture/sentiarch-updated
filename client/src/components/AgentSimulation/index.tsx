/**
 * SentiArch — Agent Batch Simulation
 *
 * Main component that orchestrates the Scenario Builder and Results Dashboard.
 * Loads LayoutResult from localStorage (Step 3) and ProgramSpec (Step 1),
 * extracts room info, runs batch simulation, and displays results.
 */
import { useState, useEffect, useCallback } from "react";
import ScenarioBuilder from "./ScenarioBuilder";
import ResultsDashboard from "./ResultsDashboard";
import { runBatchSimulation, type LayoutRoomInfo } from "../../engines/simulation";
import type { SimulationConfig, SimulationResult } from "../../types/simulation";
import type { ProgramSpec } from "../../types/program";

// ---------------------------------------------------------------------------
// localStorage keys (matching Steps 1-3)
// ---------------------------------------------------------------------------

const LS_PROGRAM_SPEC = "sentiarch_program_spec";
const LS_LAYOUT_RESULT = "sentiarch_layout_result";
const LS_SIMULATION_RESULT = "sentiarch_simulation_result";

// ---------------------------------------------------------------------------
// Extract room info from layout + program spec
// ---------------------------------------------------------------------------

interface RawLayoutRoom {
  spaceId: string;
  polygon: { x: number; y: number }[];
  areaM2: number;
  touchesExterior?: boolean;
}

interface RawFloorLayout {
  floorIndex: number;
  rooms: RawLayoutRoom[];
}

interface RawLayoutResult {
  floors: RawFloorLayout[];
}

function extractRoomInfo(
  layout: RawLayoutResult,
  spec: ProgramSpec | null,
): LayoutRoomInfo[] {
  const spaceMap = new Map<string, { name: string; category: string; colorHex: string }>();
  if (spec) {
    for (const s of spec.spaces) {
      spaceMap.set(s.id, { name: s.name, category: s.category, colorHex: s.colorHex ?? "#999999" });
    }
  }

  const rooms: LayoutRoomInfo[] = [];
  for (const floor of layout.floors) {
    const floorRoomIds = floor.rooms.map((r) => r.spaceId);
    for (const room of floor.rooms) {
      const info = spaceMap.get(room.spaceId);
      rooms.push({
        spaceId: room.spaceId,
        name: info?.name ?? room.spaceId,
        category: info?.category ?? "unknown",
        floorIndex: floor.floorIndex,
        areaM2: room.areaM2,
        touchesExterior: room.touchesExterior ?? false,
        colorHex: info?.colorHex ?? "#999999",
        adjacentRoomIds: floorRoomIds.filter((id) => id !== room.spaceId),
      });
    }
  }

  return rooms;
}

// ---------------------------------------------------------------------------
// Fallback: create rooms from ProgramSpec + ZoningResult if no layout
// ---------------------------------------------------------------------------

function extractRoomInfoFromSpec(spec: ProgramSpec): LayoutRoomInfo[] {
  // Try to load zoning result for floor assignments
  let floorAssignments = new Map<string, number>();
  try {
    const zoningRaw = localStorage.getItem("sentiarch_zoning_result");
    if (zoningRaw) {
      const zoning = JSON.parse(zoningRaw);
      // Could be SelectedZoning or ZoningCandidate
      const candidate = zoning.candidate ?? zoning;
      if (candidate.floorAssignments) {
        for (const fa of candidate.floorAssignments) {
          for (const sid of fa.spaceIds) {
            floorAssignments.set(sid, fa.floorIndex);
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // Also try selected_zoning
  if (floorAssignments.size === 0) {
    try {
      const selectedRaw = localStorage.getItem("sentiarch_selected_zoning");
      if (selectedRaw) {
        const selected = JSON.parse(selectedRaw);
        const candidate = selected.candidate ?? selected;
        if (candidate.floorAssignments) {
          for (const fa of candidate.floorAssignments) {
            for (const sid of fa.spaceIds) {
              floorAssignments.set(sid, fa.floorIndex);
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return spec.spaces.map((s) => ({
    spaceId: s.id,
    name: s.name,
    category: s.category,
    floorIndex: floorAssignments.get(s.id) ?? (s.floorMandatory ?? 0),
    areaM2: s.areaPerUnit * s.quantity,
    touchesExterior: s.requiredFeatures?.includes("natural_light") ?? false,
    colorHex: s.colorHex ?? "#999999",
    adjacentRoomIds: [],
  }));
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AgentSimulation() {
  const [tab, setTab] = useState<"builder" | "results">("builder");
  const [rooms, setRooms] = useState<LayoutRoomInfo[]>([]);
  const [maxFloors, setMaxFloors] = useState(6);
  const [programSpecId, setProgramSpecId] = useState("unknown");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string>("none");

  // Load data from localStorage
  useEffect(() => {
    try {
      // Load program spec
      const specRaw = localStorage.getItem(LS_PROGRAM_SPEC);
      let spec: ProgramSpec | null = null;
      if (specRaw) {
        spec = JSON.parse(specRaw);
        setProgramSpecId(spec?.schemaVersion ?? "1.0.0");
        if (spec?.constraints) {
          setMaxFloors(spec.constraints.maxFloors);
        }
      }

      // Try loading layout result first (most complete data)
      const layoutRaw = localStorage.getItem(LS_LAYOUT_RESULT);
      if (layoutRaw) {
        const layout = JSON.parse(layoutRaw) as RawLayoutResult;
        if (layout.floors && layout.floors.length > 0) {
          const extracted = extractRoomInfo(layout, spec);
          if (extracted.length > 0) {
            setRooms(extracted);
            setDataSource("layout");
            return;
          }
        }
      }

      // Fallback: create rooms from spec + zoning
      if (spec) {
        const extracted = extractRoomInfoFromSpec(spec);
        setRooms(extracted);
        setDataSource("spec+zoning");
        return;
      }

      setDataSource("none");
    } catch (e) {
      setError(`Failed to load data: ${e}`);
    }
  }, []);

  // Load previous result
  useEffect(() => {
    try {
      const resultRaw = localStorage.getItem(LS_SIMULATION_RESULT);
      if (resultRaw) {
        setResult(JSON.parse(resultRaw));
        setTab("results");
      }
    } catch {
      // ignore
    }
  }, []);

  // Available rooms for the scenario builder
  const availableRooms = rooms.map((r) => ({
    spaceId: r.spaceId,
    name: r.name,
    category: r.category,
  }));

  // Run simulation
  const handleRunSimulation = useCallback(
    async (config: SimulationConfig) => {
      setIsRunning(true);
      setProgress(0);
      setError(null);

      try {
        const simResult = await runBatchSimulation({
          config,
          rooms,
          maxFloors,
          programSpecId,
          onProgress: (p) => setProgress(p),
        });

        setResult(simResult);
        setTab("results");

        // Save to localStorage
        localStorage.setItem(LS_SIMULATION_RESULT, JSON.stringify(simResult));
      } catch (e) {
        setError(`Simulation failed: ${e}`);
      } finally {
        setIsRunning(false);
        setProgress(0);
      }
    },
    [rooms, maxFloors, programSpecId],
  );

  // Export result
  const handleExport = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sentiarch-simulation-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>
          Step 5: Agent Batch Simulation
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--sa-text-secondary)" }}>
          Run comfort simulations across multiple agent cohorts and tasks.
        </p>
      </div>

      {/* Data Source Info */}
      <div
        className="sa-card"
        style={{
          padding: "10px 16px",
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 12 }}>
          <span style={{ color: "var(--sa-text-secondary)" }}>Data Source: </span>
          {dataSource === "layout" && (
            <span style={{ color: "#27ae60", fontWeight: 600 }}>Layout Result (Step 3) — {rooms.length} rooms</span>
          )}
          {dataSource === "spec+zoning" && (
            <span style={{ color: "#f39c12", fontWeight: 600 }}>
              Program Spec + Zoning (no layout) — {rooms.length} spaces
            </span>
          )}
          {dataSource === "none" && (
            <span style={{ color: "#e74c3c", fontWeight: 600 }}>
              No data found. Please complete Steps 1-3 first.
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--sa-text-secondary)" }}>
          {maxFloors} floors
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "10px 16px",
            marginBottom: 16,
            background: "#fde8e8",
            border: "1px solid #f5c6c6",
            borderRadius: 6,
            color: "#c0392b",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Progress bar */}
      {isRunning && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: "#eee",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress * 100}%`,
                background: "var(--sa-primary, #2E6B8A)",
                borderRadius: 3,
                transition: "width 0.2s",
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--sa-text-secondary)", marginTop: 4, textAlign: "center" }}>
            Running... {(progress * 100).toFixed(0)}%
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={`sa-btn ${tab === "builder" ? "sa-btn-primary" : ""}`}
          onClick={() => setTab("builder")}
        >
          Scenario Builder
        </button>
        <button
          className={`sa-btn ${tab === "results" ? "sa-btn-primary" : ""}`}
          onClick={() => setTab("results")}
          disabled={!result}
        >
          Results Dashboard
        </button>
        {result && (
          <>
            <div style={{ flex: 1 }} />
            <button className="sa-btn" onClick={handleExport}>
              Export JSON
            </button>
            <button
              className="sa-btn"
              onClick={() => {
                localStorage.setItem(LS_SIMULATION_RESULT, JSON.stringify(result));
                alert("Saved for Step 6!");
              }}
            >
              Save for Step 6
            </button>
          </>
        )}
      </div>

      {/* Tab Content */}
      {dataSource !== "none" && tab === "builder" && (
        <ScenarioBuilder
          availableRooms={availableRooms}
          onRunSimulation={handleRunSimulation}
          isRunning={isRunning}
        />
      )}
      {tab === "results" && result && <ResultsDashboard result={result} />}
    </div>
  );
}
