/**
 * SentiArch — Compare & Refine (Step 6)
 *
 * Final step of the parametric design workflow. Aggregates data from all
 * previous steps, builds design candidates, and provides comparison,
 * refinement, and export tools.
 *
 * Data loading strategy:
 *   - Program Spec (Step 1): required — sentiarch_program_spec
 *   - Zoning (Step 2): optional — sentiarch_selected_zoning || sentiarch_zoning_result
 *   - Layout (Step 3): optional — sentiarch_selected_layout || sentiarch_layout_result
 *   - Simulation (Step 5): optional — sentiarch_simulation_result
 *   - If at least Program Spec exists, we can build a basic comparison.
 *   - Missing steps show "Step X data not available" instead of crashing.
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
// localStorage keys — aligned with actual storage from each step
// ---------------------------------------------------------------------------

const LS_KEYS = {
  programSpec: "sentiarch_program_spec",
  zoningResult: "sentiarch_zoning_result",
  selectedZoning: "sentiarch_selected_zoning",
  layoutResult: "sentiarch_layout_result",
  selectedLayout: "sentiarch_selected_layout",
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
// Loose types for reading upstream data (tolerant of shape variations)
// ---------------------------------------------------------------------------

/**
 * Simulation result — reads the canonical SimulationResult shape
 * from types/simulation.ts, with optional fallback fields.
 */
