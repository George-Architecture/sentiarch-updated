// ============================================================
// ZoningStrategy — Main Component
//
// Input panel, candidate overview, floor visualization,
// manual adjustment, confirm & export.
// ============================================================

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import type { ProgramSpec } from "@/types/program";
import type {
  ZoningResult,
  ZoningCandidate,
  FloorAssignment,
  FitnessBreakdown,
  SelectedZoning,
} from "@/types/zoning";
import {
  runZoningGA,
  reEvaluateCandidate,
  DEFAULT_GA_PARAMS,
  DEFAULT_FITNESS_WEIGHTS,
} from "@/engines/zoning";
import CandidateCard from "./CandidateCard";
import FloorStrip from "./FloorStrip";

// ---- Category Colors (match Step 1) ----------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  academic: "#4A90D9",
  art: "#9B59B6",
  science: "#27AE60",
  public: "#E67E22",
  sport: "#E74C3C",
  support: "#95A5A6",
  residential: "#F39C12",
  admin: "#8E44AD",
};

// ---- Storage Keys ----------------------------------------------------

const SPEC_STORAGE_KEY = "sentiarch_program_spec";
const ZONING_STORAGE_KEY = "sentiarch_zoning_result";
const SELECTED_ZONING_KEY = "sentiarch_selected_zoning";

// ---- Component -------------------------------------------------------

