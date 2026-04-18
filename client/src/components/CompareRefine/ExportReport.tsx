/**
 * SentiArch — Export & Summary Report
 *
 * Final export of the complete design package:
 * - Individual JSON exports (ProgramSpec, Zoning, Layout, Simulation, Comparison)
 * - Complete design package (all-in-one ZIP-like JSON)
 * - Printable summary report
 */
import { useCallback, useMemo } from "react";
import type { DesignCandidate, ComparisonResult } from "../../types/comparison";

// ---------------------------------------------------------------------------
// localStorage keys (must match other steps)
// ---------------------------------------------------------------------------

const LS_KEYS = {
  programSpec: "sentiarch_program_spec",
  zoningResult: "sentiarch_zoning_result",
  selectedZoning: "sentiarch_selected_zoning",
  layoutResult: "sentiarch_layout_result",
  selectedLayout: "sentiarch_selected_layout",
  massingResult: "sentiarch_massing_result",
  simulationResult: "sentiarch_simulation_result",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function loadFromLS(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExportReportProps {
  comparisonResult: ComparisonResult;
  selectedCandidate: DesignCandidate | null;
}

// ---------------------------------------------------------------------------
// Printable Report (rendered as HTML for window.print())
// ---------------------------------------------------------------------------

function generateReportHTML(
  candidate: DesignCandidate,
  comparisonResult: ComparisonResult,
): string {
  const cohortRows = candidate.equity.cohorts
    .map(
      (c) =>
        `<tr>
          <td>${c.cohortLabel}</td>
          <td>${(c.avgComfortScore * 100).toFixed(1)}%</td>
          <td>${c.avgPMV >= 0 ? "+" : ""}${c.avgPMV.toFixed(2)}</td>
          <td>${c.avgPPD.toFixed(1)}%</td>
          <td>${c.avgLoad.toFixed(2)}</td>
          <td>${c.alertCount}</td>
        </tr>`,
    )
    .join("");

  const candidateRows = comparisonResult.candidates
    .map(
      (c) =>
        `<tr style="${c.id === candidate.id ? "background:#e8f5e9;font-weight:700;" : ""}">
          <td>${c.label}${c.id === candidate.id ? " (Selected)" : ""}</td>
          <td>${(c.compositeScore * 100).toFixed(1)}%</td>
          <td>${(c.equity.equityScore * 100).toFixed(1)}%</td>
          <td>${(c.comfort.overallComfortScore * 100).toFixed(1)}%</td>
          <td>${(c.spatial.areaEfficiency * 100).toFixed(1)}%</td>
          <td>${(c.adjacency.adjacencyScore * 100).toFixed(1)}%</td>
          <td>${(c.light.lightAccessRatio * 100).toFixed(1)}%</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <title>SentiArch Design Report — ${candidate.label}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #333; font-size: 12px; }
    h1 { font-size: 22px; border-bottom: 3px solid #2E6B8A; padding-bottom: 8px; }
    h2 { font-size: 16px; color: #2E6B8A; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    h3 { font-size: 13px; color: #555; margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th, td { padding: 6px 8px; border: 1px solid #ddd; text-align: right; }
    th { background: #f5f5f5; font-weight: 600; text-align: left; }
    td:first-child, th:first-child { text-align: left; }
    .equity-box { border: 2px solid #c0392b; background: #fdf2f2; padding: 16px; border-radius: 8px; margin: 12px 0; }
    .equity-box h3 { color: #c0392b; margin-top: 0; }
    .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 12px 0; }
    .stat-box { text-align: center; padding: 12px; background: #f8f9fa; border-radius: 6px; }
    .stat-box .value { font-size: 20px; font-weight: 700; }
    .stat-box .label { font-size: 10px; color: #888; }
    .notes { background: #fffde7; padding: 12px; border-radius: 6px; border: 1px solid #fff9c4; white-space: pre-wrap; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>SentiArch Design Report</h1>
  <p><strong>Selected Candidate:</strong> ${candidate.label} | <strong>Date:</strong> ${new Date().toLocaleDateString()} | <strong>Source:</strong> ${candidate.source}</p>

  <h2>1. Design Summary</h2>
  <div class="stat-grid">
    <div class="stat-box">
      <div class="value">${(candidate.compositeScore * 100).toFixed(1)}%</div>
      <div class="label">Composite Score</div>
    </div>
    <div class="stat-box">
      <div class="value">${candidate.spatial.roomCount}</div>
      <div class="label">Total Rooms</div>
    </div>
    <div class="stat-box">
      <div class="value">${candidate.spatial.totalAreaM2.toFixed(0)} m&sup2;</div>
      <div class="label">Total GFA</div>
    </div>
  </div>

  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Floor Count</td><td>${candidate.spatial.floorCount}</td></tr>
    <tr><td>Area Efficiency</td><td>${(candidate.spatial.areaEfficiency * 100).toFixed(1)}%</td></tr>
    <tr><td>Corridor Ratio</td><td>${(candidate.spatial.corridorRatio * 100).toFixed(1)}%</td></tr>
    <tr><td>Adjacency Score</td><td>${(candidate.adjacency.adjacencyScore * 100).toFixed(1)}%</td></tr>
    <tr><td>Natural Light Access</td><td>${(candidate.light.lightAccessRatio * 100).toFixed(1)}%</td></tr>
    <tr><td>Avg PMV</td><td>${candidate.comfort.avgPMV >= 0 ? "+" : ""}${candidate.comfort.avgPMV.toFixed(2)}</td></tr>
    <tr><td>Avg PPD</td><td>${candidate.comfort.avgPPD.toFixed(1)}%</td></tr>
    <tr><td>Comfort Alerts</td><td>${candidate.comfort.alertCount}</td></tr>
  </table>

  <h2>2. Thermal Equity Analysis</h2>
  <div class="equity-box">
    <h3>Equity Score: ${(candidate.equity.equityScore * 100).toFixed(1)}%</h3>
    <p>Comfort Gap: <strong>${(candidate.equity.comfortGap * 100).toFixed(1)}%</strong></p>
    <p>Best served: <strong>${candidate.equity.bestCohortLabel}</strong> (${(candidate.equity.bestCohortScore * 100).toFixed(1)}%)</p>
    <p>Most disadvantaged: <strong>${candidate.equity.worstCohortLabel}</strong> (${(candidate.equity.worstCohortScore * 100).toFixed(1)}%)</p>
  </div>

  <h3>Per-Cohort Comfort Breakdown</h3>
  <table>
    <thead><tr><th>Cohort</th><th>Comfort</th><th>PMV</th><th>PPD</th><th>Load</th><th>Alerts</th></tr></thead>
    <tbody>${cohortRows}</tbody>
  </table>

  <h2>3. Candidate Comparison</h2>
  <table>
    <thead><tr><th>Candidate</th><th>Composite</th><th>Equity</th><th>Comfort</th><th>Area Eff.</th><th>Adjacency</th><th>Light</th></tr></thead>
    <tbody>${candidateRows}</tbody>
  </table>

  ${candidate.notes ? `<h2>4. Design Notes</h2><div class="notes">${candidate.notes}</div>` : ""}

  <hr style="margin-top:32px;"/>
  <p style="font-size:10px;color:#888;">Generated by SentiArch — Agent-Based Environmental Experience Model | ${new Date().toISOString()}</p>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ExportReport({ comparisonResult, selectedCandidate }: ExportReportProps) {
  // Collect all step data from localStorage
  const stepData = useMemo(
    () => ({
      programSpec: loadFromLS(LS_KEYS.programSpec),
      zoningResult: loadFromLS(LS_KEYS.zoningResult),
      selectedZoning: loadFromLS(LS_KEYS.selectedZoning),
      layoutResult: loadFromLS(LS_KEYS.layoutResult),
      selectedLayout: loadFromLS(LS_KEYS.selectedLayout),
      massingResult: loadFromLS(LS_KEYS.massingResult),
      simulationResult: loadFromLS(LS_KEYS.simulationResult),
    }),
    [],
  );

  const availableSteps = useMemo(() => {
    const steps: { key: string; label: string; available: boolean }[] = [
      { key: "programSpec", label: "Program Spec (Step 1)", available: !!stepData.programSpec },
      { key: "zoningResult", label: "Zoning Result (Step 2)", available: !!stepData.zoningResult },
      { key: "layoutResult", label: "Layout Result (Step 3)", available: !!stepData.layoutResult },
      { key: "massingResult", label: "Massing Result (Step 4)", available: !!stepData.massingResult },
      { key: "simulationResult", label: "Simulation Result (Step 5)", available: !!stepData.simulationResult },
    ];
    return steps;
  }, [stepData]);

  // Export individual step
  const exportStep = useCallback(
    (key: string, label: string) => {
      const data = stepData[key as keyof typeof stepData];
      if (data) {
        downloadJSON(data, `sentiarch_${key}.json`);
      }
    },
    [stepData],
  );

  // Export complete design package
  const exportAll = useCallback(() => {
    const pkg = {
      _meta: {
        generator: "SentiArch",
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        selectedCandidateId: comparisonResult.selectedCandidateId,
      },
      programSpec: stepData.programSpec,
      zoningResult: stepData.zoningResult,
      selectedZoning: stepData.selectedZoning,
      layoutResult: stepData.layoutResult,
      selectedLayout: stepData.selectedLayout,
      massingResult: stepData.massingResult,
      simulationResult: stepData.simulationResult,
      comparisonResult,
    };
    downloadJSON(pkg, "sentiarch_design_package.json");
  }, [stepData, comparisonResult]);

  // Export comparison result only
  const exportComparison = useCallback(() => {
    downloadJSON(comparisonResult, "sentiarch_comparison_result.json");
  }, [comparisonResult]);

  // Print summary report
  const printReport = useCallback(() => {
    if (!selectedCandidate) return;
    const html = generateReportHTML(selectedCandidate, comparisonResult);
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      // Delay print to allow rendering
      setTimeout(() => win.print(), 500);
    }
  }, [selectedCandidate, comparisonResult]);

  return (
    <div>
      {/* Step Data Availability */}
      <div className="sa-card" style={{ padding: 16, marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600 }}>
          Design Data Availability
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {availableSteps.map((step) => (
            <div
              key={step.key}
              style={{
                textAlign: "center",
                padding: 10,
                borderRadius: 6,
                background: step.available ? "#e8f5e9" : "#fce4ec",
                border: `1px solid ${step.available ? "#c8e6c9" : "#f8bbd0"}`,
                fontSize: 11,
              }}
            >
              <div style={{ fontSize: 16, marginBottom: 4 }}>{step.available ? "OK" : "--"}</div>
              <div style={{ fontWeight: 500 }}>{step.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Individual Exports */}
      <div className="sa-card" style={{ padding: 16, marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600 }}>
          Export Individual Steps
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {availableSteps.map((step) => (
            <button
              key={step.key}
              className="sa-btn"
              onClick={() => exportStep(step.key, step.label)}
              disabled={!step.available}
              style={{ fontSize: 11 }}
            >
              {step.label}
            </button>
          ))}
        </div>
      </div>

      {/* Package Exports */}
      <div className="sa-card" style={{ padding: 16, marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600 }}>
          Export Design Package
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button className="sa-btn sa-btn-primary" onClick={exportAll} style={{ fontSize: 12 }}>
            Export Complete Package (JSON)
          </button>
          <button className="sa-btn" onClick={exportComparison} style={{ fontSize: 12 }}>
            Export Comparison Only
          </button>
          <button
            className="sa-btn"
            onClick={printReport}
            disabled={!selectedCandidate}
            style={{ fontSize: 12 }}
          >
            Print Summary Report
          </button>
        </div>
        {!selectedCandidate && (
          <p style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
            Select a candidate to enable the summary report.
          </p>
        )}
      </div>

      {/* Report Preview */}
      {selectedCandidate && (
        <div className="sa-card" style={{ padding: 16 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600 }}>
            Report Preview — {selectedCandidate.label}
          </h3>

          {/* Mini summary */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ textAlign: "center", padding: 12, background: "#f8f9fa", borderRadius: 6 }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {(selectedCandidate.compositeScore * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: 10, color: "#888" }}>Composite Score</div>
            </div>
            <div
              style={{
                textAlign: "center",
                padding: 12,
                background: "#fdf2f2",
                borderRadius: 6,
                border: "1px solid #f5c6cb",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: "#c0392b" }}>
                {(selectedCandidate.equity.equityScore * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: 10, color: "#c0392b" }}>Equity Score</div>
            </div>
            <div style={{ textAlign: "center", padding: 12, background: "#f8f9fa", borderRadius: 6 }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {selectedCandidate.spatial.roomCount} rooms
              </div>
              <div style={{ fontSize: 10, color: "#888" }}>
                {selectedCandidate.spatial.totalAreaM2.toFixed(0)} m2 GFA
              </div>
            </div>
          </div>

          {/* Selection rationale */}
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Selection Rationale:</strong> This candidate was ranked #
              {comparisonResult.candidates.findIndex((c) => c.id === selectedCandidate.id) + 1} out of{" "}
              {comparisonResult.candidates.length} candidates based on the weighted composite score.
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Equity Analysis:</strong> The comfort gap between the best-served cohort (
              {selectedCandidate.equity.bestCohortLabel},{" "}
              {(selectedCandidate.equity.bestCohortScore * 100).toFixed(1)}%) and the most disadvantaged
              cohort ({selectedCandidate.equity.worstCohortLabel},{" "}
              {(selectedCandidate.equity.worstCohortScore * 100).toFixed(1)}%) is{" "}
              <strong>{(selectedCandidate.equity.comfortGap * 100).toFixed(1)}%</strong>.
            </p>
            {selectedCandidate.notes && (
              <p style={{ margin: "0 0 8px" }}>
                <strong>Design Notes:</strong> {selectedCandidate.notes}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
