/**
 * SentiArch — Batch Simulation Engine
 *
 * Runs N cohorts × M tasks scenarios, computing PMV/PPD and Perceptual Load
 * at each room along the route and at the destination.
 *
 * Reuses the ISO 7730 Fanger PMV calculation and Perceptual Load model
 * from store.ts for consistency with the existing single-agent system.
 */
import {
  calculatePMV,
  getPMVWarnings,
  computePerceptualLoad,
  type PersonaData,
  type EnvironmentData,
  type SpatialData,
  type ComputedOutputs,
} from "../../lib/store";

import type {
  AgentCohort,
  SimulationTask,
  RoomEnvironment,
  RoomComfort,
  ScenarioResult,
  RoomAggregate,
  CohortSummary,
  Alert,
  SimulationResult,
  SimulationConfig,
} from "../../types/simulation";

import {
  DEFAULT_ROOM_ENVIRONMENTS,
  ROOM_SPECIFIC_ENVIRONMENTS,
} from "../../types/simulation";

// ---------------------------------------------------------------------------
// Room info extracted from layout
// ---------------------------------------------------------------------------

export interface LayoutRoomInfo {
  spaceId: string;
  name: string;
  category: string;
  floorIndex: number;
  areaM2: number;
  touchesExterior: boolean;
  colorHex: string;
  /** IDs of adjacent rooms (sharing a wall or connected by corridor) */
  adjacentRoomIds: string[];
}

// ---------------------------------------------------------------------------
// Build adjacency graph from layout rooms
// ---------------------------------------------------------------------------

/**
 * Build a room adjacency graph from the layout.
 * Two rooms are adjacent if they are on the same floor and listed as adjacent,
 * or connected via a corridor. Rooms on different floors are connected via
 * a virtual "stairs" node per floor boundary.
 */
export function buildAdjacencyGraph(
  rooms: LayoutRoomInfo[],
  maxFloors: number,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  const ensureNode = (id: string) => {
    if (!graph.has(id)) graph.set(id, new Set());
  };

  // Add all rooms as nodes
  for (const room of rooms) {
    ensureNode(room.spaceId);
  }

  // Add same-floor adjacencies
  for (const room of rooms) {
    for (const adjId of room.adjacentRoomIds) {
      ensureNode(adjId);
      graph.get(room.spaceId)!.add(adjId);
      graph.get(adjId)!.add(room.spaceId);
    }
  }

  // Connect all rooms on the same floor (they share corridor access)
  const floorGroups = new Map<number, string[]>();
  for (const room of rooms) {
    if (!floorGroups.has(room.floorIndex)) floorGroups.set(room.floorIndex, []);
    floorGroups.get(room.floorIndex)!.push(room.spaceId);
  }

  for (const [, floorRooms] of Array.from(floorGroups.entries())) {
    // All rooms on the same floor can reach each other via corridors
    for (let i = 0; i < floorRooms.length; i++) {
      for (let j = i + 1; j < floorRooms.length; j++) {
        graph.get(floorRooms[i])!.add(floorRooms[j]);
        graph.get(floorRooms[j])!.add(floorRooms[i]);
      }
    }
  }

  // Add virtual stairwell nodes connecting adjacent floors
  for (let f = 0; f < maxFloors - 1; f++) {
    const stairId = `__stairs_${f}_${f + 1}`;
    ensureNode(stairId);
    const lowerRooms = floorGroups.get(f) ?? [];
    const upperRooms = floorGroups.get(f + 1) ?? [];
    // Connect stairs to all rooms on both floors
    for (const rid of lowerRooms) {
      graph.get(rid)!.add(stairId);
      graph.get(stairId)!.add(rid);
    }
    for (const rid of upperRooms) {
      graph.get(rid)!.add(stairId);
      graph.get(stairId)!.add(rid);
    }
  }

  return graph;
}

// ---------------------------------------------------------------------------
// BFS pathfinding
// ---------------------------------------------------------------------------

/**
 * Find shortest path between two rooms using BFS on the adjacency graph.
 * Returns the ordered list of room IDs (excluding virtual stair nodes).
 */