export default function ZoningStrategy() {
  // Source data
  const [spec, setSpec] = useState<ProgramSpec | null>(null);

  // GA state
  const [result, setResult] = useState<ZoningResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ gen: 0, total: 0, best: 0 });

  // Selected candidate for detail view / manual adjustment
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Manually adjusted floors (overrides candidate data)
  const [adjustedFloors, setAdjustedFloors] = useState<
    FloorAssignment[] | null
  >(null);
  const [adjustedFitness, setAdjustedFitness] =
    useState<FitnessBreakdown | null>(null);

  // Score flash feedback
  const [scoreFlash, setScoreFlash] = useState<"up" | "down" | null>(
    null
  );

  // Drag state
  const dragRef = useRef<{
    spaceId: string;
    fromFloor: number;
  } | null>(null);

  // ---- Load ProgramSpec from localStorage ----------------------------

  useEffect(() => {
    const raw = localStorage.getItem(SPEC_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setSpec(parsed as ProgramSpec);
      } catch {
        /* ignore */
      }
    }
  }, []);

  // ---- Space lookup --------------------------------------------------

  const spaceMap = useCallback(() => {
    if (!spec) return new Map();
    const m = new Map<string, (typeof spec.spaces)[number]>();
    for (const s of spec.spaces) m.set(s.id, s);
    return m;
  }, [spec]);

  // ---- Run GA --------------------------------------------------------

  const handleGenerate = useCallback(async () => {
    if (!spec) return;
    setRunning(true);
    setResult(null);
    setAdjustedFloors(null);
    setAdjustedFitness(null);
    setSelectedIdx(0);

    try {
      const zoningResult = await runZoningGA(
        spec,
        DEFAULT_GA_PARAMS,
        DEFAULT_FITNESS_WEIGHTS,
        (gen, total, best) => {
          setProgress({ gen, total, best });
        }
      );
      setResult(zoningResult);
      localStorage.setItem(
        ZONING_STORAGE_KEY,
        JSON.stringify(zoningResult)
      );
      toast.success(
        `Generated ${zoningResult.candidates.length} candidates in ${Math.round(zoningResult.computeTimeMs)}ms`
      );
    } catch (e) {
      toast.error(`GA failed: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }, [spec]);

  // ---- Get active candidate / floors ---------------------------------

  const activeCandidate: ZoningCandidate | null =
    result?.candidates[selectedIdx] ?? null;

  const activeFloors: FloorAssignment[] =
    adjustedFloors ?? activeCandidate?.floors ?? [];

  const activeFitness: FitnessBreakdown =
    adjustedFitness ?? activeCandidate?.fitness ?? {
      adjacencyScore: 0,
      clusterScore: 0,
      floorScore: 0,
      lightScore: 0,
      totalScore: 0,
    };

  // ---- Manual Adjustment: Drag & Drop --------------------------------

  const handleDragStart = useCallback(
    (spaceId: string, fromFloor: number) => {
      dragRef.current = { spaceId, fromFloor };
    },
    []
  );

  const handleDropOnFloor = useCallback(
    (targetFloor: number) => {
      if (!dragRef.current || !spec) return;
      const { spaceId, fromFloor } = dragRef.current;
      dragRef.current = null;

      if (fromFloor === targetFloor) return;

      // Check if space has floorMandatory
      const space = spaceMap().get(spaceId);
      if (space?.floorMandatory !== undefined) {
        toast.error(
          `${space.name} has a mandatory floor constraint (floor ${space.floorMandatory})`
        );
        return;
      }

      const prevScore = activeFitness.totalScore;

      // Clone current floors
      const newFloors: FloorAssignment[] = activeFloors.map((f) => ({
        ...f,
        spaceIds: [...f.spaceIds],
        totalAreaM2: f.totalAreaM2,
      }));

      // Remove from source floor
      const srcFloor = newFloors.find((f) => f.floorIndex === fromFloor);
      if (srcFloor) {
        srcFloor.spaceIds = srcFloor.spaceIds.filter(
          (id) => id !== spaceId
        );
      }

      // Add to target floor
      const dstFloor = newFloors.find(
        (f) => f.floorIndex === targetFloor
      );
      if (dstFloor) {
        dstFloor.spaceIds.push(spaceId);
      }

      // Recalculate areas
      const sm = spaceMap();
      for (const f of newFloors) {
        f.totalAreaM2 = f.spaceIds.reduce((sum, id) => {
          const s = sm.get(id);
          return sum + (s ? s.quantity * s.areaPerUnit : 0);
        }, 0);
      }

      // Re-evaluate fitness
      const newFitness = reEvaluateCandidate(
        newFloors,
        spec,
        DEFAULT_FITNESS_WEIGHTS
      );

      setAdjustedFloors(newFloors);
      setAdjustedFitness(newFitness);

      // Flash feedback
      if (newFitness.totalScore > prevScore) {
        setScoreFlash("up");
        toast.success("Score improved!");
      } else if (newFitness.totalScore < prevScore) {
        setScoreFlash("down");
        toast.error("Score decreased");
      }
      setTimeout(() => setScoreFlash(null), 800);
    },
    [activeFloors, activeFitness, spec, spaceMap]
  );

  // ---- Switch candidate resets adjustments ----------------------------

  const handleSelectCandidate = useCallback((idx: number) => {
    setSelectedIdx(idx);
    setAdjustedFloors(null);
    setAdjustedFitness(null);
  }, []);

  // ---- Confirm & Export -----------------------------------------------

  const handleConfirm = useCallback(() => {
    if (!spec || !activeCandidate) return;

    const selected: SelectedZoning = {
      programSpecId: spec.id,
      candidateId: activeCandidate.id,
      floors: activeFloors,
      fitness: activeFitness,
      confirmedAt: new Date().toISOString(),
    };

    localStorage.setItem(SELECTED_ZONING_KEY, JSON.stringify(selected));
    toast.success("Zoning confirmed and saved!");
  }, [spec, activeCandidate, activeFloors, activeFitness]);

  const handleExport = useCallback(() => {
    if (!activeCandidate) return;

    const exportData = {
      candidateId: activeCandidate.id,
      floors: activeFloors,
      fitness: activeFitness,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zoning_result.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Exported zoning result");
  }, [activeCandidate, activeFloors, activeFitness]);

  // ---- Render --------------------------------------------------------

  if (!spec) {
    return (
      <div className="space-y-4">
        <div className="sa-card" style={{ padding: "40px 20px", textAlign: "center" }}>
          <h3
            className="text-base font-semibold mb-2"
            style={{ color: "var(--foreground)" }}
          >
            No Programme Specification Found
          </h3>
          <p
            className="text-sm mb-4"
            style={{ color: "var(--muted-foreground)" }}
          >
            Please complete Step 1 (Programme Specification Editor) and save
            your specification first.
          </p>
          <a href="/program-spec" className="sa-btn sa-btn-primary">
            Go to Programme Spec Editor
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Input Panel */}
      <div className="sa-card" style={{ padding: "12px 16px" }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <p
              className="text-xs font-semibold"
              style={{ color: "var(--muted-foreground)" }}
            >
              Source Specification
            </p>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--foreground)" }}
            >
              {spec.name}
            </p>
            <p
              className="text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              {spec.spaces.length} spaces, {spec.constraints.maxFloors}{" "}
              floors,{" "}
              {spec.spaces
                .reduce((s, sp) => s + sp.quantity * sp.areaPerUnit, 0)
                .toLocaleString()}{" "}
              m² total
            </p>
          </div>

          <button
            className="sa-btn sa-btn-primary"
            onClick={handleGenerate}
            disabled={running}
          >
            {running ? "Generating..." : "Generate 5 Candidates"}
          </button>
        </div>

        {/* Progress bar */}
        {running && (
          <div className="mt-3">
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: "var(--muted-foreground)" }}>
                Generation {progress.gen} / {progress.total}
              </span>
              <span style={{ color: "var(--primary)" }}>
                Best: {progress.best.toFixed(4)}
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 3,
                background: "var(--muted)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(progress.gen / Math.max(progress.total, 1)) * 100}%`,
                  background: "var(--primary)",
                  borderRadius: 3,
                  transition: "width 0.1s",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {result && result.candidates.length > 0 && (
        <>
          {/* Computation summary */}
          <div className="flex flex-wrap gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
            <span>
              Computed in {Math.round(result.computeTimeMs)}ms
            </span>
            <span>|</span>
            <span>
              Pop: {result.gaParams.populationSize}, Gen:{" "}
              {result.gaParams.generations}
            </span>
          </div>

          {/* Candidates Overview */}
          <div>
            <h3
              className="text-sm font-semibold mb-2"
              style={{ color: "var(--foreground)" }}
            >
              Candidates
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {result.candidates.map((candidate, idx) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  isSelected={idx === selectedIdx}
                  isBest={idx === 0}
                  isAdjusted={idx === selectedIdx && adjustedFloors !== null}
                  adjustedFitness={
                    idx === selectedIdx ? adjustedFitness : null
                  }
                  onClick={() => handleSelectCandidate(idx)}
                  categoryColors={CATEGORY_COLORS}
                  spaces={spec.spaces}
                />
              ))}
            </div>
          </div>

          {/* Floor Visualization for selected candidate */}
          {activeCandidate && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3
                  className="text-sm font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  Floor Breakdown — {activeCandidate.id}
                  {adjustedFloors ? " (adjusted)" : ""}
                </h3>

                {/* Score with flash */}
                <span
                  className="text-sm font-bold transition-colors"
                  style={{
                    color:
                      scoreFlash === "up"
                        ? "#27AE60"
                        : scoreFlash === "down"
                          ? "#E74C3C"
                          : "var(--primary)",
                  }}
                >
                  Score: {activeFitness.totalScore.toFixed(4)}
                </span>
              </div>

              <p
                className="text-xs mb-3"
                style={{ color: "var(--muted-foreground)" }}
              >
                Drag a space block to another floor to adjust. Mandatory
                floors are locked.
              </p>

              <p
                className="text-xs mb-3"
                style={{
                  color: "var(--muted-foreground)",
                  fontStyle: "italic",
                  opacity: 0.85,
                }}
              >
                Tip: To lock a space to a specific floor, set{" "}
                <strong>floorMandatory</strong> in the Programme Spec
                Editor (Step 1).
              </p>

              <div className="space-y-2">
                {activeFloors.map((floor) => (
                  <FloorStrip
                    key={floor.floorIndex}
                    floor={floor}
                    spaces={spec.spaces}
                    categoryColors={CATEGORY_COLORS}
                    maxFloors={spec.constraints.maxFloors}
                    onDragStart={handleDragStart}
                    onDrop={handleDropOnFloor}
                  />
                ))}
              </div>

              {/* Fitness Breakdown Table */}
              <div
                className="sa-card mt-4"
                style={{ padding: "12px 16px" }}
              >
                <h4
                  className="text-xs font-semibold mb-2"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Fitness Breakdown
                </h4>
                <table
                  className="w-full text-xs"
                  style={{ color: "var(--foreground)" }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <th className="text-left py-1">Component</th>
                      <th className="text-right py-1">Raw Score</th>
                      <th className="text-right py-1">Weight</th>
                      <th className="text-right py-1">Weighted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: "Adjacency",
                        score: activeFitness.adjacencyScore,
                        weight: DEFAULT_FITNESS_WEIGHTS.adjacency,
                      },
                      {
                        label: "Cluster",
                        score: activeFitness.clusterScore,
                        weight: DEFAULT_FITNESS_WEIGHTS.cluster,
                      },
                      {
                        label: "Floor Pref",
                        score: activeFitness.floorScore,
                        weight: DEFAULT_FITNESS_WEIGHTS.floor,
                      },
                      {
                        label: "Natural Light",
                        score: activeFitness.lightScore,
                        weight: DEFAULT_FITNESS_WEIGHTS.light,
                      },
                    ].map((row) => (
                      <tr
                        key={row.label}
                        style={{
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <td className="py-1">{row.label}</td>
                        <td className="text-right py-1">
                          {row.score.toFixed(4)}
                        </td>
                        <td className="text-right py-1">
                          {(row.weight * 100).toFixed(0)}%
                        </td>
                        <td className="text-right py-1">
                          {(row.score * row.weight).toFixed(4)}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1">Total</td>
                      <td />
                      <td />
                      <td className="text-right py-1">
                        {activeFitness.totalScore.toFixed(4)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Confirm & Export */}
              <div className="flex gap-2 mt-4">
                <button
                  className="sa-btn sa-btn-primary"
                  onClick={handleConfirm}
                >
                  Select This Zoning
                </button>
                <button className="sa-btn" onClick={handleExport}>
                  Export JSON
                </button>
                {adjustedFloors && (
                  <button
                    className="sa-btn"
                    onClick={() => {
                      setAdjustedFloors(null);
                      setAdjustedFitness(null);
                    }}
                  >
                    Reset Adjustments
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
