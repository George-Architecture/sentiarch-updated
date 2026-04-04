// ============================================================
// SentiArch Store - State Management & Computation Logic
// Multi-Agent System + Baseline Reset + Intervention Feedback Loop
// ============================================================

// ---- Types ----
export interface AgentData {
  id: string;
  age: number;
  gender: "male" | "female";
  mbti: string;
  mobility: "normal" | "walker" | "wheelchair" | "cane";
  hearing: "normal" | "impaired" | "deaf";
  vision: "normal" | "mild_impairment" | "severe_impairment";
  metabolic_rate: number;
  clothing_insulation: number;
}

export interface PositionData {
  cell: [number, number];
  timestamp: string;
  duration_in_cell: number;
}

export interface EnvironmentData {
  lux: number;
  dB: number;
  air_temp: number;
  humidity: number;
  air_velocity: number;
}

export interface SpatialData {
  dist_to_wall: number;
  dist_to_window: number;
  dist_to_exit: number;
  ceiling_h: number;
  enclosure_ratio: number;
  visible_agents: number;
}

export interface PersonaData {
  agent: AgentData;
  position: PositionData;
  environment: EnvironmentData;
  spatial: SpatialData;
}

export interface ExperienceData {
  summary: string;
  comfort_score: number;
  trend: "rising" | "declining" | "stable";
}

export interface AccumulatedState {
  thermal_discomfort: number;
  visual_strain: number;
  noise_stress: number;
  social_overload: number;
  fatigue: number;
  wayfinding_anxiety: number;
}

export interface ComputedOutputs {
  PMV: number;
  PPD: number;
  effective_lux: number;
  perceived_dB: number;
  pmv_warnings: string[];
}

export interface Shape {
  type: "room" | "wall" | "window" | "door";
  points: [number, number][];
  label?: string;
}

// ---- Geometry Helpers (used by zone env + spatial calculations) ----
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
}

function lineIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
): boolean {
  const dxAB = bx - ax, dyAB = by - ay;
  const dxCD = dx - cx, dyCD = dy - cy;
  const denom = dxAB * dyCD - dyAB * dxCD;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((cx - ax) * dyCD - (cy - ay) * dxCD) / denom;
  const u = ((cx - ax) * dyAB - (cy - ay) * dxAB) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// ---- Zone Environment Data ----
export interface ZoneBounds {
  x: number;      // top-left x in world coords (mm)
  y: number;      // top-left y in world coords (mm)
  width: number;  // width in world coords (mm)
  height: number; // height in world coords (mm)
  points?: [number, number][]; // Optional points for polygon zones
}

export interface ZoneEnv {
  temperature: number;   // °C
  humidity: number;      // %
  light: number;         // lux
  noise: number;         // dB
  air_velocity: number;  // m/s
}

export interface Zone {
  id: string;
  label?: string;
  bounds: ZoneBounds;
  env: ZoneEnv;
}

export const defaultZoneEnv: ZoneEnv = {
  temperature: 24,
  humidity: 55,
  light: 300,
  noise: 55,
  air_velocity: 0.1,
};

/** Check if a point (world coords) is inside a zone's bounds */
function isPointInZone(px: number, py: number, z: ZoneBounds): boolean {
  if (z.points && z.points.length >= 3) {
    // Ray-casting algorithm for polygon containment
    let inside = false;
    for (let i = 0, j = z.points.length - 1; i < z.points.length; j = i++) {
      const xi = z.points[i][0], yi = z.points[i][1];
      const xj = z.points[j][0], yj = z.points[j][1];
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  // Fallback to rectangle
  return px >= z.x && px <= z.x + z.width && py >= z.y && py <= z.y + z.height;
}

/**
 * Bilinear interpolation between two ZoneEnv values.
 * t = 0 → returns a, t = 1 → returns b
 */
function lerpEnv(a: ZoneEnv, b: ZoneEnv, t: number): ZoneEnv {
  const cl = Math.max(0, Math.min(1, t));
  return {
    temperature: a.temperature + (b.temperature - a.temperature) * cl,
    humidity: a.humidity + (b.humidity - a.humidity) * cl,
    light: a.light + (b.light - a.light) * cl,
    noise: a.noise + (b.noise - a.noise) * cl,
    air_velocity: a.air_velocity + (b.air_velocity - a.air_velocity) * cl,
  };
}

/**
 * Get environment parameters at a world position.
 * - If inside exactly one zone → return that zone's env
 * - If inside multiple overlapping zones → average them
 * - If outside all zones but within BLEND_MARGIN of a zone edge → interpolate
 * - If outside all zones → return default env
 */
const BLEND_MARGIN = 500; // mm — interpolation margin near zone edges

/**
 * Compute window influence on environment at a given position.
 * Windows boost light (lux) and air_velocity based on proximity.
 * Uses inverse-square-like falloff with a max influence radius.
 */
const WINDOW_INFLUENCE_RADIUS = 5000; // mm — max distance a window affects env
const WINDOW_LIGHT_BOOST = 400; // lux — max additional light from a window at distance 0
const WINDOW_AIR_BOOST = 0.15; // m/s — max additional air velocity from a window at distance 0

export function computeWindowInfluence(
  px: number, py: number, shapes: Shape[]
): { lightBoost: number; airBoost: number } {
  const windows = shapes.filter(s => s.type === "window");
  if (windows.length === 0) return { lightBoost: 0, airBoost: 0 };

  let totalLightBoost = 0;
  let totalAirBoost = 0;

  for (const win of windows) {
    // Find closest distance from point to window segment
    let minDist = Infinity;
    for (let i = 0; i < win.points.length - 1; i++) {
      const d = distToSegment(
        px, py,
        win.points[i][0], win.points[i][1],
        win.points[i + 1][0], win.points[i + 1][1]
      );
      if (d < minDist) minDist = d;
    }
    // Single point window
    if (win.points.length === 1) {
      minDist = Math.sqrt((px - win.points[0][0]) ** 2 + (py - win.points[0][1]) ** 2);
    }

    if (minDist <= WINDOW_INFLUENCE_RADIUS) {
      // Smooth falloff: 1 at distance 0, 0 at WINDOW_INFLUENCE_RADIUS
      const t = 1 - minDist / WINDOW_INFLUENCE_RADIUS;
      const falloff = t * t; // quadratic falloff for natural light decay
      totalLightBoost += WINDOW_LIGHT_BOOST * falloff;
      totalAirBoost += WINDOW_AIR_BOOST * falloff;
    }
  }

  return {
    lightBoost: Math.round(totalLightBoost),
    airBoost: Math.round(totalAirBoost * 100) / 100,
  };
}

/**
 * Extract collision boundaries from wall and room shapes.
 * Returns an array of line segments that agents cannot cross.
 */
export interface CollisionSegment {
  x1: number; y1: number;
  x2: number; y2: number;
  type: "wall" | "room";
}

export function getCollisionBoundaries(shapes: Shape[]): CollisionSegment[] {
  const segments: CollisionSegment[] = [];

  for (const shape of shapes) {
    if (shape.type === "wall") {
      // Wall: each consecutive pair of points is a collision segment
      for (let i = 0; i < shape.points.length - 1; i++) {
        segments.push({
          x1: shape.points[i][0], y1: shape.points[i][1],
          x2: shape.points[i + 1][0], y2: shape.points[i + 1][1],
          type: "wall",
        });
      }
    } else if (shape.type === "room") {
      // Room polygon edges are also collision boundaries
      for (let i = 0; i < shape.points.length; i++) {
        const j = (i + 1) % shape.points.length;
        segments.push({
          x1: shape.points[i][0], y1: shape.points[i][1],
          x2: shape.points[j][0], y2: shape.points[j][1],
          type: "room",
        });
      }
    }
  }

  return segments;
}

/**
 * Check if a line segment from A to B crosses any collision boundary.
 * Used for pathfinding to ensure agents don't walk through walls.
 */
export function doesPathCrossWall(
  ax: number, ay: number, bx: number, by: number, shapes: Shape[]
): boolean {
  const boundaries = getCollisionBoundaries(shapes);
  for (const seg of boundaries) {
    if (lineIntersect(ax, ay, bx, by, seg.x1, seg.y1, seg.x2, seg.y2)) {
      return true;
    }
  }
  return false;
}

/**
 * Get environment parameters at a world position.
 * Now also considers window influence on light and air velocity.
 */
export function getEnvAtPosition(px: number, py: number, zones: Zone[], shapes?: Shape[]): ZoneEnv {
  if (zones.length === 0) return { ...defaultZoneEnv };

  // Check which zones contain this point
  const containingZones = zones.filter(z => isPointInZone(px, py, z.bounds));

  if (containingZones.length === 1) {
    const env = { ...containingZones[0].env };
    if (shapes && shapes.length > 0) {
      const { lightBoost, airBoost } = computeWindowInfluence(px, py, shapes);
      env.light += lightBoost;
      env.air_velocity += airBoost;
    }
    return env;
  }

  if (containingZones.length > 1) {
    // Average overlapping zones
    const avg: ZoneEnv = { temperature: 0, humidity: 0, light: 0, noise: 0, air_velocity: 0 };
    for (const z of containingZones) {
      avg.temperature += z.env.temperature;
      avg.humidity += z.env.humidity;
      avg.light += z.env.light;
      avg.noise += z.env.noise;
      avg.air_velocity += z.env.air_velocity;
    }
    const n = containingZones.length;
    avg.temperature /= n;
    avg.humidity /= n;
    avg.light /= n;
    avg.noise /= n;
    avg.air_velocity /= n;
    if (shapes && shapes.length > 0) {
      const { lightBoost, airBoost } = computeWindowInfluence(px, py, shapes);
      avg.light += lightBoost;
      avg.air_velocity += airBoost;
    }
    return avg;
  }

  // Not inside any zone — check proximity for blending
  let closestZone: Zone | null = null;
  let closestDist = Infinity;

  for (const z of zones) {
    const b = z.bounds;
    // Clamp point to zone bounds to find nearest edge point
    const cx = Math.max(b.x, Math.min(px, b.x + b.width));
    const cy = Math.max(b.y, Math.min(py, b.y + b.height));
    const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
    if (dist < closestDist) {
      closestDist = dist;
      closestZone = z;
    }
  }

  if (closestZone && closestDist <= BLEND_MARGIN) {
    // Interpolate: closer to zone → more zone-like
    const t = 1 - closestDist / BLEND_MARGIN; // 1 at edge, 0 at margin
    const blended = lerpEnv(defaultZoneEnv, closestZone.env, t);
    if (shapes && shapes.length > 0) {
      const { lightBoost, airBoost } = computeWindowInfluence(px, py, shapes);
      blended.light += lightBoost;
      blended.air_velocity += airBoost;
    }
    return blended;
  }

  // Apply window influence
  const baseEnv = { ...defaultZoneEnv };
  if (shapes && shapes.length > 0) {
    const { lightBoost, airBoost } = computeWindowInfluence(px, py, shapes);
    baseEnv.light += lightBoost;
    baseEnv.air_velocity += airBoost;
  }
  return baseEnv;
}

/** Convert ZoneEnv to EnvironmentData (field name mapping) */
export function zoneEnvToEnvironment(ze: ZoneEnv): EnvironmentData {
  return {
    lux: Math.round(ze.light),
    dB: Math.round(ze.noise * 10) / 10,
    air_temp: Math.round(ze.temperature * 10) / 10,
    humidity: Math.round(ze.humidity * 10) / 10,
    air_velocity: Math.round(ze.air_velocity * 100) / 100,
  };
}

export interface AgentPosition {
  x: number;
  y: number;
}

// ---- Waypoint & Route System ----
export interface Waypoint {
  id: string;
  label: string;
  position: AgentPosition; // world coords (mm)
  dwell_minutes: number;   // how long agent stays at this point
}

// ---- Derived Metrics ----
export function computeStressScore(acc: AccumulatedState): number {
  // Weighted average of all accumulated stress dimensions (0-10 scale)
  const weights = {
    thermal_discomfort: 0.20,
    visual_strain: 0.15,
    noise_stress: 0.20,
    social_overload: 0.15,
    fatigue: 0.15,
    wayfinding_anxiety: 0.15,
  };
  const score = (
    acc.thermal_discomfort * weights.thermal_discomfort +
    acc.visual_strain * weights.visual_strain +
    acc.noise_stress * weights.noise_stress +
    acc.social_overload * weights.social_overload +
    acc.fatigue * weights.fatigue +
    acc.wayfinding_anxiety * weights.wayfinding_anxiety
  );
  return Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;
}

export interface HeatmapPoint {
  x: number;
  y: number;
  value: number; // 0-10 stress score
  agentIdx: number;
}

export interface PerceptionLogEntry {
  waypoint_id: string;
  phase: "walking" | "dwelling";
  from?: string;           // waypoint_id of origin (for walking phase)
  to?: string;             // waypoint_id of destination (for walking phase)
  position: AgentPosition;
  environment: EnvironmentData;
  spatial: SpatialData;
  computed: ComputedOutputs;
  experience: ExperienceData;
  accState: AccumulatedState;
  triggers: string[];
  timestamp: string;
}

export interface AgentRoute {
  waypoints: Waypoint[];
  perceptionLog: PerceptionLogEntry[];
}

// ---- Multi-Agent Per-Persona State ----
export interface PersonaState {
  persona: PersonaData;
  experience: ExperienceData;
  accState: AccumulatedState;
  computed: ComputedOutputs;
  triggers: string[];
  prevExperience: ExperienceData | null;
  prevAccState: AccumulatedState | null;
  agentPos: AgentPosition | null;
  hasSimulated: boolean; // tracks if this persona has ever been simulated
  route: AgentRoute;     // waypoint route + perception log
}

// ---- Persona Colors & Identities ----
export const PERSONA_COLORS_PRESETS = [
  { primary: "#B85C38", secondary: "#D4856A", bg: "rgba(184, 92, 56, 0.15)", label: "P1" },
  { primary: "#2E6B8A", secondary: "#5A9AB5", bg: "rgba(46, 107, 138, 0.15)", label: "P2" },
  { primary: "#6B8E5A", secondary: "#8FB87A", bg: "rgba(107, 142, 90, 0.15)", label: "P3" },
  { primary: "#8B5E83", secondary: "#B07DA8", bg: "rgba(139, 94, 131, 0.15)", label: "P4" },
  { primary: "#C47A2B", secondary: "#D9A05C", bg: "rgba(196, 122, 43, 0.15)", label: "P5" },
  { primary: "#4A7B8C", secondary: "#6FA0B0", bg: "rgba(74, 123, 140, 0.15)", label: "P6" },
  { primary: "#7B6B4A", secondary: "#A08E6A", bg: "rgba(123, 107, 74, 0.15)", label: "P7" },
  { primary: "#5A6B8E", secondary: "#7A8FB8", bg: "rgba(90, 107, 142, 0.15)", label: "P8" },
];

export function getPersonaColor(index: number) {
  if (index < PERSONA_COLORS_PRESETS.length) return PERSONA_COLORS_PRESETS[index];
  // Generate deterministic color for indices beyond presets
  const hue = (index * 137.508) % 360; // golden angle
  const s = 45 + (index % 3) * 10;
  const l = 35 + (index % 4) * 5;
  const primary = `hsl(${hue}, ${s}%, ${l}%)`;
  const secondary = `hsl(${hue}, ${s}%, ${l + 20}%)`;
  const bg = `hsla(${hue}, ${s}%, ${l}%, 0.15)`;
  return { primary, secondary, bg, label: `P${index + 1}` };
}

// Backward-compatible alias
export const PERSONA_COLORS = PERSONA_COLORS_PRESETS;

// ---- Defaults ----
export const defaultEnvironment: EnvironmentData = {
  lux: 300,
  dB: 55,
  air_temp: 24,
  humidity: 55,
  air_velocity: 0.1,
};

export const defaultPersonas: PersonaData[] = [
  {
    // Persona 01: Elderly female, low metabolism, thick clothing → feels comfortable at 24°C (PMV ≈ +0.03)
    agent: {
      id: "persona_01",
      age: 75,
      gender: "female",
      mbti: "ISFJ",
      mobility: "walker",
      hearing: "impaired",
      vision: "mild_impairment",
      metabolic_rate: 0.8,
      clothing_insulation: 1.2,
    },
    position: { cell: [0, 0], timestamp: "14:30", duration_in_cell: 45 },
    environment: { ...defaultEnvironment },
    spatial: { dist_to_wall: 0, dist_to_window: 0, dist_to_exit: 0, ceiling_h: 2.8, enclosure_ratio: 0, visible_agents: 0 },
  },
  {
    // Persona 02: Young male, high metabolism, thin clothing → feels warm/hot at 24°C (PMV ≈ +0.46)
    agent: {
      id: "persona_02",
      age: 28,
      gender: "male",
      mbti: "ENTP",
      mobility: "normal",
      hearing: "normal",
      vision: "normal",
      metabolic_rate: 1.6,
      clothing_insulation: 0.5,
    },
    position: { cell: [0, 0], timestamp: "14:30", duration_in_cell: 30 },
    environment: { ...defaultEnvironment },
    spatial: { dist_to_wall: 0, dist_to_window: 0, dist_to_exit: 0, ceiling_h: 2.8, enclosure_ratio: 0, visible_agents: 0 },
  },
  {
    // Persona 03: Middle-aged female, mid metabolism, severe vision impairment → thermally neutral but high visual load (PMV ≈ -0.08, EffLux = 150)
    agent: {
      id: "persona_03",
      age: 45,
      gender: "female",
      mbti: "INFP",
      mobility: "normal",
      hearing: "normal",
      vision: "severe_impairment",
      metabolic_rate: 1.0,
      clothing_insulation: 0.8,
    },
    position: { cell: [0, 0], timestamp: "14:30", duration_in_cell: 60 },
    environment: { ...defaultEnvironment },
    spatial: { dist_to_wall: 0, dist_to_window: 0, dist_to_exit: 0, ceiling_h: 2.8, enclosure_ratio: 0, visible_agents: 0 },
  },
];

// Factory function for creating new agents with dynamic index
export function createNewPersona(index: number): PersonaData {
  return {
    agent: {
      id: `persona_${String(index + 1).padStart(2, "0")}`,
      age: 30,
      gender: "male",
      mbti: "INTJ",
      mobility: "normal",
      hearing: "normal",
      vision: "normal",
      metabolic_rate: 1.2,
      clothing_insulation: 0.7,
    },
    position: { cell: [0, 0], timestamp: "14:30", duration_in_cell: 30 },
    environment: { ...defaultEnvironment },
    spatial: { dist_to_wall: 0, dist_to_window: 0, dist_to_exit: 0, ceiling_h: 2.8, enclosure_ratio: 0, visible_agents: 0 },
  };
}

export const defaultExperience: ExperienceData = {
  summary:
    'Waiting for calculation... Click "Calculate Current Respond" to generate experience narrative.',
  comfort_score: 0,
  trend: "stable",
};

export const defaultAccumulatedState: AccumulatedState = {
  thermal_discomfort: 0.25,
  visual_strain: 0.35,
  noise_stress: 0.40,
  social_overload: 0.15,
  fatigue: 0.30,
  wayfinding_anxiety: 0.20,
};

export const defaultComputedOutputs: ComputedOutputs = {
  PMV: 0,
  PPD: 5,
  effective_lux: 0,
  perceived_dB: 0,
  pmv_warnings: [],
};

// ---- Baseline Reset: Agent Core Fields ----
// When these fields change, previous results are cleared (treated as first simulation)
export const AGENT_CORE_FIELDS: (keyof AgentData)[] = [
  "mbti", "age", "gender", "mobility", "hearing", "vision", "id",
];

export function isAgentCoreChange(prev: AgentData, next: AgentData): boolean {
  return AGENT_CORE_FIELDS.some((k) => prev[k] !== next[k]);
}

// ---- PMV/PPD Calculation (pythermalcomfort-inspired, ISO 7730 Fanger) ----
export function calculatePMV(
  tdb: number, tr: number, vr: number, rh: number, met: number, clo: number
): { pmv: number; ppd: number } {
  const M = met * 58.15;
  const W = 0;
  const Icl = clo * 0.155;
  const pa = (rh / 100) * 610.5 * Math.exp((17.269 * tdb) / (237.3 + tdb));
  const fcl = clo <= 0.078 ? 1.0 + 1.29 * Icl : 1.05 + 0.645 * Icl;

  let tcl = 35.7 - 0.028 * (M - W) - Icl * (
    3.96e-8 * fcl * (Math.pow(35.7 - 0.028 * (M - W) + 273, 4) - Math.pow(tr + 273, 4))
  );

  for (let i = 0; i < 150; i++) {
    const hcn = 2.38 * Math.pow(Math.abs(tcl - tdb), 0.25);
    const hcf = 12.1 * Math.sqrt(vr);
    const hc = Math.max(hcn, hcf);
    const tclNew = 35.7 - 0.028 * (M - W) - Icl * (
      3.96e-8 * fcl * (Math.pow(tcl + 273, 4) - Math.pow(tr + 273, 4)) +
      fcl * hc * (tcl - tdb)
    );
    if (Math.abs(tclNew - tcl) < 0.00015) { tcl = tclNew; break; }
    tcl = 0.5 * tcl + 0.5 * tclNew;
  }

  const hcn = 2.38 * Math.pow(Math.abs(tcl - tdb), 0.25);
  const hcf = 12.1 * Math.sqrt(vr);
  const hc = Math.max(hcn, hcf);

  const pmv = (0.303 * Math.exp(-0.036 * M) + 0.028) * (
    (M - W)
    - 3.05e-3 * (5733 - 6.99 * (M - W) - pa)
    - 0.42 * ((M - W) - 58.15)
    - 1.7e-5 * M * (5867 - pa)
    - 0.0014 * M * (34 - tdb)
    - 3.96e-8 * fcl * (Math.pow(tcl + 273, 4) - Math.pow(tr + 273, 4))
    - fcl * hc * (tcl - tdb)
  );

  const ppd = 100 - 95 * Math.exp(-0.03353 * Math.pow(pmv, 4) - 0.2179 * Math.pow(pmv, 2));
  return {
    pmv: isNaN(pmv) ? 0 : Math.round(pmv * 100) / 100,
    ppd: isNaN(ppd) ? 5 : Math.round(ppd * 10) / 10,
  };
}

// ---- thermBAL-aligned PMV Validity Warnings ----
export function getPMVWarnings(
  tdb: number, rh: number, vr: number, met: number, clo: number, pmv: number
): string[] {
  const warnings: string[] = [];
  // Air speed warning (thermBAL: >0.2 m/s)
  if (vr > 0.2) warnings.push("Elevated air speed: PMV may be unreliable; consider SET.");
  // Humidity warnings (thermBAL: <20% or >80%)
  if (rh < 20 || rh > 80) warnings.push("Extreme humidity may reduce PMV reliability.");
  // Temperature bounds (thermBAL: 10–35°C)
  if (tdb < 10 || tdb > 35) warnings.push("Air temperature outside typical PMV bounds (10–35 °C).");
  // Met bounds (thermBAL: 0.8–2.0 met)
  if (met < 0.8 || met > 2.0) warnings.push("Met outside typical PMV range (0.8–2.0).");
  // Clo bounds (thermBAL: 0–2 clo)
  if (clo > 2) warnings.push("High clothing insulation (>2 clo).");
  // PMV out of scale
  if (Math.abs(pmv) > 3) warnings.push("PMV value outside comfort scale range (−3 to +3).");
  return warnings;
}

export function computeOutputs(persona: PersonaData): ComputedOutputs {
  const { pmv, ppd } = calculatePMV(
    persona.environment.air_temp, persona.environment.air_temp,
    persona.environment.air_velocity, persona.environment.humidity,
    persona.agent.metabolic_rate, persona.agent.clothing_insulation
  );
  const warnings = getPMVWarnings(
    persona.environment.air_temp, persona.environment.humidity,
    persona.environment.air_velocity, persona.agent.metabolic_rate,
    persona.agent.clothing_insulation, pmv
  );
  const visionFactor = persona.agent.vision === "normal" ? 1 : persona.agent.vision === "mild_impairment" ? 0.75 : 0.5;
  const hearingFactor = persona.agent.hearing === "normal" ? 1 : persona.agent.hearing === "impaired" ? 1.1 : 0.7;
  return {
    PMV: pmv, PPD: ppd,
    effective_lux: Math.round(persona.environment.lux * visionFactor),
    perceived_dB: Math.round(persona.environment.dB * hearingFactor),
    pmv_warnings: warnings,
  };
}

// ---- Perceptual Load ----
export function computePerceptualLoad(persona: PersonaData, computed: ComputedOutputs): AccumulatedState {
  const thermalDiscomfort = Math.min(1, Math.abs(computed.PMV) / 3);
  const optimalLux = 300;
  const luxDev = Math.abs(persona.environment.lux - optimalLux) / optimalLux;
  const visionPenalty = persona.agent.vision === "normal" ? 0 : persona.agent.vision === "mild_impairment" ? 0.15 : 0.3;
  const visualStrain = Math.min(1, luxDev * 0.6 + visionPenalty);
  const noiseBase = persona.environment.dB > 70 ? 0.8 : persona.environment.dB > 55 ? 0.4 : persona.environment.dB > 40 ? 0.2 : 0.05;
  const hearingPenalty = persona.agent.hearing === "impaired" ? 0.15 : persona.agent.hearing === "deaf" ? -0.1 : 0;
  const noiseStress = Math.min(1, Math.max(0, noiseBase + hearingPenalty));
  const isIntrovert = persona.agent.mbti.startsWith("I");
  const socialBase = persona.spatial.visible_agents > 5 ? 0.6 : persona.spatial.visible_agents > 2 ? 0.3 : 0.1;
  const socialOverload = Math.min(1, socialBase + (isIntrovert ? 0.2 : -0.1));
  const durationFactor = Math.min(1, persona.position.duration_in_cell / 120);
  const ageFactor = persona.agent.age > 65 ? 0.2 : persona.agent.age > 45 ? 0.1 : 0;
  const fatigue = Math.min(1, durationFactor * 0.5 + ageFactor + thermalDiscomfort * 0.2);
  const exitFactor = persona.spatial.dist_to_exit > 10 ? 0.5 : persona.spatial.dist_to_exit > 5 ? 0.3 : 0.1;
  const mobilityPenalty = persona.agent.mobility !== "normal" ? 0.2 : 0;
  const wayfindingAnxiety = Math.min(1, exitFactor + mobilityPenalty);

  return {
    thermal_discomfort: Math.round(thermalDiscomfort * 100) / 100,
    visual_strain: Math.round(visualStrain * 100) / 100,
    noise_stress: Math.round(noiseStress * 100) / 100,
    social_overload: Math.round(socialOverload * 100) / 100,
    fatigue: Math.round(fatigue * 100) / 100,
    wayfinding_anxiety: Math.round(wayfindingAnxiety * 100) / 100,
  };
}

// ---- Spatial Calculations ----

export function distToShapeType(ax: number, ay: number, shapes: Shape[], type: string): number {
  let minDist = Infinity;
  // For wall distance, also include actual wall shapes
  const types = type === "room" ? ["room", "wall"] : [type];
  const filtered = shapes.filter((s) => types.includes(s.type));
  if (filtered.length === 0) return -1; // -1 = no shape of this type drawn
  for (const shape of filtered) {
    const pts = shape.points;
    const isPolygon = shape.type === "room" && pts.length > 2;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      // For non-polygon shapes, don't wrap around
      if (!isPolygon && j === 0 && pts.length > 1) continue;
      const d = distToSegment(ax, ay, pts[i][0], pts[i][1], pts[j][0], pts[j][1]);
      if (d < minDist) minDist = d;
    }
  }
  return minDist === Infinity ? -1 : Math.round(minDist / 100) / 10;
}

export function computeEnclosure(ax: number, ay: number, shapes: Shape[]): number {
  const rooms = shapes.filter((s) => s.type === "room");
  const walls = shapes.filter((s) => s.type === "wall");
  if (rooms.length === 0 && walls.length === 0) return 0;
  const rays = 16;
  let hits = 0;
  const reach = 10000;
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2;
    const ex = ax + Math.cos(angle) * reach;
    const ey = ay + Math.sin(angle) * reach;
    let rayHit = false;
    // Check room polygon edges
    for (const room of rooms) {
      if (rayHit) break;
      const pts = room.points;
      for (let j = 0; j < pts.length; j++) {
        const k = (j + 1) % pts.length;
        if (lineIntersect(ax, ay, ex, ey, pts[j][0], pts[j][1], pts[k][0], pts[k][1])) {
          rayHit = true; break;
        }
      }
    }
    // Check wall segments
    if (!rayHit) {
      for (const wall of walls) {
        if (rayHit) break;
        const pts = wall.points;
        for (let j = 0; j < pts.length - 1; j++) {
          if (lineIntersect(ax, ay, ex, ey, pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1])) {
            rayHit = true; break;
          }
        }
      }
    }
    if (rayHit) hits++;
  }
  return Math.round((hits / rays) * 100) / 100;
}

