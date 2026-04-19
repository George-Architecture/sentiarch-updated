// ============================================================
// SentiArch v2 — PMV/PPD Calculation Engine
// Reuses store.ts calculatePMV + adds resolved-env pipeline
// ============================================================

import { calculatePMV, getPMVWarnings } from "../store";
import type { V2Agent } from "./agentSystem";
import { derivePreferredTemp, deriveClothingInsulation } from "./agentSystem";
import type { SpaceTag, ResolvedEnv } from "./spaceTags";
import { resolveEnvironment } from "./spaceTags";
import type { WeatherScenario, TimeSlot } from "./weatherScenarios";
import type { PathNode, OccupancyLevel } from "./pathSystem";
import { getMetForActivity, isVerticalTransition, getNodeAddress } from "./pathSystem";

/** Severity tag for design flags */
export type SeverityTag = "INFO" | "WARN" | "CRITICAL";

/** Result for a single path node */
export interface NodeResult {
  nodeId: string;
  nodeAddress: string;
  spaceTag: SpaceTag;
  mode: "passing_through" | "dwelling";
  activityId?: string;
  duration_minutes?: number;

  /** Resolved environment parameters */
  resolvedEnv: ResolvedEnv;

  /** Agent parameters used */
  met: number;
  clo: number;
  preferredTemp: number;

  /** PMV/PPD results */
  pmv: number;
  ppd: number;
  pmv_raw: number;         // before greenery adjustment
  pmv_adjusted: number;    // after greenery adjustment
  pmv_warnings: string[];

  /** Comfort deviation from preferred temperature */
  tempDeviation: number;

  /** Whether this is a vertical transition space */
  isVerticalTransition: boolean;
}

/** Full simulation run result */
export interface SimulationRunResult {
  agent: V2Agent;
  weatherId: string;
  timeSlotId: string;
  occupancy: OccupancyLevel;
  nodeResults: NodeResult[];

  /** Aggregate metrics */
  avgPMV: number;
  avgPPD: number;
  warnCount: number;
  criticalCount: number;
  overallRating: "Comfortable" | "Marginal" | "Poor";
}

/**
 * Run PMV/PPD calculation for a single path node.
 */
export function computeNodeResult(
  node: PathNode,
  agent: V2Agent,
  weather: WeatherScenario,
  time: TimeSlot
): NodeResult {
  // Resolve environment from space tag + weather + time
  const env = resolveEnvironment(node.spaceTag, weather, time);

  // Derive agent parameters
  const met = node.mode === "passing_through"
    ? 2.0  // walking MET for passing through
    : getMetForActivity(node.activityId || "attending_class");
  const clo = deriveClothingInsulation(agent.role, weather.season);
  const preferredTemp = derivePreferredTemp(agent);

  // Calculate PMV/PPD using store.ts reusable function
  // tdb = air_temp, tr = mean_radiant_temp, vr = air_velocity, rh = humidity
  const { pmv: pmvRaw, ppd } = calculatePMV(
    env.air_temp,
    env.mean_radiant_temp,
    env.air_velocity,
    env.humidity,
    met,
    clo
  );

  // Apply greenery adjustment
  const pmvAdjusted = pmvRaw + env.pmv_adjustment;

  // Recalculate PPD with adjusted PMV
  const ppdAdjusted = 100 - 95 * Math.exp(-0.03353 * Math.pow(pmvAdjusted, 4) - 0.2179 * Math.pow(pmvAdjusted, 2));

  // Get warnings
  const warnings = getPMVWarnings(
    env.air_temp, env.humidity, env.air_velocity, met, clo, pmvAdjusted
  );

  return {
    nodeId: node.id,
    nodeAddress: getNodeAddress(node),
    spaceTag: node.spaceTag,
    mode: node.mode,
    activityId: node.activityId,
    duration_minutes: node.duration_minutes,
    resolvedEnv: env,
    met,
    clo,
    preferredTemp,
    pmv: pmvAdjusted,
    ppd: Math.round(Math.max(5, isNaN(ppdAdjusted) ? ppd : ppdAdjusted) * 10) / 10,
    pmv_raw: pmvRaw,
    pmv_adjusted: pmvAdjusted,
    pmv_warnings: warnings,
    tempDeviation: Math.round((env.air_temp - preferredTemp) * 10) / 10,
    isVerticalTransition: isVerticalTransition(node.program),
  };
}

/**
 * Determine severity tag from PMV value.
 */
export function getSeverityFromPMV(pmv: number): SeverityTag {
  const absPMV = Math.abs(pmv);
  if (absPMV <= 0.5) return "INFO";
  if (absPMV <= 1.5) return "WARN";
  return "CRITICAL";
}

/**
 * Determine overall comfort rating from average PMV.
 */
export function getOverallRating(avgPMV: number): "Comfortable" | "Marginal" | "Poor" {
  const absAvg = Math.abs(avgPMV);
  if (absAvg <= 0.5) return "Comfortable";
  if (absAvg <= 1.5) return "Marginal";
  return "Poor";
}

/**
 * Run full simulation for all nodes in a path.
 */
export function runSimulation(
  nodes: PathNode[],
  agent: V2Agent,
  weather: WeatherScenario,
  time: TimeSlot,
  occupancy: OccupancyLevel
): SimulationRunResult {
  const nodeResults = nodes.map(node => computeNodeResult(node, agent, weather, time));

  // Aggregate metrics (only dwelling nodes for averages)
  const dwellingResults = nodeResults.filter(r => r.mode === "dwelling");
  const allResults = nodeResults;

  const avgPMV = dwellingResults.length > 0
    ? Math.round((dwellingResults.reduce((s, r) => s + r.pmv, 0) / dwellingResults.length) * 100) / 100
    : 0;
  const avgPPD = dwellingResults.length > 0
    ? Math.round((dwellingResults.reduce((s, r) => s + r.ppd, 0) / dwellingResults.length) * 10) / 10
    : 5;

  let warnCount = 0;
  let criticalCount = 0;
  for (const r of allResults) {
    const severity = getSeverityFromPMV(r.pmv);
    if (severity === "WARN") warnCount++;
    if (severity === "CRITICAL") criticalCount++;
  }

  return {
    agent,
    weatherId: weather.id,
    timeSlotId: time.id,
    occupancy,
    nodeResults,
    avgPMV,
    avgPPD,
    warnCount,
    criticalCount,
    overallRating: getOverallRating(avgPMV),
  };
}