export function findPath(
  graph: Map<string, Set<string>>,
  fromId: string,
  toId: string,
): string[] {
  if (fromId === toId) return [fromId];
  if (!graph.has(fromId) || !graph.has(toId)) return [fromId, toId];

  const visited = new Set<string>();
  const parent = new Map<string, string>();
  const queue: string[] = [fromId];
  visited.add(fromId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toId) break;

    const neighbors = graph.get(current);
    if (!neighbors) continue;

    for (const next of Array.from(neighbors)) {
      if (!visited.has(next)) {
        visited.add(next);
        parent.set(next, current);
        queue.push(next);
      }
    }
  }

  // Reconstruct path
  if (!parent.has(toId) && fromId !== toId) {
    // No path found — return direct (origin → destination)
    return [fromId, toId];
  }

  const path: string[] = [];
  let current = toId;
  while (current !== fromId) {
    path.unshift(current);
    current = parent.get(current) ?? fromId;
  }
  path.unshift(fromId);

  // Filter out virtual stair nodes (keep only real rooms)
  return path.filter((id) => !id.startsWith("__stairs_"));
}

// ---------------------------------------------------------------------------
// Comfort calculation for a single room visit
// ---------------------------------------------------------------------------

/** Alert thresholds */
const ALERT_THRESHOLDS = {
  pmvLow: -0.5,
  pmvHigh: 0.5,
  ppdMax: 10,
  loadMax: 0.7,
};

function getEnvironmentForRoom(
  spaceId: string,
  category: string,
  overrides: Map<string, RoomEnvironment>,
): { airTemp: number; humidity: number; airVelocity: number; lux: number; noiseDb: number } {
  // Start with category defaults
  const catDefaults = DEFAULT_ROOM_ENVIRONMENTS[category] ?? DEFAULT_ROOM_ENVIRONMENTS["support"];
  let env = { ...catDefaults };

  // Apply room-specific overrides
  const specific = ROOM_SPECIFIC_ENVIRONMENTS[spaceId];
  if (specific) {
    if (specific.lux !== undefined) env.lux = specific.lux;
    if (specific.noiseDb !== undefined) env.noiseDb = specific.noiseDb;
    if (specific.airTemp !== undefined) env.airTemp = specific.airTemp;
  }

  // Apply user overrides (highest priority)
  const userOverride = overrides.get(spaceId);
  if (userOverride) {
    env = {
      airTemp: userOverride.airTemp,
      humidity: userOverride.humidity,
      airVelocity: userOverride.airVelocity,
      lux: userOverride.lux,
      noiseDb: userOverride.noiseDb,
    };
  }

  return env;
}

function computeRoomComfort(
  cohort: AgentCohort,
  room: LayoutRoomInfo,
  durationMinutes: number,
  envOverrides: Map<string, RoomEnvironment>,
  visibleAgents: number,
): RoomComfort {
  const env = getEnvironmentForRoom(room.spaceId, room.category, envOverrides);

  // Build PersonaData for store.ts compatibility
  const environment: EnvironmentData = {
    lux: env.lux,
    dB: env.noiseDb,
    air_temp: env.airTemp,
    humidity: env.humidity,
    air_velocity: env.airVelocity,
  };

  const spatial: SpatialData = {
    dist_to_wall: 2,
    dist_to_window: room.touchesExterior ? 3 : 10,
    dist_to_exit: 5,
    ceiling_h: 3.6,
    enclosure_ratio: 0.7,
    visible_agents: visibleAgents,
  };

  const persona: PersonaData = {
    agent: {
      id: cohort.id,
      age: cohort.profile.age,
      gender: cohort.profile.gender,
      mbti: cohort.profile.mbti,
      mobility: cohort.profile.mobility,
      hearing: cohort.profile.hearing,
      vision: cohort.profile.vision,
      metabolic_rate: cohort.profile.metabolic_rate,
      clothing_insulation: cohort.profile.clothing_insulation,
    },
    position: {
      cell: [0, 0],
      timestamp: "14:30",
      duration_in_cell: durationMinutes,
    },
    environment,
    spatial,
  };

  // Calculate PMV/PPD
  const { pmv, ppd } = calculatePMV(
    env.airTemp,
    env.airTemp, // mean radiant temp ≈ air temp for indoor
    env.airVelocity,
    env.humidity,
    cohort.profile.metabolic_rate,
    cohort.profile.clothing_insulation,
  );

  const pmvWarnings = getPMVWarnings(
    env.airTemp,
    env.humidity,
    env.airVelocity,
    cohort.profile.metabolic_rate,
    cohort.profile.clothing_insulation,
    pmv,
  );

  // Vision and hearing adjustments
  const visionFactor =
    cohort.profile.vision === "normal" ? 1 : cohort.profile.vision === "mild_impairment" ? 0.75 : 0.5;
  const hearingFactor =
    cohort.profile.hearing === "normal" ? 1 : cohort.profile.hearing === "impaired" ? 1.1 : 0.7;

  const effectiveLux = Math.round(env.lux * visionFactor);
  const perceivedDb = Math.round(env.noiseDb * hearingFactor);

  const computed: ComputedOutputs = {
    PMV: pmv,
    PPD: ppd,
    effective_lux: effectiveLux,
    perceived_dB: perceivedDb,
    pmv_warnings: pmvWarnings,
  };

  // Calculate perceptual load
  const load = computePerceptualLoad(persona, computed);

  // Aggregate load (weighted average)
  const aggregateLoad =
    Math.round(
      (load.thermal_discomfort * 0.25 +
        load.visual_strain * 0.15 +
        load.noise_stress * 0.20 +
        load.social_overload * 0.10 +
        load.fatigue * 0.20 +
        load.wayfinding_anxiety * 0.10) *
        100,
    ) / 100;

  // Check alerts
  const alertReasons: string[] = [];
  if (pmv < ALERT_THRESHOLDS.pmvLow) alertReasons.push(`PMV too low (${pmv})`);
  if (pmv > ALERT_THRESHOLDS.pmvHigh) alertReasons.push(`PMV too high (${pmv})`);
  if (ppd > ALERT_THRESHOLDS.ppdMax) alertReasons.push(`PPD exceeds ${ALERT_THRESHOLDS.ppdMax}% (${ppd}%)`);
  if (aggregateLoad > ALERT_THRESHOLDS.loadMax)
    alertReasons.push(`Perceptual load exceeds ${ALERT_THRESHOLDS.loadMax} (${aggregateLoad})`);

  return {
    spaceId: room.spaceId,
    spaceName: room.name,
    pmv,
    ppd,
    effectiveLux,
    perceivedDb,
    perceptualLoad: load,
    aggregateLoad,
    isAlert: alertReasons.length > 0,
    alertReasons,
    durationMinutes,
    pmvWarnings,
  };
}

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

