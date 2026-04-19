/**
 * SentiArch — Route Simulation Engine
 *
 * Runs a single-agent route simulation from origin to destination,
 * computing comfort metrics at each waypoint along the corridor
 * network. Uses A* pathfinding with MBTI-influenced edge costs.
 *
 * Key design decisions:
 * - Graph is built from SelectedLayout rooms + corridors per floor,
 *   with virtual stairwell connections between floors.
 * - A* edge cost = Euclidean distance + MBTI social penalty.
 * - Introvert (I): public/sport edge cost ×1.5 (avoid crowds).
 * - Extravert (E): public/sport edge cost ×0.8 (prefer lively).
 * - Neuroticism (N in MBTI 4th letter): if a waypoint load > 0.5,
 *   that edge cost ×2.0 to discourage high-stress routes.
 * - Comfort at each waypoint reuses store.ts PMV/PPD + Perceptual Load.
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
  RoomEnvironment,
  RouteWaypoint,
  RouteSimulationResult,
} from "../../types/simulation";

import {
  DEFAULT_ROOM_ENVIRONMENTS,
  ROOM_SPECIFIC_ENVIRONMENTS,
  MBTI_SOCIAL_PENALTIES,
  NEUROTICISM_LOAD_THRESHOLD,
} from "../../types/simulation";

import type { LayoutRoomInfo } from "./batchRunner";

// ---------------------------------------------------------------------------
// Graph node — represents a room or corridor centroid
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  /** Human-readable name */
  name: string;
  /** Category (for MBTI penalty and colour) */
  category: string;
  /** Floor index */
  floorIndex: number;
  /** Centroid position (metres) */
  x: number;
  y: number;
  /** Area in m² */
  areaM2: number;
  /** Whether this touches exterior wall */
  touchesExterior: boolean;
  /** Whether this is a corridor (vs room) */
  isCorridor: boolean;
  /** Colour hex */
  colorHex: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Euclidean distance (metres) */
  distance: number;
}

export interface RouteGraph {
  nodes: Map<string, GraphNode>;
  /** Adjacency list: nodeId → array of { neighborId, distance } */
  adjacency: Map<string, { neighborId: string; distance: number }[]>;
}

// ---------------------------------------------------------------------------
// Build route graph from SelectedLayout
// ---------------------------------------------------------------------------

/**
 * Build a route graph from layout rooms and corridors.
 *
 * Nodes = rooms + corridors (centroids).
 * Edges = rooms sharing a wall/door, rooms connected to corridors,
 *         corridors connected to each other, and virtual stairwell links.
 */
