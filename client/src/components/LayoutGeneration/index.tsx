// ============================================================
// LayoutGeneration — Main component for Step 3
//
// Orchestrates: site boundary editor → layout generation →
// candidate comparison → selection → export.
// ============================================================

import { useState, useCallback, useMemo } from "react";
import type { ProgramSpec } from "@/types/program";
import type { SelectedZoning, FloorAssignment } from "@/types/zoning";
import type {
  Polygon2D,
  FloorLayoutCandidate,
  SelectedLayout,
} from "@/types/layout";
import { generateAllFloorLayouts } from "@/engines/layout";
import SiteBoundaryEditor from "./SiteBoundaryEditor";
import FloorPlanCanvas from "./FloorPlanCanvas";
import CandidateGrid from "./CandidateGrid";

// ---- localStorage helpers -----------------------------------------------

function loadFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Load zoning data from localStorage.
 *
 * Tries the "selected zoning" key first.  If that's missing,
 * falls back to the full ZoningResult and extracts the best
 * candidate as a SelectedZoning.
 */
function loadZoning(): SelectedZoning | null {
  // Try selected zoning first
  const selected = loadFromStorage<SelectedZoning>("sentiarch_selected_zoning");
  if (selected?.floors) return selected;

  // Fallback: extract from full ZoningResult
  try {
    const raw = localStorage.getItem("sentiarch_zoning_result");
    if (!raw) return null;
    const result = JSON.parse(raw) as {
      programSpecId: string;
      candidates: Array<{
        id: string;
        floors: FloorAssignment[];
        fitness: { adjacencyScore: number; clusterScore: number; floorScore: number; lightScore: number; totalScore: number };
      }>;
    };
    if (!result.candidates?.length) return null;
    const best = result.candidates[0];
    return {
      programSpecId: result.programSpecId,
      candidateId: best.id,
      floors: best.floors,
      fitness: best.fitness,
      confirmedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ---- Component ----------------------------------------------------------

export default function LayoutGeneration() {
  // Load inputs from localStorage (saved by Step 1 and Step 2)
  const spec = useMemo(
    () => loadFromStorage<ProgramSpec>("sentiarch_program_spec"),
    []
  );
  const zoning = useMemo(() => loadZoning(), []);

  // State
  const [boundary, setBoundary] = useState<Polygon2D | null>(null);
  const [boundaryArea, setBoundaryArea] = useState(0);
  const [floorCandidates, setFloorCandidates] = useState<
    Record<string, FloorLayoutCandidate[]>
  >({});
  const [selectedFloor, setSelectedFloor] = useState(0);
  const [selectedCandidates, setSelectedCandidates] = useState<
    Record<string, string>
  >({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [computeTime, setComputeTime] = useState<number | null>(null);
  const [expandedCandidate, setExpandedCandidate] =
    useState<FloorLayoutCandidate | null>(null);

  // Derived
  const floors: FloorAssignment[] = zoning?.floors ?? [];
  const maxFloors = spec?.constraints.maxFloors ?? 6;
  const hasGenerated = Object.keys(floorCandidates).length > 0;

  // Handlers
  const handleBoundaryChange = useCallback(
    (polygon: Polygon2D, areaM2: number) => {
      setBoundary(polygon);
      setBoundaryArea(areaM2);
    },
    []
  );

  const handleGenerate = useCallback(() => {
    if (!boundary || !spec || !zoning) return;
    setIsGenerating(true);

    // Use requestAnimationFrame to let UI update
    requestAnimationFrame(() => {
      const start = performance.now();
      const result = generateAllFloorLayouts(
        boundary,
        zoning.floors,
        spec,
        5
      );
      const elapsed = performance.now() - start;

      setFloorCandidates(result);
      setComputeTime(elapsed);
      setIsGenerating(false);

      // Auto-select best candidate for each floor
      const autoSelected: Record<string, string> = {};
      for (const [floorIdx, candidates] of Object.entries(result)) {
        if (candidates.length > 0) {
          autoSelected[floorIdx] = candidates[0].id;
        }
      }
      setSelectedCandidates(autoSelected);
    });
  }, [boundary, spec, zoning]);

  const handleSelectCandidate = useCallback(
    (candidateId: string) => {
      setSelectedCandidates((prev) => ({
        ...prev,
        [String(selectedFloor)]: candidateId,
      }));

      // Also expand it
      const candidates = floorCandidates[String(selectedFloor)] ?? [];
      const c = candidates.find((x) => x.id === candidateId);
      if (c) setExpandedCandidate(c);
    },
    [selectedFloor, floorCandidates]
  );

  const handleConfirmAll = useCallback(() => {
    if (!spec || !zoning) return;

    const selectedFloors: Record<string, FloorLayoutCandidate> = {};
    for (const [floorIdx, candidateId] of Object.entries(selectedCandidates)) {
      const candidates = floorCandidates[floorIdx] ?? [];
      const c = candidates.find((x) => x.id === candidateId);
      if (c) selectedFloors[floorIdx] = c;
    }

    const result: SelectedLayout = {
      programSpecId: spec.id,
      zoningCandidateId: zoning.candidateId,
      siteBoundary: {
        polygon: boundary!,
        areaM2: boundaryArea,
      },
      selectedFloors,
      confirmedAt: new Date().toISOString(),
    };

    localStorage.setItem(
      "sentiarch_selected_layout",
      JSON.stringify(result)
    );
    alert("Layout selections saved for Step 4!");
  }, [spec, zoning, boundary, boundaryArea, selectedCandidates, floorCandidates]);

  const handleExportJSON = useCallback(() => {
    if (!spec || !zoning || !boundary) return;

    const selectedFloors: Record<string, FloorLayoutCandidate> = {};
    for (const [floorIdx, candidateId] of Object.entries(selectedCandidates)) {
      const candidates = floorCandidates[floorIdx] ?? [];
      const c = candidates.find((x) => x.id === candidateId);
      if (c) selectedFloors[floorIdx] = c;
    }

    const result = {
      programSpecId: spec.id,
      zoningCandidateId: zoning.candidateId,
      siteBoundary: { polygon: boundary, areaM2: boundaryArea },
      selectedFloors,
      confirmedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sentiarch-layout-${spec.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [spec, zoning, boundary, boundaryArea, selectedCandidates, floorCandidates]);

  // Current floor candidates
  const currentCandidates = floorCandidates[String(selectedFloor)] ?? [];
  const currentSelectedId = selectedCandidates[String(selectedFloor)] ?? null;
  const currentExpanded =
    expandedCandidate?.floorIndex === selectedFloor
      ? expandedCandidate
      : currentCandidates.find((c) => c.id === currentSelectedId) ?? null;

  // ---- Render -----------------------------------------------------------

  if (!spec || !zoning) {
    return (
      <div className="sa-card" style={{ padding: 24, textAlign: "center" }}>
        <p
          className="text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          No ProgramSpec or ZoningResult found in localStorage.
        </p>
        <p
          className="text-xs mt-2"
          style={{ color: "var(--muted-foreground)" }}
        >
          Please complete Step 1 (Program Spec) and Step 2 (Zoning Strategy)
          first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Input Summary */}
      <div
        className="sa-card"
        style={{ padding: "10px 14px" }}
      >
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <span
              className="text-[10px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              Program Spec
            </span>
            <div
              className="text-xs font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              {spec.name}
            </div>
          </div>
          <div>
            <span
              className="text-[10px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              Zoning
            </span>
            <div
              className="text-xs font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              {zoning.candidateId} | {floors.length} floors
            </div>
          </div>
          <div>
            <span
              className="text-[10px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              Total Spaces
            </span>
            <div
              className="text-xs font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              {spec.spaces.length}
            </div>
          </div>
          {boundaryArea > 0 && (
            <div>
              <span
                className="text-[10px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                Site Area
              </span>
              <div
                className="text-xs font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                {boundaryArea.toFixed(0)} m²
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Site Boundary Editor */}
      <div className="sa-card" style={{ padding: 14 }}>
        <SiteBoundaryEditor
          onChange={handleBoundaryChange}
          width={640}
          height={400}
        />
      </div>

      {/* Generate Button */}
      {boundary && (
        <div className="flex items-center gap-3">
          <button
            className="sa-btn"
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{
              background: "var(--primary)",
              color: "#fff",
              padding: "8px 20px",
              opacity: isGenerating ? 0.6 : 1,
            }}
          >
            {isGenerating
              ? "Generating..."
              : "Generate 5 Candidates per Floor"}
          </button>
          {computeTime !== null && (
            <span
              className="text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              Computed in {computeTime.toFixed(0)}ms
            </span>
          )}
        </div>
      )}

      {/* Floor Tabs + Candidates */}
      {hasGenerated && (
        <>
          {/* Floor tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {floors.map((f) => {
              const isActive = selectedFloor === f.floorIndex;
              const floorLabel =
                f.floorIndex === 0 ? "G/F" : `${f.floorIndex}/F`;
              const hasCandidates =
                (floorCandidates[String(f.floorIndex)] ?? []).length > 0;
              const isConfirmed = !!selectedCandidates[String(f.floorIndex)];

              return (
                <button
                  key={f.floorIndex}
                  className="sa-btn"
                  onClick={() => {
                    setSelectedFloor(f.floorIndex);
                    setExpandedCandidate(null);
                  }}
                  style={{
                    padding: "4px 12px",
                    fontSize: 11,
                    background: isActive
                      ? "var(--primary)"
                      : undefined,
                    color: isActive ? "#fff" : undefined,
                    opacity: hasCandidates ? 1 : 0.5,
                  }}
                >
                  {floorLabel}
                  {isConfirmed && (
                    <span style={{ marginLeft: 4, fontSize: 9 }}>
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Candidate Grid */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Floor{" "}
                {selectedFloor === 0 ? "G/F" : `${selectedFloor}/F`}{" "}
                — {currentCandidates.length} candidates
              </span>
              <span
                className="text-[10px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                ({floors.find((f) => f.floorIndex === selectedFloor)?.spaceIds.length ?? 0} spaces)
              </span>
            </div>
            <CandidateGrid
              candidates={currentCandidates}
              selectedId={currentSelectedId}
              onSelect={handleSelectCandidate}
            />
          </div>

          {/* Expanded View */}
          {currentExpanded && (
            <div className="sa-card" style={{ padding: 14 }}>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  Expanded: {currentExpanded.id}
                </span>
                <span
                  className="text-sm font-bold"
                  style={{
                    color:
                      currentExpanded.quality.totalScore >= 0.7
                        ? "#27AE60"
                        : "#E67E22",
                  }}
                >
                  Score: {currentExpanded.quality.totalScore.toFixed(4)}
                </span>
              </div>
              <FloorPlanCanvas
                candidate={currentExpanded}
                width={640}
                height={480}
              />

              {/* Quality breakdown table */}
              <table
                className="mt-3"
                style={{
                  width: "100%",
                  maxWidth: 500,
                  fontSize: 11,
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    <th style={{ textAlign: "left", padding: "4px 8px" }}>
                      Component
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 8px" }}>
                      Score
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 8px" }}>
                      Weight
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 8px" }}>
                      Weighted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "4px 8px" }}>Adjacency</td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      {currentExpanded.quality.adjacencySatisfaction.toFixed(4)}
                    </td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      35%
                    </td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      {(
                        currentExpanded.quality.adjacencySatisfaction * 0.35
                      ).toFixed(4)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 8px" }}>Area Efficiency</td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      {currentExpanded.quality.areaEfficiency.toFixed(4)}
                    </td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      25%
                    </td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      {(
                        currentExpanded.quality.areaEfficiency * 0.25
                      ).toFixed(4)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 8px" }}>
                      Corridor Efficiency
                    </td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      {(1 - currentExpanded.quality.corridorRatio).toFixed(4)}
                    </td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      15%
                    </td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      {(
                        (1 - currentExpanded.quality.corridorRatio) * 0.15
                      ).toFixed(4)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 8px" }}>Natural Light</td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      {currentExpanded.quality.naturalLightAccess.toFixed(4)}
                    </td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      25%
                    </td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      {(
                        currentExpanded.quality.naturalLightAccess * 0.25
                      ).toFixed(4)}
                    </td>
                  </tr>
                  <tr
                    style={{
                      borderTop: "1px solid var(--border)",
                      fontWeight: "bold",
                    }}
                  >
                    <td style={{ padding: "4px 8px" }}>Total</td>
                    <td />
                    <td />
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      {currentExpanded.quality.totalScore.toFixed(4)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Room list */}
              <div className="mt-3">
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Rooms ({currentExpanded.rooms.length})
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {currentExpanded.rooms.map((r) => (
                    <span
                      key={r.spaceId}
                      className="sa-tag"
                      style={{
                        fontSize: 9,
                        padding: "2px 6px",
                        background: (r.colorHex ?? "#95A5A6") + "20",
                        border: `1px solid ${r.colorHex ?? "#95A5A6"}60`,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: r.colorHex ?? "#95A5A6",
                          marginRight: 3,
                        }}
                      />
                      {r.name} ({Math.round(r.areaM2)}m²
                      {r.touchesExterior ? " ☀" : ""})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Confirm & Export */}
          <div className="flex items-center gap-3">
            <button
              className="sa-btn"
              onClick={handleConfirmAll}
              style={{
                background: "var(--primary)",
                color: "#fff",
                padding: "8px 20px",
              }}
            >
              Confirm All Selections
            </button>
            <button
              className="sa-btn"
              onClick={handleExportJSON}
              style={{ padding: "8px 16px" }}
            >
              Export JSON
            </button>
            <span
              className="text-[10px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {Object.keys(selectedCandidates).length} / {floors.length} floors
              selected
            </span>
          </div>
        </>
      )}
    </div>
  );
}