interface SimResult {
  // Canonical shape (from types/simulation.ts)
  scenarioResults?: Array<{
    cohortId?: string;
    routeComfort?: Array<{
      pmv?: number;
      ppd?: number;
      aggregateLoad?: number;
      isAlert?: boolean;
    }>;
    destinationComfort?: {
      pmv?: number;
      ppd?: number;
      aggregateLoad?: number;
      isAlert?: boolean;
    };
    combinedScore?: number;
  }>;
  cohortSummaries?: Array<{
    cohortId?: string;
    cohortLabel?: string;
    avgScore?: number;
    worstScore?: number;
    alertCount?: number;
    colorHex?: string;
  }>;
  statistics?: {
    avgScore?: number;
    totalAlerts?: number;
  };
  // Legacy shape (fallback)
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

/**
 * Selected layout — reads from sentiarch_selected_layout
 * (canonical shape from types/layout.ts SelectedLayout)
 */
interface SelectedLayoutData {
  selectedFloors?: Record<
    string,
    {
      floorIndex?: number;
      rooms?: Array<{
        spaceId?: string;
        polygon?: Array<{ x: number; y: number }>;
        touchesExterior?: boolean;
        areaM2?: number;
      }>;
      corridors?: unknown[];
      quality?: {
        adjacencySatisfaction?: number;
        areaEfficiency?: number;
        corridorRatio?: number;
        naturalLightAccess?: number;
        totalScore?: number;
      };
    }
  >;
}

/**
 * Layout result — reads from sentiarch_layout_result (legacy shape)
 */
interface LayoutResultData {
  floors?: Array<{
    floorIndex?: number;
    candidates?: Array<{
      candidateId?: string;
      rooms?: Array<{
        spaceId?: string;
        polygon?: Array<{ x: number; y: number }>;
        touchesExterior?: boolean;
        areaM2?: number;
      }>;
      corridors?: unknown[];
      quality?: {
        adjacencySatisfaction?: number;
        areaEfficiency?: number;
        corridorEfficiency?: number;
        naturalLightRatio?: number;
        overallScore?: number;
      };
    }>;
    selectedCandidateId?: string;
  }>;
  // Also support floorCandidates shape from canonical LayoutResult
  floorCandidates?: Record<
    string,
    Array<{
      id?: string;
      floorIndex?: number;
      rooms?: Array<{
        spaceId?: string;
        polygon?: Array<{ x: number; y: number }>;
        touchesExterior?: boolean;
        areaM2?: number;
      }>;
      quality?: {
        adjacencySatisfaction?: number;
        areaEfficiency?: number;
        corridorRatio?: number;
        naturalLightAccess?: number;
        totalScore?: number;
      };
    }>
  >;
}

/**
 * Zoning result — reads from sentiarch_selected_zoning or sentiarch_zoning_result
 * Uses canonical field names: floorScore, lightScore, totalScore
 */
interface ZoningData {
  // sentiarch_selected_zoning shape
  fitness?: {
    adjacencyScore?: number;
    clusterScore?: number;
    floorScore?: number;
    lightScore?: number;
    totalScore?: number;
  };
  // sentiarch_zoning_result shape
  candidates?: Array<{
    fitness?: {
      adjacencyScore?: number;
      clusterScore?: number;
      floorScore?: number;
      lightScore?: number;
      totalScore?: number;
    };
  }>;
  selectedIndex?: number;
}

// ---------------------------------------------------------------------------
// Step data availability tracking
// ---------------------------------------------------------------------------

interface StepDataStatus {
  programSpec: boolean;
  zoning: boolean;
  layout: boolean;
  simulation: boolean;
}

const COHORT_COLORS: Record<string, string> = {
  "young-male-teacher": "#2E6B8A",
  "middle-female-teacher": "#8E44AD",
  "elderly-janitor": "#27AE60",
  "male-student-16": "#E67E22",
  "female-student-16": "#E74C3C",
  "wheelchair-student": "#16A085",
};

// ---------------------------------------------------------------------------
// Candidate builder — synthesises data from available steps
// ---------------------------------------------------------------------------

function buildCandidatesFromData(): {
  candidates: DesignCandidate[];
  status: StepDataStatus;
  missingSteps: string[];
} {
  const status: StepDataStatus = {
    programSpec: false,
    zoning: false,
    layout: false,
    simulation: false,
  };
  const missingSteps: string[] = [];

  // ---- Load Program Spec (Step 1) — required ----
  const programSpec = loadJSON<{ spaces?: Array<{ id: string; areaPerUnit: number; quantity: number }> }>(
    LS_KEYS.programSpec,
  );
  if (programSpec?.spaces) {
    status.programSpec = true;
  } else {
    missingSteps.push("Step 1 (Program Spec) data not available");
    return { candidates: [], status, missingSteps };
  }

  // ---- Load Zoning (Step 2) ----
  // Try selected zoning first, then fall back to zoning result
  let zoningFitness: {
    adjacencyScore: number;
    clusterScore: number;
    floorScore: number;
  } = { adjacencyScore: 0.5, clusterScore: 0.5, floorScore: 0.5 };

  const selectedZoning = loadJSON<ZoningData>(LS_KEYS.selectedZoning);
  const zoningResult = loadJSON<ZoningData>(LS_KEYS.zoningResult);

  if (selectedZoning?.fitness) {
    status.zoning = true;
    zoningFitness = {
      adjacencyScore: selectedZoning.fitness.adjacencyScore ?? 0.5,
      clusterScore: selectedZoning.fitness.clusterScore ?? 0.5,
      floorScore: selectedZoning.fitness.floorScore ?? 0.5,
    };
  } else if (zoningResult?.candidates && zoningResult.candidates.length > 0) {
    status.zoning = true;
    const idx = zoningResult.selectedIndex ?? 0;
    const candidate = zoningResult.candidates[idx] ?? zoningResult.candidates[0];
    if (candidate?.fitness) {
      zoningFitness = {
        adjacencyScore: candidate.fitness.adjacencyScore ?? 0.5,
        clusterScore: candidate.fitness.clusterScore ?? 0.5,
        floorScore: candidate.fitness.floorScore ?? 0.5,
      };
    }
  } else {
    missingSteps.push("Step 2 (Zoning) data not available");
  }

  // ---- Load Layout (Step 3) ----
  // Try selected layout first (canonical), then layout result (legacy)
  let totalRooms = 0;
  let totalArea = 0;
  let lightRooms = 0;
  let lightRequired = 0;
  let adjScore = zoningFitness.adjacencyScore;
  let areaEff = 0;
  let corridorArea = 0;
  let floorCount = 0;

  const selectedLayout = loadJSON<SelectedLayoutData>(LS_KEYS.selectedLayout);
  const layoutResult = loadJSON<LayoutResultData>(LS_KEYS.layoutResult);

  if (selectedLayout?.selectedFloors) {
    status.layout = true;
    const floors = Object.values(selectedLayout.selectedFloors);
    floorCount = floors.length;

    for (const floor of floors) {
      const rooms = floor.rooms ?? [];
      totalRooms += rooms.length;

      for (const room of rooms) {
        // Use areaM2 if available, otherwise compute from polygon
        if (room.areaM2) {
          totalArea += room.areaM2;
        } else {
          const poly = room.polygon ?? [];
          if (poly.length >= 3) {
            let area = 0;
            for (let i = 0; i < poly.length; i++) {
              const j = (i + 1) % poly.length;
              area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
            }
            totalArea += Math.abs(area) / 2;
          }
        }

        lightRequired++;
        if (room.touchesExterior) lightRooms++;
      }

      const q = floor.quality;
      if (q) {
        adjScore += q.adjacencySatisfaction ?? 0;
        areaEff += q.areaEfficiency ?? 0;
        corridorArea += (q.corridorRatio ?? 0.05) * 100;
      }
    }

    if (floorCount > 0) {
      adjScore /= floorCount + 1; // +1 because we started with zoning adj
      areaEff /= floorCount;
      corridorArea /= floorCount;
    }
  } else if (layoutResult) {
    // Try canonical floorCandidates shape
    if (layoutResult.floorCandidates) {
      status.layout = true;
      const entries = Object.values(layoutResult.floorCandidates);
      floorCount = entries.length;

      for (const candidates of entries) {
        const selected = candidates[0]; // Use first (best) candidate
        if (!selected) continue;

        const rooms = selected.rooms ?? [];
        totalRooms += rooms.length;

        for (const room of rooms) {
          if (room.areaM2) {
            totalArea += room.areaM2;
          } else {
            const poly = room.polygon ?? [];
            if (poly.length >= 3) {
              let area = 0;
              for (let i = 0; i < poly.length; i++) {
                const j = (i + 1) % poly.length;
                area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
              }
              totalArea += Math.abs(area) / 2;
            }
          }

          lightRequired++;
          if (room.touchesExterior) lightRooms++;
        }

        const q = selected.quality;
        if (q) {
          adjScore += q.adjacencySatisfaction ?? 0;
          areaEff += q.areaEfficiency ?? 0;
          corridorArea += (q.corridorRatio ?? 0.05) * 100;
        }
      }

      if (floorCount > 0) {
        adjScore /= floorCount + 1;
        areaEff /= floorCount;
        corridorArea /= floorCount;
      }
    }
    // Try legacy floors shape
    else if (layoutResult.floors && layoutResult.floors.length > 0) {
      status.layout = true;
      const floors = layoutResult.floors;
      floorCount = floors.length;

      for (const floor of floors) {
        const candidates = floor.candidates ?? [];
        const selected =
          candidates.find((c) => c.candidateId === floor.selectedCandidateId) ?? candidates[0];
        if (!selected) continue;

        const rooms = selected.rooms ?? [];
        totalRooms += rooms.length;

        for (const room of rooms) {
          if (room.areaM2) {
            totalArea += room.areaM2;
          } else {
            const poly = room.polygon ?? [];
            if (poly.length >= 3) {
              let area = 0;
              for (let i = 0; i < poly.length; i++) {
                const j = (i + 1) % poly.length;
                area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
              }
              totalArea += Math.abs(area) / 2;
            }
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
        adjScore /= floorCount + 1;
        areaEff /= floorCount;
        corridorArea /= floorCount;
      }
    }
  }

  if (!status.layout) {
    missingSteps.push("Step 3 (Layout) data not available");
    // Use program spec for basic area estimates
    totalArea = programSpec.spaces!.reduce((sum, s) => sum + s.areaPerUnit * s.quantity, 0);
    totalRooms = programSpec.spaces!.length;
    floorCount = 6; // default
    areaEff = 0.7; // reasonable default
  }

  // ---- Load Simulation (Step 5) ----
  const simResult = loadJSON<SimResult>(LS_KEYS.simulationResult);

  let overallComfort = 0.85; // default
  let avgPMV = 0;
  let avgPPD = 10;
  let worstPMV = 0;
  let worstPPD = 0;
  let alertCount = 0;
  let cohortComforts: CohortComfort[] = [];

  if (simResult) {
    // Try canonical shape first (types/simulation.ts)
    if (simResult.cohortSummaries && simResult.cohortSummaries.length > 0) {
      status.simulation = true;

      cohortComforts = simResult.cohortSummaries.map((cs) => ({
        cohortId: cs.cohortId ?? "unknown",
        cohortLabel: cs.cohortLabel ?? cs.cohortId ?? "Unknown",
        avgComfortScore: Math.min(1, (cs.avgScore ?? 0.85)),
        avgPMV: 0,
        avgPPD: 0,
        avgLoad: 0,
        alertCount: cs.alertCount ?? 0,
        colorHex: cs.colorHex ?? COHORT_COLORS[cs.cohortId ?? ""] ?? "#888",
      }));

      // Aggregate PMV/PPD from scenario results
      const allPMVs: number[] = [];
      const allPPDs: number[] = [];
      for (const sr of simResult.scenarioResults ?? []) {
        for (const rc of sr.routeComfort ?? []) {
          if (rc.pmv !== undefined) allPMVs.push(rc.pmv);
          if (rc.ppd !== undefined) allPPDs.push(rc.ppd);
        }
        if (sr.destinationComfort) {
          if (sr.destinationComfort.pmv !== undefined) allPMVs.push(sr.destinationComfort.pmv);
          if (sr.destinationComfort.ppd !== undefined) allPPDs.push(sr.destinationComfort.ppd);
        }
      }

      const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
      avgPMV = avg(allPMVs);
      avgPPD = avg(allPPDs);
      worstPMV = allPMVs.reduce((w, v) => (Math.abs(v) > Math.abs(w) ? v : w), 0);
      worstPPD = Math.max(...allPPDs, 0);
      overallComfort = Math.min(1, simResult.statistics?.avgScore ?? 0.85);
      alertCount = simResult.statistics?.totalAlerts ?? 0;
    }
    // Try legacy shape
    else if (simResult.scenarios && simResult.scenarios.length > 0) {
      status.simulation = true;

      const cohortMap = new Map<
        string,
        { label: string; scores: number[]; pmvs: number[]; ppds: number[]; loads: number[]; alerts: number }
      >();

      for (const sc of simResult.scenarios) {
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

      cohortComforts = Array.from(cohortMap.entries()).map(([id, data]) => ({
        cohortId: id,
        cohortLabel: data.label,
        avgComfortScore: avg(data.scores) / 100,
        avgPMV: avg(data.pmvs),
        avgPPD: avg(data.ppds),
        avgLoad: avg(data.loads),
        alertCount: data.alerts,
        colorHex: COHORT_COLORS[id] ?? "#888",
      }));

      const allPMVs = simResult.scenarios.flatMap((s) => (s.roomResults ?? []).map((r) => r.pmv ?? 0));
      const allPPDs = simResult.scenarios.flatMap((s) => (s.roomResults ?? []).map((r) => r.ppd ?? 0));
      avgPMV = avg(allPMVs);
      avgPPD = avg(allPPDs);
      worstPMV = allPMVs.reduce((w, v) => (Math.abs(v) > Math.abs(w) ? v : w), 0);
      worstPPD = Math.max(...allPPDs, 0);
      overallComfort = (simResult.globalStats?.avgComfortScore ?? 85) / 100;
      alertCount = simResult.globalStats?.totalAlerts ?? 0;
    }
  }

  if (!status.simulation) {
    missingSteps.push("Step 5 (Simulation) data not available — using default comfort values");
  }

  // ---- Compute equity ----
  const equity = computeEquityMetrics(cohortComforts);

  // ---- Build the "Generated" candidate ----
  const lightRatio = lightRequired > 0 ? lightRooms / lightRequired : status.layout ? 0.5 : 0.7;
  const corrRatio = Math.min(corridorArea / 100, 1);

  const radarScores = {
    areaEfficiency: Math.min(areaEff || 0.7, 1),
    comfortScore: overallComfort,
    adjacencyScore: Math.min(adjScore || 0.5, 1),
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
      areaEfficiency: Math.min(areaEff || 0.7, 1),
      corridorRatio: corrRatio,
      roomCount: totalRooms,
      floorCount: floorCount || 6,
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
      adjacencyScore: Math.min(zoningFitness.adjacencyScore, 1),
      clusterScore: Math.min(zoningFitness.clusterScore, 1),
      floorPrefScore: Math.min(zoningFitness.floorScore, 1),
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

  // Generate variant candidates with slight perturbations for comparison
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

  return {
    candidates: [generatedCandidate, ...variants],
    status,
    missingSteps,
  };
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
  const [dataStatus, setDataStatus] = useState<StepDataStatus>({
    programSpec: false,
    zoning: false,
    layout: false,
    simulation: false,
  });
  const [missingSteps, setMissingSteps] = useState<string[]>([]);

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
      const result = buildCandidatesFromData();
      setDataStatus(result.status);
      setMissingSteps(result.missingSteps);

      if (result.candidates.length > 0) {
        setCandidates(result.candidates);
        setSelectedId(result.candidates[0].id);
        setLoaded(true);
      } else {
        setError(
          "No design data found. Please complete at least Step 1 (Program Spec) to begin comparison.",
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
    // Clear saved comparison so we rebuild from step data
    localStorage.removeItem(LS_KEYS.comparisonResult);

    const result = buildCandidatesFromData();
    setDataStatus(result.status);
    setMissingSteps(result.missingSteps);

    if (result.candidates.length > 0) {
      setCandidates(result.candidates);
      setSelectedId(result.candidates[0].id);
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

      {/* Data availability banner */}
      {missingSteps.length > 0 && (
        <div
          style={{
            padding: "10px 16px",
            marginBottom: 16,
            background: "#f0f4ff",
            border: "1px solid #c5d5f0",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, color: "#2E6B8A" }}>
            Data Availability
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ color: dataStatus.programSpec ? "#27ae60" : "#e74c3c" }}>
              {dataStatus.programSpec ? "✓" : "✗"} Program Spec
            </span>
            <span style={{ color: dataStatus.zoning ? "#27ae60" : "#e74c3c" }}>
              {dataStatus.zoning ? "✓" : "✗"} Zoning
            </span>
            <span style={{ color: dataStatus.layout ? "#27ae60" : "#e74c3c" }}>
              {dataStatus.layout ? "✓" : "✗"} Layout
            </span>
            <span style={{ color: dataStatus.simulation ? "#27ae60" : "#e74c3c" }}>
              {dataStatus.simulation ? "✓" : "✗"} Simulation
            </span>
          </div>
          {missingSteps.map((msg, i) => (
            <div key={i} style={{ color: "#666", fontSize: 11 }}>
              {msg}
            </div>
          ))}
          <div style={{ color: "#888", fontSize: 11, marginTop: 4, fontStyle: "italic" }}>
            Missing data uses default values. Run the missing steps and click &quot;Rebuild from Steps&quot; to update.
          </div>
        </div>
      )}

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
