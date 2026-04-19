/**
 * SentiArch — Agent Batch Simulation
 *
 * Main component that orchestrates the Scenario Builder, Results Dashboard,
 * and Route Simulation tabs.
 * Loads LayoutResult from localStorage (Step 3) and ProgramSpec (Step 1),
 * extracts room info, runs batch simulation, and displays results.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import ScenarioBuilder from "./ScenarioBuilder";
import ResultsDashboard from "./ResultsDashboard";
import RouteSimulationTab from "./RouteSimulationTab";
import { runBatchSimulation, type LayoutRoomInfo } from "../../engines/simulation";
import type { SimulationConfig, SimulationResult, RoomEnvironment } from "../../types/simulation";
import type { ProgramSpec } from "../../types/program";

// ---------------------------------------------------------------------------
// localStorage keys (matching Steps 1-3)
// ---------------------------------------------------------------------------

const LS_PROGRAM_SPEC = "sentiarch_program_spec";
const LS_LAYOUT_RESULT = "sentiarch_layout_result";
const LS_SELECTED_LAYOUT = "sentiarch_selected_layout";
const LS_SIMULATION_RESULT = "sentiarch_simulation_result";

// ---------------------------------------------------------------------------
// Raw types for layout parsing (supports multiple storage formats)
// ---------------------------------------------------------------------------

/** Polygon can be either flat array or { vertices: [...] } */
interface RawPolygon {
  vertices?: { x: number; y: number }[];
}

interface RawLayoutRoom {
  spaceId: string;
  polygon: { x: number; y: number }[] | RawPolygon;
  areaM2?: number;
  touchesExterior?: boolean;
}

interface RawCorridor {
  id: string;
  polygon: { x: number; y: number }[] | RawPolygon;
  areaM2?: number;
  widthM?: number;
}

interface RawCandidate {
  candidateId: string;
  rooms: RawLayoutRoom[];
  corridors?: RawCorridor[];
  quality?: Record<string, number>;
}

interface RawFloorLayout {
  floorIndex: number;
  rooms?: RawLayoutRoom[];
  corridors?: RawCorridor[];
  candidates?: RawCandidate[];
  selectedCandidateId?: string;
}

interface RawLayoutResult {
  floors: RawFloorLayout[];
}

/**
 * SelectedLayout format (from Step 3 confirm):
 * { selectedFloors: { "0": FloorLayoutCandidate, "1": ..., ... } }
 */
interface RawSelectedLayout {
  programSpecId?: string;
  zoningCandidateId?: string;
  selectedFloors: Record<
    string,
    {
      id?: string;
      floorIndex: number;
      rooms: RawLayoutRoom[];
      corridors?: RawCorridor[];
      quality?: Record<string, number>;
    }
  >;
}

// ---------------------------------------------------------------------------
// Polygon helpers
// ---------------------------------------------------------------------------

/** Normalise polygon to flat array of {x,y} regardless of storage format */
function normalisePolygon(poly: { x: number; y: number }[] | RawPolygon): { x: number; y: number }[] {
  if (Array.isArray(poly)) return poly;
  if (poly && Array.isArray(poly.vertices)) return poly.vertices;
  return [];
}

function computeCentroid(polygon: { x: number; y: number }[]): { x: number; y: number } {
  if (polygon.length === 0) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  for (const p of polygon) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / polygon.length, y: cy / polygon.length };
}

/** Calculate polygon area using shoelace formula */
function calcPolygonArea(polygon: { x: number; y: number }[]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return Math.abs(area) / 2;
}