// ---- Point-in-Polygon (for vis.agent room detection) ----
export function isPointInRoom(px: number, py: number, roomPoints: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = roomPoints.length - 1; i < roomPoints.length; j = i++) {
    const xi = roomPoints[i][0], yi = roomPoints[i][1];
    const xj = roomPoints[j][0], yj = roomPoints[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export function computeSpatialFromAgent(
  pos: AgentPosition, shapes: Shape[], currentSpatial: SpatialData
): SpatialData {
  const distWall = distToShapeType(pos.x, pos.y, shapes, "room");
  const distWin = distToShapeType(pos.x, pos.y, shapes, "window");
  const distDoor = distToShapeType(pos.x, pos.y, shapes, "door");
  const enclosure = computeEnclosure(pos.x, pos.y, shapes);
  return {
    dist_to_wall: distWall,
    dist_to_window: distWin,
    // -1 means no shape found; prefer door, fallback to wall, else -1
    dist_to_exit: distDoor >= 0 ? distDoor : distWall >= 0 ? distWall : -1,
    ceiling_h: currentSpatial.ceiling_h,
    enclosure_ratio: enclosure,
    visible_agents: currentSpatial.visible_agents, // will be overridden by computeVisibleAgents
  };
}

// ---- Vis.Agent Dynamic Calculation ----
// Counts how many OTHER agents are in the same room as the given agent
export function computeVisibleAgents(
  agentIdx: number,
  allPositions: (AgentPosition | null)[],
  shapes: Shape[]
): number {
  const myPos = allPositions[agentIdx];
  if (!myPos) return 0;

  const rooms = shapes.filter((s) => s.type === "room");
  // Find which room(s) this agent is in
  const myRooms = rooms.filter((r) => isPointInRoom(myPos.x, myPos.y, r.points));

  if (myRooms.length === 0) {
    // Agent is outside all rooms — can see other agents also outside
    let count = 0;
    for (let i = 0; i < allPositions.length; i++) {
      if (i === agentIdx || !allPositions[i]) continue;
      const otherPos = allPositions[i]!;
      const otherInRoom = rooms.some((r) => isPointInRoom(otherPos.x, otherPos.y, r.points));
      if (!otherInRoom) count++;
    }
    return count;
  }

  // Agent is inside room(s) — count others in same room(s)
  let count = 0;
  for (let i = 0; i < allPositions.length; i++) {
    if (i === agentIdx || !allPositions[i]) continue;
    const otherPos = allPositions[i]!;
    const sameRoom = myRooms.some((r) => isPointInRoom(otherPos.x, otherPos.y, r.points));
    if (sameRoom) count++;
  }
  return count;
}

export function posToCell(x: number, y: number, cellSize = 1000): [number, number] {
  return [Math.floor(x / cellSize), Math.floor(y / cellSize)];
}

// ---- LocalStorage Persistence ----
// Version bump forces all clients to reset to new default personas
const STORE_VERSION = "v3";
const SHAPES_KEY = `thesis_spatial_shapes_${STORE_VERSION}`;
const MULTI_AGENT_KEY = `thesis_multi_agent_${STORE_VERSION}`;
const ZONES_KEY = `thesis_zones_${STORE_VERSION}`;

// Clear any old versioned keys on load
if (typeof window !== "undefined") {
  ["thesis_spatial_shapes", "thesis_multi_agent",
   "thesis_spatial_shapes_v1", "thesis_multi_agent_v1",
   "thesis_spatial_shapes_v2", "thesis_multi_agent_v2"].forEach((k) => {
    try { localStorage.removeItem(k); } catch {}
  });
}

export function saveShapes(shapes: Shape[]) {
  try { localStorage.setItem(SHAPES_KEY, JSON.stringify(shapes)); } catch {}
}
export function loadShapes(): Shape[] {
  try { const s = localStorage.getItem(SHAPES_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
}
export function saveZones(zones: Zone[]) {
  try { localStorage.setItem(ZONES_KEY, JSON.stringify(zones)); } catch {}
}
export function loadZones(): Zone[] {
  try { const s = localStorage.getItem(ZONES_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
}
export function saveMultiAgent(data: { personas: PersonaData[]; positions: (AgentPosition | null)[] }) {
  try { localStorage.setItem(MULTI_AGENT_KEY, JSON.stringify(data)); } catch {}
}
export function loadMultiAgent(): { personas: PersonaData[]; positions: (AgentPosition | null)[] } | null {
  try { const s = localStorage.getItem(MULTI_AGENT_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}

// ---- Waypoint Persistence ----
const WAYPOINTS_KEY = `thesis_waypoints_${STORE_VERSION}`;

export function saveWaypoints(agentIdx: number, waypoints: Waypoint[]) {
  try {
    const all = loadAllWaypoints();
    all[agentIdx] = waypoints;
    localStorage.setItem(WAYPOINTS_KEY, JSON.stringify(all));
  } catch {}
}

export function loadAllWaypoints(): Record<number, Waypoint[]> {
  try {
    const s = localStorage.getItem(WAYPOINTS_KEY);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

export function loadWaypoints(agentIdx: number): Waypoint[] {
  return loadAllWaypoints()[agentIdx] || [];
}

// ---- LLM Integration ----
export function getLLMConfig(): { apiKey: string; apiUrl: string; model: string } | null {
  const raw = localStorage.getItem("llm_config");
  if (!raw) return null;
  const cfg = JSON.parse(raw);
  return cfg.apiKey ? cfg : null;
}

export function buildLLMPrompt(persona: PersonaData, computed: ComputedOutputs, shapes: Shape[]): string {
  const hasWindows = shapes.some((s) => s.type === "window");
  const hasDoors = shapes.some((s) => s.type === "door");
  const hasRooms = shapes.some((s) => s.type === "room");
  const windowCount = shapes.filter((s) => s.type === "window").length;
  const doorCount = shapes.filter((s) => s.type === "door").length;
  const roomCount = shapes.filter((s) => s.type === "room").length;

  const spatialContext = [
    `SPATIAL ELEMENTS ACTUALLY PRESENT ON MAP:`,
    `- Rooms: ${roomCount} ${hasRooms ? "(agent is inside a defined room)" : "(NO rooms defined)"}`,
    `- Windows: ${windowCount} ${hasWindows ? `(nearest: ${persona.spatial.dist_to_window} m)` : "(NO windows exist — NO natural light, NO outside view)"}`,
    `- Doors/Exits: ${doorCount} ${hasDoors ? `(nearest: ${persona.spatial.dist_to_exit} m)` : "(NO doors/exits defined)"}`,
  ].join("\n");

  const windowInstruction = hasWindows
    ? "The agent CAN perceive windows and natural light from them."
    : "CRITICAL: There are NO windows. Do NOT mention windows, views, or natural light.";

  return `You are simulating the subjective experience of a building occupant.

AGENT:
- ID: ${persona.agent.id}, Age: ${persona.agent.age}, Gender: ${persona.agent.gender}
- MBTI: ${persona.agent.mbti} (infer ALL personality-driven preferences from this)
- Mobility: ${persona.agent.mobility}, Hearing: ${persona.agent.hearing}, Vision: ${persona.agent.vision}
- Met: ${persona.agent.metabolic_rate}, Clo: ${persona.agent.clothing_insulation}

POSITION: Cell [${persona.position.cell.join(", ")}], Time: ${persona.position.timestamp}, Duration: ${persona.position.duration_in_cell} min

ENVIRONMENT: ${persona.environment.lux} lux, ${persona.environment.dB} dB, ${persona.environment.air_temp}°C, ${persona.environment.humidity}% RH, ${persona.environment.air_velocity} m/s

${spatialContext}
SPATIAL: Wall ${persona.spatial.dist_to_wall}m, Window ${hasWindows ? persona.spatial.dist_to_window + "m" : "N/A"}, Exit ${hasDoors ? persona.spatial.dist_to_exit + "m" : "N/A"}, Ceil ${persona.spatial.ceiling_h}m, Encl ${persona.spatial.enclosure_ratio}, VisAgents ${persona.spatial.visible_agents}
${windowInstruction}

COMPUTED: PMV ${computed.PMV}, PPD ${computed.PPD}%, EffLux ${computed.effective_lux}, PrdB ${computed.perceived_dB}

Respond in this exact JSON format (no markdown):
{
  "experience": { "summary": "2-3 sentence first-person narrative", "comfort_score": <1-10>, "trend": "<rising|declining|stable>" },
  "accumulated_state": { "thermal_discomfort": <0-1>, "visual_strain": <0-1>, "noise_stress": <0-1>, "social_overload": <0-1>, "fatigue": <0-1>, "wayfinding_anxiety": <0-1> },
  "rule_triggers": ["<tag1>", "<tag2>"]
}

As ${persona.agent.mbti}, reflect cognitive functions and emotional tendencies. Only reference spatial elements that ACTUALLY EXIST.`;
}

// ---- Walk / Dwell LLM Prompts ----
export function buildWalkPrompt(
  persona: PersonaData, computed: ComputedOutputs, shapes: Shape[],
  fromWP: Waypoint, toWP: Waypoint, currentPos: AgentPosition
): string {
  const base = buildLLMPrompt(persona, computed, shapes);
  return `${base}

CONTEXT: The agent is currently WALKING from "${fromWP.label}" (${fromWP.position.x}, ${fromWP.position.y}) to "${toWP.label}" (${toWP.position.x}, ${toWP.position.y}).
Current position along the path: (${currentPos.x}, ${currentPos.y}).
The agent is in transit — focus on the MOVEMENT EXPERIENCE: how the spatial transition feels, changes in light/sound/temperature as they walk, wayfinding clarity, and the emotional quality of the journey between spaces.
Keep the narrative brief (2-3 sentences) and first-person.`;
}

export function buildDwellPrompt(
  persona: PersonaData, computed: ComputedOutputs, shapes: Shape[],
  waypoint: Waypoint, dwellMinutes: number
): string {
  const base = buildLLMPrompt(persona, computed, shapes);
  return `${base}

CONTEXT: The agent has arrived at "${waypoint.label}" and is STAYING here for ${dwellMinutes} minutes.
Position: (${waypoint.position.x}, ${waypoint.position.y}).
Focus on the DWELLING EXPERIENCE: how the space feels after settling in, comfort level over time, sensory adaptation, social awareness, and overall satisfaction with this location.
Keep the narrative brief (2-3 sentences) and first-person.`;
}

export async function callLLMWithPrompt(
  prompt: string
): Promise<{
  experience: ExperienceData;
  accumulatedState: AccumulatedState;
  ruleTriggers: string[];
} | null> {
  const config = getLLMConfig();
  if (!config) return null;

  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: "You are an agent-based environmental experience model. Simulate how MBTI personality types experience architectural spaces. CRITICAL: Only reference spatial elements that are explicitly listed as present. Always respond with valid JSON only, no markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 1200,
      }),
    });

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    content = content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(content);
    return {
      experience: { summary: parsed.experience.summary, comfort_score: parsed.experience.comfort_score, trend: parsed.experience.trend },
      accumulatedState: parsed.accumulated_state,
      ruleTriggers: parsed.rule_triggers || [],
    };
  } catch (err) {
    console.error("LLM call failed:", err);
    return null;
  }
}

export async function callLLM(
  persona: PersonaData, computed: ComputedOutputs, shapes: Shape[] = []
): Promise<{
  experience: ExperienceData;
  accumulatedState: AccumulatedState;
  ruleTriggers: string[];
} | null> {
  const config = getLLMConfig();
  if (!config) return null;

  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: "You are an agent-based environmental experience model. Simulate how MBTI personality types experience architectural spaces. CRITICAL: Only reference spatial elements that are explicitly listed as present. Always respond with valid JSON only, no markdown." },
          { role: "user", content: buildLLMPrompt(persona, computed, shapes) },
        ],
        temperature: 0.8,
        max_tokens: 1200,
      }),
    });

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    content = content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(content);
    return {
      experience: { summary: parsed.experience.summary, comfort_score: parsed.experience.comfort_score, trend: parsed.experience.trend },
      accumulatedState: parsed.accumulated_state,
      ruleTriggers: parsed.rule_triggers || [],
    };
  } catch (err) {
    console.error("LLM call failed:", err);
    return null;
  }
}
