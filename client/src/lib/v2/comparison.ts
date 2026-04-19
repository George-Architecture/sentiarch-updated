// ============================================================
// SentiArch v2 — Cross-Option Comparison + Design Flag Summary
// Compare multiple design options for the same agent/path
// ============================================================

import type { SimulationRunResult, SeverityTag } from "./pmvEngine";
import type { NarrativeResult, DesignFlag } from "./llmNarrative";

/** A design option represents one simulation run with its narratives */
export interface DesignOption {
  id: string;
  label: string;
  simResult: SimulationRunResult;
  narrativeResult?: NarrativeResult;
}

/** Row in the comparison summary table */
export interface ComparisonRow {
  optionId: string;
  optionLabel: string;
  avgPMV: number;
  avgPPD: number;
  warnCount: number;
  criticalCount: number;
  overallRating: "Comfortable" | "Marginal" | "Poor";
}

/** Full comparison result */
export interface ComparisonResult {
  rows: ComparisonRow[];
  /** All design flags across all options, grouped by option */
  allFlags: { optionLabel: string; flags: DesignFlag[] }[];
  /** Best option based on lowest |avgPMV| */
  bestOptionId: string;
  /** Worst option based on highest |avgPMV| */
  worstOptionId: string;
}

/**
 * Generate comparison summary from multiple design options.
 */
export function generateComparison(options: DesignOption[]): ComparisonResult {
  const rows: ComparisonRow[] = options.map(opt => ({
    optionId: opt.id,
    optionLabel: opt.label,
    avgPMV: opt.simResult.avgPMV,
    avgPPD: opt.simResult.avgPPD,
    warnCount: opt.simResult.warnCount,
    criticalCount: opt.simResult.criticalCount,
    overallRating: opt.simResult.overallRating,
  }));

  const allFlags = options.map(opt => ({
    optionLabel: opt.label,
    flags: opt.narrativeResult?.designFlagSummary || [],
  }));

  // Find best and worst
  let bestIdx = 0;
  let worstIdx = 0;
  for (let i = 1; i < rows.length; i++) {
    if (Math.abs(rows[i].avgPMV) < Math.abs(rows[bestIdx].avgPMV)) bestIdx = i;
    if (Math.abs(rows[i].avgPMV) > Math.abs(rows[worstIdx].avgPMV)) worstIdx = i;
  }

  return {
    rows,
    allFlags,
    bestOptionId: options[bestIdx]?.id || "",
    worstOptionId: options[worstIdx]?.id || "",
  };
}

/**
 * Format a comparison result as a readable text summary.
 */
export function formatComparisonText(result: ComparisonResult): string {
  const lines: string[] = [];

  lines.push("=== Cross-Option Comparison Summary ===\n");
  lines.push("Option | Avg PMV | Avg PPD | WARN | CRITICAL | Rating");
  lines.push("-------|---------|---------|------|----------|-------");

  for (const row of result.rows) {
    const marker = row.optionId === result.bestOptionId ? " *" : "";
    lines.push(
      `${row.optionLabel}${marker} | ${row.avgPMV.toFixed(2)} | ${row.avgPPD.toFixed(1)}% | ${row.warnCount} | ${row.criticalCount} | ${row.overallRating}`
    );
  }

  lines.push(`\n* Best option: ${result.rows.find(r => r.optionId === result.bestOptionId)?.optionLabel || "N/A"}`);

  // Design flags
  if (result.allFlags.some(f => f.flags.length > 0)) {
    lines.push("\n=== Design Flag Summary ===\n");
    for (const { optionLabel, flags } of result.allFlags) {
      if (flags.length === 0) continue;
      lines.push(`--- ${optionLabel} ---`);
      for (const flag of flags) {
        lines.push(`  ${flag.nodeAddress}: ${flag.description}`);
      }
    }
  }

  return lines.join("\n");
}