export function buildRouteGraph(
  rooms: LayoutRoomInfo[],
  /** Corridor info extracted from layout (id, centroid, area, category) */
  corridors: { id: string; x: number; y: number; areaM2: number; floorIndex: number }[],
  maxFloors: number,
): RouteGraph {
  const nodes = new Map<string, GraphNode>();
  const adjacency = new Map<string, { neighborId: string; distance: number }[]>();

  const ensureAdj = (id: string) => {
    if (!adjacency.has(id)) adjacency.set(id, []);
  };

  // Add room nodes
  for (const room of rooms) {
    nodes.set(room.spaceId, {
      id: room.spaceId,
      name: room.name,
      category: room.category,
      floorIndex: room.floorIndex,
      x: room.centroidX ?? 0,
      y: room.centroidY ?? 0,
      areaM2: room.areaM2,
      touchesExterior: room.touchesExterior,
      isCorridor: false,
      colorHex: room.colorHex,
    });
    ensureAdj(room.spaceId);
  }

  // Add corridor nodes
  for (const corr of corridors) {
    const corrId = corr.id;
    nodes.set(corrId, {
      id: corrId,
      name: `Corridor ${corrId}`,
      category: "corridor",
      floorIndex: corr.floorIndex,
      x: corr.x,
      y: corr.y,
      areaM2: corr.areaM2,
      touchesExterior: false,
      isCorridor: true,
      colorHex: "#999999",
    });
    ensureAdj(corrId);
  }

  // Helper: add bidirectional edge
  const addEdge = (a: string, b: string) => {
    const nodeA = nodes.get(a);
    const nodeB = nodes.get(b);
    if (!nodeA || !nodeB) return;
    const dist = Math.sqrt((nodeA.x - nodeB.x) ** 2 + (nodeA.y - nodeB.y) ** 2);
    // Avoid duplicate edges
    const adjA = adjacency.get(a)!;
    if (!adjA.some((e) => e.neighborId === b)) {
      adjA.push({ neighborId: b, distance: Math.max(dist, 1) });
    }
    const adjB = adjacency.get(b)!;
    if (!adjB.some((e) => e.neighborId === a)) {
      adjB.push({ neighborId: a, distance: Math.max(dist, 1) });
    }
  };

  // Connect rooms on the same floor via adjacency list
  for (const room of rooms) {
    for (const adjId of room.adjacentRoomIds) {
      if (nodes.has(adjId)) {
        addEdge(room.spaceId, adjId);
      }
    }
  }

  // Connect all rooms on the same floor (corridor-mediated)
  const floorRooms = new Map<number, string[]>();
  for (const room of rooms) {
    if (!floorRooms.has(room.floorIndex)) floorRooms.set(room.floorIndex, []);
    floorRooms.get(room.floorIndex)!.push(room.spaceId);
  }

  // Connect corridors to rooms on the same floor (nearest rooms)
  for (const corr of corridors) {
    const sameFloor = floorRooms.get(corr.floorIndex) ?? [];
    for (const roomId of sameFloor) {
      addEdge(corr.id, roomId);
    }
  }

  // If no corridors, connect all same-floor rooms directly
  for (const [, roomIds] of Array.from(floorRooms.entries())) {
    if (roomIds.length <= 1) continue;
    // Ensure full connectivity on each floor
    for (let i = 0; i < roomIds.length; i++) {
      for (let j = i + 1; j < roomIds.length; j++) {
        addEdge(roomIds[i], roomIds[j]);
      }
    }
  }

  // Virtual stairwell connections between adjacent floors
  for (let f = 0; f < maxFloors - 1; f++) {
    const stairId = `__stairs_${f}_${f + 1}`;
    nodes.set(stairId, {
      id: stairId,
      name: `Stairs ${f}F-${f + 1}F`,
      category: "circulation",
      floorIndex: f,
      x: 0,
      y: 0,
      areaM2: 10,
      touchesExterior: false,
      isCorridor: true,
      colorHex: "#666666",
    });
    ensureAdj(stairId);

    const lower = floorRooms.get(f) ?? [];
    const upper = floorRooms.get(f + 1) ?? [];
    for (const rid of lower) addEdge(stairId, rid);
    for (const rid of upper) addEdge(stairId, rid);
  }

  return { nodes, adjacency };
}

// ---------------------------------------------------------------------------
// A* pathfinding with MBTI social penalty
// ---------------------------------------------------------------------------

interface AStarOptions {
  /** First letter of MBTI: 'I' or 'E' */
  ieType: "I" | "E";
  /** Whether the agent has high Neuroticism (4th letter = 'A' for turbulent) */
  isNeurotic: boolean;
  /** Pre-computed room environment overrides */
  envOverrides: Map<string, RoomEnvironment>;
  /** Room lookup */
  roomLookup: Map<string, LayoutRoomInfo>;
  /** Cohort for comfort pre-check (neuroticism) */
  cohort: AgentCohort;
}

/**
 * A* pathfinding with MBTI-influenced edge costs.
 *
 * Cost = distance + MBTI social penalty on public/sport nodes.
 * Heuristic = Euclidean distance to goal.
 */