// ---------------------------------------------------------------------------
// Extract room info from layout + program spec
// ---------------------------------------------------------------------------

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
    // Resolve rooms: support both direct rooms[] and candidates[] formats
    let floorRooms: RawLayoutRoom[] = [];
    if (floor.rooms && floor.rooms.length > 0) {
      floorRooms = floor.rooms;
    } else if (floor.candidates && floor.candidates.length > 0) {
      const selected = floor.selectedCandidateId
        ? floor.candidates.find((c) => c.candidateId === floor.selectedCandidateId)
        : floor.candidates[0];
      floorRooms = selected?.rooms ?? [];
    }

    const floorRoomIds = floorRooms.map((r) => r.spaceId);
    for (const room of floorRooms) {
      const info = spaceMap.get(room.spaceId);
      const poly = normalisePolygon(room.polygon);
      const centroid = computeCentroid(poly);
      const areaM2 = room.areaM2 ?? calcPolygonArea(poly);

      rooms.push({
        spaceId: room.spaceId,
        name: info?.name ?? room.spaceId,
        category: info?.category ?? "unknown",
        floorIndex: floor.floorIndex,
        areaM2,
        touchesExterior: room.touchesExterior ?? false,
        colorHex: info?.colorHex ?? "#999999",
        adjacentRoomIds: floorRoomIds.filter((id) => id !== room.spaceId),
        centroidX: centroid.x,
        centroidY: centroid.y,
      });
    }
  }

  return rooms;
}

/** Extract corridor info from layout for route graph building */
function extractCorridorInfo(
  layout: RawLayoutResult,
): { id: string; x: number; y: number; areaM2: number; floorIndex: number }[] {
  const corridors: { id: string; x: number; y: number; areaM2: number; floorIndex: number }[] = [];
  for (const floor of layout.floors) {
    // Support both direct corridors[] and candidates[] formats
    let floorCorridors: RawCorridor[] = [];
    if (floor.corridors && floor.corridors.length > 0) {
      floorCorridors = floor.corridors;
    } else if (floor.candidates && floor.candidates.length > 0) {
      const selected = floor.selectedCandidateId
        ? floor.candidates.find((c) => c.candidateId === floor.selectedCandidateId)
        : floor.candidates[0];
      floorCorridors = selected?.corridors ?? [];
    }

    for (const corr of floorCorridors) {
      const poly = normalisePolygon(corr.polygon);
      const centroid = computeCentroid(poly);
      corridors.push({
        id: corr.id,
        x: centroid.x,
        y: centroid.y,
        areaM2: corr.areaM2 ?? calcPolygonArea(poly),
        floorIndex: floor.floorIndex,
      });
    }
  }
  return corridors;
}

/**
 * Convert SelectedLayout format to our internal RawLayoutResult format.
 * SelectedLayout uses `selectedFloors: Record<string, FloorLayoutCandidate>`.
 * Polygon format is `{ vertices: [{x,y},...] }`.
 */
function selectedLayoutToRaw(selected: RawSelectedLayout): RawLayoutResult {
  const floors: RawFloorLayout[] = [];
  for (const [, floor] of Object.entries(selected.selectedFloors)) {
    floors.push({
      floorIndex: floor.floorIndex,
      rooms: floor.rooms ?? [],
      corridors: floor.corridors ?? [],
    });
  }
  // Sort by floorIndex
  floors.sort((a, b) => a.floorIndex - b.floorIndex);
  return { floors };
}

