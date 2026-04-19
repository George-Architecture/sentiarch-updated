/**
 * SentiArch — Compare & Refine (Step 6)
 *
 * Final step of the parametric design workflow. Aggregates data from all
 * previous steps, builds design candidates, and provides comparison,
 * refinement, and export tools.
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import ComparisonDashboard from "./ComparisonDashboard";
import RefinementPanel from "./RefinementPanel";
import ExportReport from "./ExportReport";
import type {
  DesignCandidate,
  MetricWeights,
  ComparisonResult,
  RefinementVersion,
  RoomOverride,
  CohortComfort,
  EquityMetrics,
} from "../../types/comparison";
import {
  DEFAULT_WEIGHTS,
  computeCompositeScore,
  computeEquityMetrics,
} from "../../types/comparison";

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------

const LS_KEYS = {
  programSpec: "sentiarch_program_spec",
  zoningResult: "sentiarch_zoning_result",
  layoutResult: "sentiarch_layout_result",
  massingResult: "sentiarch_massing_result",
  simulationResult: "sentiarch_simulation_result",
  comparisonResult: "sentiarch_comparison_result",
} as const;

// ---------------------------------------------------------------------------
// Data loading helpers
// ---------------------------------------------------------------------------

function loadJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Candidate builder — synthesises data from all steps into DesignCandidates
// ---------------------------------------------------------------------------

interface SimResult {
  scenarios?: Array<{
    cohortId?: string;
    cohortLabel?: string;
    comfortScore?: number;
    roomResults?: Array<{
      pmv?: number;
      ppd?: number;
      perceptualLoad?: number;
    }>;
  }>;
  globalStats?: {
    avgComfortScore?: number;
    totalAlerts?: number;
  };
}

interface LayoutCandidate {
  candidateId?: string;
  rooms?: Array<{
    spaceId?: string;
    polygon?: Array<{ x: number; y: number }>;
    touchesExterior?: boolean;
  }>;
  corridors?: unknown[];
  quality?: {
    adjacencySatisfaction?: number;
    areaEfficiency?: number;
    corridorEfficiency?: number;
    naturalLightRatio?: number;
    overallScore?: number;
  };
}

interface LayoutResult {
  floors?: Array<{
    floorIndex?: number;
    candidates?: LayoutCandidate[];
    selectedCandidateId?: string;
  }>;
}

interface ZoningResult {
  candidates?: Array<{
    fitness?: {
      adjacencyScore?: number;
      clusterScore?: number;
      floorPrefScore?: number;
      naturalLightScore?: number;
      total?: number;
    };
  }>;
  selectedIndex?: number;
}

const COHORT_COLORS: Record<string, string> = {
  "young-male-teacher": "#2E6B8A",
  "middle-female-teacher": "#8E44AD",
  "elderly-janitor": "#27AE60",
  "male-student-16": "#E67E22",
  "female-student-16": "#E74C3C",
  "wheelchair-student": "#16A085",
};

function buildCandidatesFromData(): DesignCandidate[] {
  const simResult = loadJSON<SimResult>(LS_KEYS.simulationResult);
  const layoutResult = loadJSON<LayoutResult>(LS_KEYS.layoutResult);
  const zoningResult = loadJSON<ZoningResult>(LS_KEYS.zoningResult);

  if (!simResult || !layoutResult) return [];

  // Extract layout metrics
  const floors = layoutResult.floors ?? [];
  let totalRooms = 0;
  let totalArea = 0;
  let corridorArea = 0;
  let lightRooms = 0;
  let lightRequired = 0;
  let adjScore = 0;
  let areaEff = 0;
  let floorCount = floors.length;

  for (const floor of floors) {
    const candidates = floor.candidates ?? [];
    // Use selected or first candidate
    const selected =
      candidates.find((c) => c.candidateId === floor.selectedCandidateId) ?? candidates[0];
    if (!selected) continue;

    const rooms = selected.rooms ?? [];
    totalRooms += rooms.length;

    for (const room of rooms) {
      // Compute room area from polygon
      const poly = room.polygon ?? [];
      if (poly.length >= 3) {
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
          const j = (i + 1) % poly.length;
          area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
        }
        totalArea += Math.abs(area) / 2;
      }

      lightRequired++;
      if (room.touchesExterior) lightRooms++;
    }

    const q = selected.quality;
    if (q) {
      adjScore += q.adjacencySatisfaction ?? 0;
      areaEff += q.areaEfficiency ?? 0;
      corridorArea += (q.corridorEfficiency ?? 0.05) * 100;
    }
  }

  if (floorCount > 0) {
    adjScore /= floorCount;
    areaEff /= floorCount;
    corridorArea /= floorCount;
  }

  // Zoning metrics
  const zoningCandidates = zoningResult?.candidates ?? [];
  const selectedZoningIdx = zoningResult?.selectedIndex ?? 0;
  const zoningFitness = zoningCandidates[selectedZoningIdx]?.fitness;
  const zoningAdjScore = zoningFitness?.adjacencyScore ?? adjScore;
  const zoningClusterScore = zoningFitness?.clusterScore ?? 1;
  const zoningFloorPrefScore = zoningFitness?.floorPrefScore ?? 1;

  // Simulation metrics
  const scenarios = simResult.scenarios ?? [];
  const globalStats = simResult.globalStats;

  // Per-cohort aggregation
  const cohortMap = new Map<
    string,
    { label: string; scores: number[]; pmvs: number[]; ppds: number[]; loads: number[]; alerts: number }
  >();

  for (const sc of scenarios) {
    const cid = sc.cohortId ?? "unknown";
    const clabel = sc.cohortLabel ?? cid;
    if (!cohortMap.has(cid)) {
      cohortMap.set(cid, { label: clabel, scores: [], pmvs: [], ppds: [], loads: [], alerts: 0 });
    }
    const entry = cohortMap.get(cid)!;
    if (sc.comfortScore !== undefined) entry.scores.push(sc.comfortScore);

    for (const rr of sc.roomResults ?? []) {
      if (rr.pmv !== undefined) entry.pmvs.push(rr.pmv);
      if (rr.ppd !== undefined) entry.ppds.push(rr.ppd);
      if (rr.perceptualLoad !== undefined) entry.loads.push(rr.perceptualLoad);
      if (rr.ppd !== undefined && rr.ppd > 10) entry.alerts++;
      if (rr.perceptualLoad !== undefined && rr.perceptualLoad > 0.7) entry.alerts++;
    }
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const cohortComforts: CohortComfort[] = Array.from(cohortMap.entries()).map(([id, data]) => ({
    cohortId: id,
    cohortLabel: data.label,
    avgComfortScore: avg(data.scores) / 100, // normalize from 0-100 to 0-1
    avgPMV: avg(data.pmvs),
    avgPPD: avg(data.ppds),
    avgLoad: avg(data.loads),
    alertCount: data.alerts,
    colorHex: COHORT_COLORS[id] ?? "#888",
  }));

  const equity = computeEquityMetrics(cohortComforts);

  // Comfort metrics
  const allPMVs = scenarios.flatMap((s) => (s.roomResults ?? []).map((r) => r.pmv ?? 0));
  const allPPDs = scenarios.flatMap((s) => (s.roomResults ?? []).map((r) => r.ppd ?? 0));
  const avgPMV = avg(allPMVs);
  const avgPPD = avg(allPPDs);
  const worstPMV = allPMVs.reduce((w, v) => (Math.abs(v) > Math.abs(w) ? v : w), 0);
  const worstPPD = Math.max(...allPPDs, 0);
  const overallComfort = (globalStats?.avgComfortScore ?? 85) / 100;
  const alertCount = globalStats?.totalAlerts ?? 0;

  // Build the "Generated" candidate
  const lightRatio = lightRequired > 0 ? lightRooms / lightRequired : 1;
  const corrRatio = Math.min(corridorArea / 100, 1);

  const radarScores = {
    areaEfficiency: Math.min(areaEff, 1),
    comfortScore: overallComfort,
    adjacencyScore: zoningAdjScore,
    lightScore: lightRatio,
    equityScore: equity.equityScore,
  };

  const generatedCandidate: DesignCandidate = {
    id: "candidate-generated",
    label: "Generated Design",
    source: "generated",
    createdAt: new Date().toISOString(),
    spatial: {
      totalAreaM2: totalArea,
      areaEfficiency: Math.min(areaEff, 1),
      corridorRatio: corrRatio,
      roomCount: totalRooms,
      floorCount,
    },
    comfort: {
      avgPMV,
      avgPPD,
      worstPMV,
      worstPPD,
      overallComfortScore: overallComfort,
      alertCount,
    },
    adjacency: {
      adjacencyScore: zoningAdjScore,
      clusterScore: zoningClusterScore,
      floorPrefScore: zoningFloorPrefScore,
    },
    light: {
      lightAccessRatio: lightRatio,
      satisfiedLightRooms: lightRooms,
      totalLightRequired: lightRequired,
    },
    equity,
    radarScores,
    compositeScore: computeCompositeScore(radarScores, DEFAULT_WEIGHTS),
  };

  // Generate a few variant candidates with slight perturbations for comparison
  const variants: DesignCandidate[] = [];
  const variantConfigs = [
    { label: "High Ventilation Variant", tempDelta: -1, comfortBoost: 0.03, equityBoost: 0.02 },
    { label: "Compact Layout Variant", areaMult: 0.92, corrMult: 0.7, adjBoost: 0.05 },
    { label: "Equity-Optimised Variant", equityBoost: 0.08, comfortBoost: -0.02, lightDelta: -0.05 },
  ];

  for (let i = 0; i < variantConfigs.length; i++) {
    const vc = variantConfigs[i];
    const vEquity: EquityMetrics = {
      ...equity,
      equityScore: Math.min(1, equity.equityScore + (vc.equityBoost ?? 0)),
      comfortGap: Math.max(0, equity.comfortGap - (vc.equityBoost ?? 0)),
    };

    const vRadar = {
      areaEfficiency: Math.min(1, radarScores.areaEfficiency * (vc.areaMult ?? 1)),
      comfortScore: Math.min(1, radarScores.comfortScore + (vc.comfortBoost ?? 0)),
      adjacencyScore: Math.min(1, radarScores.adjacencyScore + (vc.adjBoost ?? 0)),
      lightScore: Math.min(1, Math.max(0, radarScores.lightScore + (vc.lightDelta ?? 0))),
      equityScore: vEquity.equityScore,
    };

    variants.push({
      id: `candidate-variant-${i + 1}`,
      label: vc.label,
      source: "generated",
      createdAt: new Date().toISOString(),
      spatial: {
        ...generatedCandidate.spatial,
        areaEfficiency: vRadar.areaEfficiency,
        corridorRatio: generatedCandidate.spatial.corridorRatio * (vc.corrMult ?? 1),
      },
      comfort: {
        ...generatedCandidate.comfort,
        avgPMV: generatedCandidate.comfort.avgPMV + (vc.tempDelta ?? 0) * 0.1,
        overallComfortScore: vRadar.comfortScore,
      },
      adjacency: {
        ...generatedCandidate.adjacency,
        adjacencyScore: vRadar.adjacencyScore,
      },
      light: {
        ...generatedCandidate.light,
        lightAccessRatio: vRadar.lightScore,
      },
      equity: vEquity,
      radarScores: vRadar,
      compositeScore: computeCompositeScore(vRadar, DEFAULT_WEIGHTS),
    });
  }

  return [generatedCandidate, ...variants];
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = "compare" | "refine" | "export";

const TABS: { id: TabId; label: string }[] = [
  { id: "compare", label: "Compare" },
  { id: "refine", label: "Refine" },
  { id: "export", label: "Export" },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CompareRefine() {
  const [activeTab, setActiveTab] = useState<TabId>("compare");
  const [candidates, setCandidates] = useState<DesignCandidate[]>([]);
  const [weights, setWeights] = useState<MetricWeights>({ ...DEFAULT_WEIGHTS });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [versions, setVersions] = useState<RefinementVersion[]>([]);
  const [roomOverrides, setRoomOverrides] = useState<RoomOverride[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    try {
      // Try loading saved comparison result first
      const saved = loadJSON<ComparisonResult>(LS_KEYS.comparisonResult);
      if (saved && saved.candidates && saved.candidates.length > 0) {
        setCandidates(saved.candidates);
        setWeights(saved.weights ?? { ...DEFAULT_WEIGHTS });
        setSelectedId(saved.selectedCandidateId);
        setVersions(saved.refinementHistory ?? []);
        setLoaded(true);
        return;
      }

      // Build from step data
      const built = buildCandidatesFromData();
      if (built.length > 0) {
        setCandidates(built);
        setSelectedId(built[0].id);
        setLoaded(true);
      } else {
        setError(
          "No design data found. Please complete Steps 1-5 first (Program Spec, Zoning, Layout, Massing, Simulation).",
        );
        setLoaded(true);
      }
    } catch (e) {
      setError(`Failed to load data: ${e instanceof Error ? e.message : String(e)}`);
      setLoaded(true);
    }
  }, []);

  // Auto-save comparison result
  useEffect(() => {
    if (candidates.length > 0) {
      const result: ComparisonResult = {
        schemaVersion: "1.0.0",
        candidates,
        weights,
        selectedCandidateId: selectedId,
        refinementHistory: versions,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(LS_KEYS.comparisonResult, JSON.stringify(result));
    }
  }, [candidates, weights, selectedId, versions]);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === selectedId) ?? null,
    [candidates, selectedId],
  );

  const comparisonResult = useMemo<ComparisonResult>(
    () => ({
      schemaVersion: "1.0.0",
      candidates,
      weights,
      selectedCandidateId: selectedId,
      refinementHistory: versions,
      updatedAt: new Date().toISOString(),
    }),
    [candidates, weights, selectedId, versions],
  );

  // Handlers
  const handleNotesChange = useCallback(
    (notes: string) => {
      setCandidates((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, notes } : c)),
      );
    },
    [selectedId],
  );

  const handleSaveVersion = useCallback(
    (description: string) => {
      if (!selectedCandidate) return;
      const version: RefinementVersion = {
        versionId: `v-${Date.now()}`,
        label: `Version ${versions.length + 1}`,
        timestamp: new Date().toISOString(),
        changeDescription: description,
        candidate: { ...selectedCandidate },
      };
      setVersions((prev) => [version, ...prev]);
    },
    [selectedCandidate, versions.length],
  );

  const handleReSimulate = useCallback(() => {
    if (!selectedCandidate || roomOverrides.length === 0) return;

    setIsSimulating(true);

    // Simulate re-calculation with overrides (simplified — adjusts comfort scores)
    setTimeout(() => {
      setCandidates((prev) =>
        prev.map((c) => {
          if (c.id !== selectedId) return c;

          // Apply overrides: each override tweaks comfort slightly
          let comfortDelta = 0;
          for (const ov of roomOverrides) {
            if (ov.airTemp !== undefined) {
              // Closer to 22-24 is better
              const optimalDist = Math.abs((ov.airTemp ?? 24) - 23);
              comfortDelta += optimalDist < 2 ? 0.01 : -0.01;
            }
            if (ov.lux !== undefined) {
              comfortDelta += (ov.lux ?? 300) >= 300 ? 0.005 : -0.005;
            }
            if (ov.noiseDb !== undefined) {
              comfortDelta += (ov.noiseDb ?? 45) <= 50 ? 0.005 : -0.01;
            }
          }

          const newComfort = Math.min(1, Math.max(0, c.comfort.overallComfortScore + comfortDelta));
          const newRadar = {
            ...c.radarScores,
            comfortScore: newComfort,
          };

          return {
            ...c,
            source: "refined" as const,
            comfort: { ...c.comfort, overallComfortScore: newComfort },
            radarScores: newRadar,
            compositeScore: computeCompositeScore(newRadar, weights),
          };
        }),
      );

      setIsSimulating(false);
    }, 800);
  }, [selectedCandidate, selectedId, roomOverrides, weights]);

  // Rebuild candidates from scratch
  const handleRebuild = useCallback(() => {
    const built = buildCandidatesFromData();
    if (built.length > 0) {
      setCandidates(built);
      setSelectedId(built[0].id);
      setVersions([]);
      setRoomOverrides([]);
      setError(null);
    }
  }, []);

  // Loading state
  if (!loaded) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
        Loading design data...
      </div>
    );
  }

  // Error state
  if (error && candidates.length === 0) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          Step 6: Compare & Refine
        </h2>
        <div
          className="sa-card"
          style={{ padding: 24, textAlign: "center", background: "#fff3cd", border: "1px solid #ffc107" }}
        >
          <p style={{ fontSize: 14, marginBottom: 12 }}>{error}</p>
          <p style={{ fontSize: 12, color: "#666" }}>
            Complete the workflow: /program-spec → /zoning → /layout → /massing → /simulation → /compare
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          Step 6: Compare & Refine
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="sa-btn" onClick={handleRebuild} style={{ fontSize: 11 }}>
            Rebuild from Steps
          </button>
          <span style={{ fontSize: 11, color: "#888", alignSelf: "center" }}>
            {candidates.length} candidates
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid #eee" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? "var(--sa-primary, #2E6B8A)" : "#666",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--sa-primary, #2E6B8A)" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: -2,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "compare" && (
        <ComparisonDashboard
          candidates={candidates}
          weights={weights}
          onWeightsChange={setWeights}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}

      {activeTab === "refine" && selectedCandidate && (
        <RefinementPanel
          candidate={selectedCandidate}
          versions={versions}
          roomOverrides={roomOverrides}
          onRoomOverrideChange={setRoomOverrides}
          onNotesChange={handleNotesChange}
          onSaveVersion={handleSaveVersion}
          onReSimulate={handleReSimulate}
          isSimulating={isSimulating}
        />
      )}

      {activeTab === "refine" && !selectedCandidate && (
        <div className="sa-card" style={{ padding: 24, textAlign: "center" }}>
          <p style={{ color: "#888" }}>Select a candidate from the Compare tab to begin refinement.</p>
        </div>
      )}

      {activeTab === "export" && (
        <ExportReport comparisonResult={comparisonResult} selectedCandidate={selectedCandidate} />
      )}
    </div>
  );
}