export function aStarWithMBTI(
  graph: RouteGraph,
  startId: string,
  goalId: string,
  options: AStarOptions,
): string[] {
  const { ieType, isNeurotic } = options;

  if (startId === goalId) return [startId];
  if (!graph.nodes.has(startId) || !graph.nodes.has(goalId)) return [startId, goalId];

  const goalNode = graph.nodes.get(goalId)!;

  // Heuristic: Euclidean distance
  const heuristic = (nodeId: string): number => {
    const n = graph.nodes.get(nodeId);
    if (!n) return 0;
    return Math.sqrt((n.x - goalNode.x) ** 2 + (n.y - goalNode.y) ** 2);
  };

  // Edge cost with MBTI modifier
  const edgeCost = (fromId: string, toId: string, baseDist: number): number => {
    const toNode = graph.nodes.get(toId);
    if (!toNode) return baseDist;

    let cost = baseDist;

    // I/E social penalty on public/sport spaces
    const penalty = MBTI_SOCIAL_PENALTIES[ieType];
    if (penalty && penalty.categories.includes(toNode.category)) {
      cost *= penalty.costMultiplier;
    }

    // Neuroticism penalty: estimate load for the target node
    // Use a quick heuristic — public/sport/noisy rooms get penalty
    if (isNeurotic) {
      const highLoadCategories = ["sport", "public", "music"];
      if (highLoadCategories.includes(toNode.category)) {
        cost *= 2.0;
      }
    }

    return cost;
  };

  // A* implementation with priority queue (simple sorted array)
  const openSet = new Map<string, { f: number; g: number }>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();

  gScore.set(startId, 0);
  openSet.set(startId, { f: heuristic(startId), g: 0 });

  while (openSet.size > 0) {
    // Find node with lowest f score
    let currentId = "";
    let lowestF = Infinity;
    for (const [id, { f }] of Array.from(openSet.entries())) {
      if (f < lowestF) {
        lowestF = f;
        currentId = id;
      }
    }

    if (currentId === goalId) {
      // Reconstruct path
      const path: string[] = [];
      let c = goalId;
      while (c !== startId) {
        path.unshift(c);
        c = cameFrom.get(c) ?? startId;
      }
      path.unshift(startId);
      // Filter out virtual stair nodes for clean output
      return path.filter((id) => !id.startsWith("__stairs_"));
    }

    openSet.delete(currentId);
    const currentG = gScore.get(currentId) ?? Infinity;

    const neighbors = graph.adjacency.get(currentId) ?? [];
    for (const { neighborId, distance } of neighbors) {
      const tentativeG = currentG + edgeCost(currentId, neighborId, distance);
      const existingG = gScore.get(neighborId) ?? Infinity;

      if (tentativeG < existingG) {
        cameFrom.set(neighborId, currentId);
        gScore.set(neighborId, tentativeG);
        openSet.set(neighborId, {
          f: tentativeG + heuristic(neighborId),
          g: tentativeG,
        });
      }
    }
  }

  // No path found — return direct
  return [startId, goalId];
}

// ---------------------------------------------------------------------------
// Comfort computation at a single waypoint
// ---------------------------------------------------------------------------