function extractRoomInfoFromSpec(spec: ProgramSpec): LayoutRoomInfo[] {
  // Try to get floor assignments from zoning
  const floorAssignments = new Map<string, number>();
  try {
    const zoningRaw = localStorage.getItem("sentiarch_selected_zoning");
    if (zoningRaw) {
      const zoning = JSON.parse(zoningRaw);
      if (zoning.floorAssignments) {
        for (const fa of zoning.floorAssignments) {
          for (const sid of fa.spaceIds ?? []) {
            floorAssignments.set(sid, fa.floorIndex);
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // Generate grid-like centroids for fallback (no real layout)
  let idx = 0;
  return spec.spaces.map((s) => {
    const col = idx % 5;
    const row = Math.floor(idx / 5);
    idx++;
    return {
      spaceId: s.id,
      name: s.name,
      category: s.category,
      floorIndex: floorAssignments.get(s.id) ?? (s.floorMandatory ?? 0),
      areaM2: s.areaPerUnit * s.quantity,
      touchesExterior: s.requiredFeatures?.includes("natural_light") ?? false,
      colorHex: s.colorHex ?? "#999999",
      adjacentRoomIds: [],
      centroidX: col * 12 + 6,
      centroidY: row * 10 + 5,
    };
  });
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

type TabId = "builder" | "results" | "route";

export default function AgentSimulation() {
  const [tab, setTab] = useState<TabId>("builder");
  const [rooms, setRooms] = useState<LayoutRoomInfo[]>([]);
  const [corridors, setCorridors] = useState<
    { id: string; x: number; y: number; areaM2: number; floorIndex: number }[]
  >([]);
  const [maxFloors, setMaxFloors] = useState(6);
  const [programSpecId, setProgramSpecId] = useState("unknown");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string>("none");

  // Environment overrides for route simulation (shared state)
  const envOverrides = useMemo(() => new Map<string, RoomEnvironment>(), []);

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

      // Priority 1: Try sentiarch_selected_layout (confirmed layout from Step 3)
      const selectedRaw = localStorage.getItem(LS_SELECTED_LAYOUT);
      if (selectedRaw) {
        try {
          const selected = JSON.parse(selectedRaw) as RawSelectedLayout;
          if (selected.selectedFloors && Object.keys(selected.selectedFloors).length > 0) {
            const layout = selectedLayoutToRaw(selected);
            const extracted = extractRoomInfo(layout, spec);
            if (extracted.length > 0) {
              setRooms(extracted);
              setCorridors(extractCorridorInfo(layout));
              setDataSource("layout");
              return;
            }
          }
        } catch {
          // fall through to next source
        }
      }

      // Priority 2: Try sentiarch_layout_result (raw layout candidates)
      const layoutRaw = localStorage.getItem(LS_LAYOUT_RESULT);
      if (layoutRaw) {
        const layout = JSON.parse(layoutRaw) as RawLayoutResult;
        if (layout.floors && layout.floors.length > 0) {
          const extracted = extractRoomInfo(layout, spec);
          if (extracted.length > 0) {
            setRooms(extracted);
            setCorridors(extractCorridorInfo(layout));
            setDataSource("layout");
            return;
          }
        }
      }

      // Fallback: create rooms from spec + zoning
      if (spec) {
        const extracted = extractRoomInfoFromSpec(spec);
        setRooms(extracted);
        setCorridors([]);
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
        setError(`Simulation failed: ${e instanceof Error ? e.message : String(e)}`);
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
          Step 5: Agent Simulation
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--sa-text-secondary)" }}>
          Run comfort simulations — static dwell analysis or movement route simulation.
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
            <span style={{ color: "#27ae60", fontWeight: 600 }}>
              Layout Result (Step 3) — {rooms.length} rooms, {corridors.length} corridors
            </span>
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
          {new Set(rooms.map((r) => r.floorIndex)).size} floors
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
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          className={`sa-btn ${tab === "builder" ? "sa-btn-primary" : ""}`}
          onClick={() => setTab("builder")}
        >
          Static Dwell
        </button>
        <button
          className={`sa-btn ${tab === "route" ? "sa-btn-primary" : ""}`}
          onClick={() => setTab("route")}
          disabled={dataSource === "none"}
        >
          Route Simulation
        </button>
        <button
          className={`sa-btn ${tab === "results" ? "sa-btn-primary" : ""}`}
          onClick={() => setTab("results")}
          disabled={!result}
        >
          Batch Results
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
      {dataSource !== "none" && tab === "route" && (
        <RouteSimulationTab
          rooms={rooms}
          corridors={corridors}
          maxFloors={maxFloors}
          envOverrides={envOverrides}
        />
      )}
    </div>
  );
}