/** Convert comfort metrics to a 0-1 score (1 = perfect comfort) */
function comfortToScore(comfort: RoomComfort): number {
  // PMV score: 1.0 at PMV=0, 0.0 at |PMV|≥3
  const pmvScore = Math.max(0, 1 - Math.abs(comfort.pmv) / 3);
  // PPD score: 1.0 at PPD=5%, 0.0 at PPD≥100%
  const ppdScore = Math.max(0, 1 - comfort.ppd / 100);
  // Load score: 1.0 at load=0, 0.0 at load=1
  const loadScore = 1 - comfort.aggregateLoad;

  return Math.round((pmvScore * 0.3 + ppdScore * 0.3 + loadScore * 0.4) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Run a single scenario
// ---------------------------------------------------------------------------

function runScenario(
  cohort: AgentCohort,
  task: SimulationTask,
  rooms: Map<string, LayoutRoomInfo>,
  graph: Map<string, Set<string>>,
  envOverrides: Map<string, RoomEnvironment>,
): ScenarioResult {
  const t0 = performance.now();

  // Find path
  const route = findPath(graph, task.originSpaceId, task.destinationSpaceId);

  // Calculate transit time per room (assume ~1 min per room traversal)
  const transitMinutes = 1.0 / task.walkingSpeedFactor;

  // Estimate visible agents based on cohort count
  const avgVisibleAgents = Math.min(5, Math.round(cohort.count / 3));

  // Compute comfort at each room along the route
  const routeComfort: RoomComfort[] = route.map((spaceId) => {
    const room = rooms.get(spaceId);
    if (!room) {
      // Fallback for unknown rooms
      return {
        spaceId,
        spaceName: spaceId,
        pmv: 0,
        ppd: 5,
        effectiveLux: 300,
        perceivedDb: 55,
        perceptualLoad: {
          thermal_discomfort: 0,
          visual_strain: 0,
          noise_stress: 0,
          social_overload: 0,
          fatigue: 0,
          wayfinding_anxiety: 0,
        },
        aggregateLoad: 0,
        isAlert: false,
        alertReasons: [],
        durationMinutes: transitMinutes,
        pmvWarnings: [],
      };
    }

    const isDestination = spaceId === task.destinationSpaceId;
    const duration = isDestination ? task.dwellMinutes : transitMinutes;
    return computeRoomComfort(cohort, room, duration, envOverrides, avgVisibleAgents);
  });

  // Destination comfort is the last room in the route
  const destinationComfort = routeComfort[routeComfort.length - 1];

  // Score calculation
  const routeScores = routeComfort.slice(0, -1).map(comfortToScore);
  const routeScore =
    routeScores.length > 0
      ? Math.round((routeScores.reduce((a, b) => a + b, 0) / routeScores.length) * 1000) / 1000
      : 1.0;
  const destinationScore = comfortToScore(destinationComfort);
  const combinedScore = Math.round((routeScore * 0.3 + destinationScore * 0.7) * 1000) / 1000;

  const computeTimeMs = Math.round((performance.now() - t0) * 100) / 100;

  return {
    scenarioId: `${cohort.id}--${task.id}`,
    cohortId: cohort.id,
    taskId: task.id,
    route,
    routeComfort,
    destinationComfort,
    routeScore,
    destinationScore,
    combinedScore,
    computeTimeMs,
  };
}

// ---------------------------------------------------------------------------
// Aggregate results
// ---------------------------------------------------------------------------

function aggregateRoomStats(
  scenarioResults: ScenarioResult[],
  rooms: Map<string, LayoutRoomInfo>,
): RoomAggregate[] {
  const roomVisits = new Map<
    string,
    { pmvSum: number; ppdSum: number; loadSum: number; worstLoad: number; alertCount: number; count: number }
  >();

  for (const result of scenarioResults) {
    for (const rc of result.routeComfort) {
      const existing = roomVisits.get(rc.spaceId) ?? {
        pmvSum: 0,
        ppdSum: 0,
        loadSum: 0,
        worstLoad: 0,
        alertCount: 0,
        count: 0,
      };
      existing.pmvSum += rc.pmv;
      existing.ppdSum += rc.ppd;
      existing.loadSum += rc.aggregateLoad;
      existing.worstLoad = Math.max(existing.worstLoad, rc.aggregateLoad);
      existing.alertCount += rc.isAlert ? 1 : 0;
      existing.count += 1;
      roomVisits.set(rc.spaceId, existing);
    }
  }

  const aggregates: RoomAggregate[] = [];
  for (const [spaceId, stats] of Array.from(roomVisits.entries())) {
    const room = rooms.get(spaceId);
    aggregates.push({
      spaceId,
      spaceName: room?.name ?? spaceId,
      visitCount: stats.count,
      avgPmv: Math.round((stats.pmvSum / stats.count) * 100) / 100,
      avgPpd: Math.round((stats.ppdSum / stats.count) * 10) / 10,
      avgLoad: Math.round((stats.loadSum / stats.count) * 100) / 100,
      worstLoad: Math.round(stats.worstLoad * 100) / 100,
      alertCount: stats.alertCount,
      category: room?.category ?? "unknown",
      colorHex: room?.colorHex ?? "#999999",
    });
  }

  return aggregates.sort((a, b) => b.avgLoad - a.avgLoad);
}

function aggregateCohortStats(
  scenarioResults: ScenarioResult[],
  cohorts: AgentCohort[],
  rooms: Map<string, LayoutRoomInfo>,
): CohortSummary[] {
  return cohorts.map((cohort) => {
    const cohortResults = scenarioResults.filter((r) => r.cohortId === cohort.id);
    if (cohortResults.length === 0) {
      return {
        cohortId: cohort.id,
        cohortLabel: cohort.label,
        taskCount: 0,
        avgScore: 1,
        worstScore: 1,
        bestScore: 1,
        alertCount: 0,
        worstRoom: "N/A",
        colorHex: cohort.colorHex,
      };
    }

    const scores = cohortResults.map((r) => r.combinedScore);
    const avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 1000) / 1000;
    const worstScore = Math.min(...scores);
    const bestScore = Math.max(...scores);

    // Find worst room across all this cohort's routes
    let worstRoomId = "";
    let worstRoomLoad = 0;
    for (const result of cohortResults) {
      for (const rc of result.routeComfort) {
        if (rc.aggregateLoad > worstRoomLoad) {
          worstRoomLoad = rc.aggregateLoad;
          worstRoomId = rc.spaceId;
        }
      }
    }

    const alertCount = cohortResults.reduce(
      (sum, r) => sum + r.routeComfort.filter((rc) => rc.isAlert).length,
      0,
    );

    return {
      cohortId: cohort.id,
      cohortLabel: cohort.label,
      taskCount: cohortResults.length,
      avgScore,
      worstScore,
      bestScore,
      alertCount,
      worstRoom: rooms.get(worstRoomId)?.name ?? worstRoomId,
      colorHex: cohort.colorHex,
    };
  });
}

function collectAlerts(
  scenarioResults: ScenarioResult[],
  cohorts: AgentCohort[],
): Alert[] {
  const cohortMap = new Map(cohorts.map((c) => [c.id, c]));
  const alerts: Alert[] = [];

  for (const result of scenarioResults) {
    const cohort = cohortMap.get(result.cohortId);
    if (!cohort) continue;

    for (const rc of result.routeComfort) {
      if (!rc.isAlert) continue;

      for (const reason of rc.alertReasons) {
        const isCritical =
          reason.includes("PMV too") || (rc.ppd > 20) || (rc.aggregateLoad > 0.85);

        let value = 0;
        let threshold = 0;
        if (reason.includes("PMV too low")) {
          value = rc.pmv;
          threshold = ALERT_THRESHOLDS.pmvLow;
        } else if (reason.includes("PMV too high")) {
          value = rc.pmv;
          threshold = ALERT_THRESHOLDS.pmvHigh;
        } else if (reason.includes("PPD")) {
          value = rc.ppd;
          threshold = ALERT_THRESHOLDS.ppdMax;
        } else if (reason.includes("Perceptual")) {
          value = rc.aggregateLoad;
          threshold = ALERT_THRESHOLDS.loadMax;
        }

        alerts.push({
          severity: isCritical ? "critical" : "warning",
          spaceId: rc.spaceId,
          spaceName: rc.spaceName,
          cohortId: cohort.id,
          cohortLabel: cohort.label,
          reason,
          value: Math.round(value * 100) / 100,
          threshold,
        });
      }
    }
  }

  // Deduplicate: same room + cohort + reason
  const seen = new Set<string>();
  return alerts.filter((a) => {
    const key = `${a.spaceId}|${a.cohortId}|${a.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main batch runner
// ---------------------------------------------------------------------------

export interface BatchRunnerInput {
  config: SimulationConfig;
  rooms: LayoutRoomInfo[];
  maxFloors: number;
  programSpecId: string;
  /** Optional progress callback (0-1) */
  onProgress?: (progress: number) => void;
}

export async function runBatchSimulation(input: BatchRunnerInput): Promise<SimulationResult> {
  const t0 = performance.now();
  const { config, rooms, maxFloors, programSpecId, onProgress } = input;

  // Build lookup structures
  const roomMap = new Map(rooms.map((r) => [r.spaceId, r]));
  const graph = buildAdjacencyGraph(rooms, maxFloors);
  const envOverrides = new Map(config.roomEnvironments.map((e) => [e.spaceId, e]));

  // Build scenario matrix
  const totalScenarios = config.cohorts.length * config.tasks.length;
  const scenarioResults: ScenarioResult[] = [];

  let completed = 0;
  for (const cohort of config.cohorts) {
    for (const task of config.tasks) {
      // Check if origin and destination exist in layout
      // If not, skip gracefully (some tasks may reference rooms not in this layout)
      if (!roomMap.has(task.originSpaceId) && !roomMap.has(task.destinationSpaceId)) {
        completed++;
        continue;
      }

      const result = runScenario(cohort, task, roomMap, graph, envOverrides);
      scenarioResults.push(result);

      completed++;
      if (onProgress) {
        onProgress(completed / totalScenarios);
      }

      // Yield to UI every 10 scenarios
      if (completed % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  // Aggregate
  const roomAggregates = aggregateRoomStats(scenarioResults, roomMap);
  const cohortSummaries = aggregateCohortStats(scenarioResults, config.cohorts, roomMap);
  const alerts = collectAlerts(scenarioResults, config.cohorts);

  // Global statistics
  const allScores = scenarioResults.map((r) => r.combinedScore);
  const avgScore =
    allScores.length > 0
      ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 1000) / 1000
      : 0;

  const worstRoom = roomAggregates.length > 0 ? roomAggregates[0].spaceName : "N/A";
  const bestRoom =
    roomAggregates.length > 0 ? roomAggregates[roomAggregates.length - 1].spaceName : "N/A";

  const sortedCohorts = [...cohortSummaries].sort((a, b) => a.avgScore - b.avgScore);
  const worstCohort = sortedCohorts.length > 0 ? sortedCohorts[0].cohortLabel : "N/A";
  const bestCohort =
    sortedCohorts.length > 0 ? sortedCohorts[sortedCohorts.length - 1].cohortLabel : "N/A";

  const totalComputeTimeMs = Math.round((performance.now() - t0) * 100) / 100;

  return {
    schemaVersion: "1.0.0",
    timestamp: new Date().toISOString(),
    programSpecId,
    cohorts: config.cohorts,
    tasks: config.tasks,
    roomEnvironments: config.roomEnvironments,
    scenarioResults,
    roomAggregates,
    cohortSummaries,
    alerts,
    statistics: {
      totalScenarios: scenarioResults.length,
      totalAlerts: alerts.length,
      avgScore,
      worstRoom,
      bestRoom,
      worstCohort,
      bestCohort,
      totalComputeTimeMs,
    },
  };
}