function getEnvironmentForRoom(
  spaceId: string,
  category: string,
  overrides: Map<string, RoomEnvironment>,
): { airTemp: number; humidity: number; airVelocity: number; lux: number; noiseDb: number } {
  const catDefaults =
    DEFAULT_ROOM_ENVIRONMENTS[category] ?? DEFAULT_ROOM_ENVIRONMENTS["support"];
  let env = { ...catDefaults };

  // Room-specific overrides
  const specific = ROOM_SPECIFIC_ENVIRONMENTS[spaceId];
  if (specific) {
    if (specific.lux !== undefined) env.lux = specific.lux;
    if (specific.noiseDb !== undefined) env.noiseDb = specific.noiseDb;
    if (specific.airTemp !== undefined) env.airTemp = specific.airTemp;
  }

  // User overrides (highest priority)
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

function computeWaypointComfort(
  cohort: AgentCohort,
  node: GraphNode,
  envOverrides: Map<string, RoomEnvironment>,
  cumulativeDistanceM: number,
  waypointIndex: number,
  visibleAgents: number,
): RouteWaypoint {
  const env = getEnvironmentForRoom(node.id, node.category, envOverrides);

  const environment: EnvironmentData = {
    lux: env.lux,
    dB: env.noiseDb,
    air_temp: env.airTemp,
    humidity: env.humidity,
    air_velocity: env.airVelocity,
  };

  const spatial: SpatialData = {
    dist_to_wall: node.isCorridor ? 1.5 : 2,
    dist_to_window: node.touchesExterior ? 3 : 10,
    dist_to_exit: 5,
    ceiling_h: 3.6,
    enclosure_ratio: node.isCorridor ? 0.9 : 0.7,
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
      duration_in_cell: 1, // ~1 minute per waypoint transit
    },
    environment,
    spatial,
  };

  // PMV/PPD
  const { pmv, ppd } = calculatePMV(
    env.airTemp,
    env.airTemp,
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

  // Vision/hearing adjustments
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

  const load = computePerceptualLoad(persona, computed);

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

  // Alert check
  const alertReasons: string[] = [];
  if (pmv < -0.5) alertReasons.push(`PMV too low (${pmv.toFixed(2)})`);
  if (pmv > 0.5) alertReasons.push(`PMV too high (${pmv.toFixed(2)})`);
  if (ppd > 10) alertReasons.push(`PPD exceeds 10% (${ppd.toFixed(1)}%)`);
  if (aggregateLoad > 0.7) alertReasons.push(`Perceptual load > 0.7 (${aggregateLoad})`);

  return {
    index: waypointIndex,
    position: { x: node.x, y: node.y },
    roomId: node.id,
    roomName: node.name,
    category: node.category,
    floorIndex: node.floorIndex,
    pmv: Math.round(pmv * 100) / 100,
    ppd: Math.round(ppd * 10) / 10,
    perceptualLoad: {
      thermal_discomfort: Math.round(load.thermal_discomfort * 1000) / 1000,
      visual_strain: Math.round(load.visual_strain * 1000) / 1000,
      noise_stress: Math.round(load.noise_stress * 1000) / 1000,
      social_overload: Math.round(load.social_overload * 1000) / 1000,
      fatigue: Math.round(load.fatigue * 1000) / 1000,
      wayfinding_anxiety: Math.round(load.wayfinding_anxiety * 1000) / 1000,
    },
    aggregateLoad,
    cumulativeDistanceM: Math.round(cumulativeDistanceM * 10) / 10,
    isAlert: alertReasons.length > 0,
    alertReasons,
  };
}

// ---------------------------------------------------------------------------
// Main route simulation runner
// ---------------------------------------------------------------------------

export interface RouteRunnerInput {
  cohort: AgentCohort;
  originSpaceId: string;
  destinationSpaceId: string;
  rooms: LayoutRoomInfo[];
  corridors: { id: string; x: number; y: number; areaM2: number; floorIndex: number }[];
  maxFloors: number;
  envOverrides: Map<string, RoomEnvironment>;
}

/**
 * Run a single route simulation.
 *
 * 1. Build route graph from layout rooms + corridors.
 * 2. A* pathfinding with MBTI social penalty.
 * 3. Compute comfort at each waypoint.
 * 4. Aggregate results.
 */
export function runRouteSimulation(input: RouteRunnerInput): RouteSimulationResult {
  const t0 = performance.now();
  const { cohort, originSpaceId, destinationSpaceId, rooms, corridors, maxFloors, envOverrides } =
    input;

  // Build graph
  const graph = buildRouteGraph(rooms, corridors, maxFloors);

  // Determine MBTI modifiers
  const mbti = cohort.profile.mbti;
  const ieType: "I" | "E" = mbti.startsWith("I") ? "I" : "E";
  // Check for Neuroticism: in MBTI context, we use the 4th letter
  // 'T' (Turbulent) maps to high neuroticism, 'A' (Assertive) to low
  // But standard MBTI uses J/P — we'll use a simple heuristic:
  // F (Feeling) types are more sensitive to environmental stress
  const isNeurotic = mbti.length >= 3 && mbti[2] === "F";

  // A* pathfinding
  const path = aStarWithMBTI(graph, originSpaceId, destinationSpaceId, {
    ieType,
    isNeurotic,
    envOverrides,
    roomLookup: new Map(rooms.map((r) => [r.spaceId, r])),
    cohort,
  });

  const mbtiInfluenced = ieType === "I" || ieType === "E" || isNeurotic;

  // Estimate visible agents (based on cohort count and room category)
  const avgVisibleAgents = Math.min(5, Math.round(cohort.count / 3));

  // Compute waypoints with comfort
  let cumulativeDistance = 0;
  const waypoints: RouteWaypoint[] = [];

  for (let i = 0; i < path.length; i++) {
    const nodeId = path[i];
    const node = graph.nodes.get(nodeId);
    if (!node) continue;

    // Calculate distance from previous waypoint
    if (i > 0) {
      const prevNode = graph.nodes.get(path[i - 1]);
      if (prevNode) {
        cumulativeDistance += Math.sqrt(
          (node.x - prevNode.x) ** 2 + (node.y - prevNode.y) ** 2,
        );
      }
    }

    const waypoint = computeWaypointComfort(
      cohort,
      node,
      envOverrides,
      cumulativeDistance,
      i,
      avgVisibleAgents,
    );
    waypoints.push(waypoint);
  }

  // If no waypoints (shouldn't happen), create a fallback
  if (waypoints.length === 0) {
    const fallbackNode = graph.nodes.get(originSpaceId);
    if (fallbackNode) {
      waypoints.push(
        computeWaypointComfort(cohort, fallbackNode, envOverrides, 0, 0, avgVisibleAgents),
      );
    }
  }

  // Find worst and best points
  let worstPoint = waypoints[0];
  let bestPoint = waypoints[0];
  for (const wp of waypoints) {
    if (wp.aggregateLoad > worstPoint.aggregateLoad) worstPoint = wp;
    if (wp.aggregateLoad < bestPoint.aggregateLoad) bestPoint = wp;
  }

  // Comfort score: weighted average of waypoint comfort scores
  const waypointScores = waypoints.map((wp) => {
    const pmvScore = Math.max(0, 1 - Math.abs(wp.pmv) / 3);
    const ppdScore = Math.max(0, 1 - wp.ppd / 100);
    const loadScore = 1 - wp.aggregateLoad;
    return pmvScore * 0.3 + ppdScore * 0.3 + loadScore * 0.4;
  });
  const totalComfortScore =
    Math.round(
      (waypointScores.reduce((a, b) => a + b, 0) / waypointScores.length) * 1000,
    ) / 1000;

  // Estimated travel time: distance / walking speed (~1.2 m/s)
  const walkingSpeed = 1.2;
  const estimatedTimeSec = Math.round(cumulativeDistance / walkingSpeed);

  const computeTimeMs = Math.round((performance.now() - t0) * 100) / 100;

  // Get room names
  const originRoom = graph.nodes.get(originSpaceId);
  const destRoom = graph.nodes.get(destinationSpaceId);

  return {
    id: `route-${cohort.id}-${originSpaceId}-${destinationSpaceId}-${Date.now()}`,
    cohortId: cohort.id,
    cohortLabel: cohort.label,
    originSpaceId,
    originName: originRoom?.name ?? originSpaceId,
    destinationSpaceId,
    destinationName: destRoom?.name ?? destinationSpaceId,
    waypoints,
    totalDistanceM: Math.round(cumulativeDistance * 10) / 10,
    estimatedTimeSec,
    totalComfortScore,
    worstPoint,
    bestPoint,
    mbtiType: mbti,
    mbtiInfluenced,
    computeTimeMs,
  };
}
