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
}

export interface Shape {
  type: "room" | "window" | "door";
  points: [number, number][];
  label?: string;
}

export interface AgentPosition {
  x: number;
  y: number;
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
}

// ---- Persona Colors & Identities ----
export const PERSONA_COLORS = [
  { primary: "#B85C38", secondary: "#D4856A", bg: "rgba(184, 92, 56, 0.15)", label: "P1" },
  { primary: "#2E6B8A", secondary: "#5A9AB5", bg: "rgba(46, 107, 138, 0.15)", label: "P2" },
  { primary: "#6B8E5A", secondary: "#8FB87A", bg: "rgba(107, 142, 90, 0.15)", label: "P3" },
];

// ---- Defaults ----
export const defaultEnvironment: EnvironmentData = {
  lux: 180,
  dB: 58,
  air_temp: 24,
  humidity: 55,
  air_velocity: 0.1,
};

export const defaultPersonas: PersonaData[] = [
  {
    agent: {
      id: "persona_01",
      age: 78,
      gender: "female",
      mbti: "ESFP",
      mobility: "walker",
      hearing: "impaired",
      vision: "mild_impairment",
      metabolic_rate: 0.8,
      clothing_insulation: 1,
    },
    position: { cell: [0, 0], timestamp: "14:30", duration_in_cell: 45 },
    environment: { ...defaultEnvironment },
    spatial: { dist_to_wall: 0, dist_to_window: 0, dist_to_exit: 0, ceiling_h: 2.8, enclosure_ratio: 0, visible_agents: 0 },
  },
  {
    agent: {
      id: "persona_02",
      age: 32,
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
  },
  {
    agent: {
      id: "persona_03",
      age: 55,
      gender: "female",
      mbti: "ENFJ",
      mobility: "cane",
      hearing: "normal",
      vision: "mild_impairment",
      metabolic_rate: 1.0,
      clothing_insulation: 0.9,
    },
    position: { cell: [0, 0], timestamp: "14:30", duration_in_cell: 60 },
    environment: { ...defaultEnvironment },
    spatial: { dist_to_wall: 0, dist_to_window: 0, dist_to_exit: 0, ceiling_h: 2.8, enclosure_ratio: 0, visible_agents: 0 },
  },
];

export const defaultExperience: ExperienceData = {
  summary:
    'Waiting for simulation... Click "Simulate Response" to generate experience narrative.',
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

export function computeOutputs(persona: PersonaData): ComputedOutputs {
  const { pmv, ppd } = calculatePMV(
    persona.environment.air_temp, persona.environment.air_temp,
    persona.environment.air_velocity, persona.environment.humidity,
    persona.agent.metabolic_rate, persona.agent.clothing_insulation
  );
  const visionFactor = persona.agent.vision === "normal" ? 1 : persona.agent.vision === "mild_impairment" ? 0.75 : 0.5;
  const hearingFactor = persona.agent.hearing === "normal" ? 1 : persona.agent.hearing === "impaired" ? 1.1 : 0.7;
  return {
    PMV: pmv, PPD: ppd,
    effective_lux: Math.round(persona.environment.lux * visionFactor),
    perceived_dB: Math.round(persona.environment.dB * hearingFactor),
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
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
}

export function distToShapeType(ax: number, ay: number, shapes: Shape[], type: string): number {
  let minDist = Infinity;
  const filtered = shapes.filter((s) => s.type === type);
  if (filtered.length === 0) return 0;
  for (const shape of filtered) {
    const pts = shape.points;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      if (type !== "room" && j === 0 && pts.length > 2) continue;
      const d = distToSegment(ax, ay, pts[i][0], pts[i][1], pts[j][0], pts[j][1]);
      if (d < minDist) minDist = d;
    }
  }
  return minDist === Infinity ? 0 : Math.round(minDist / 100) / 10;
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

export function computeEnclosure(ax: number, ay: number, shapes: Shape[]): number {
  const rooms = shapes.filter((s) => s.type === "room");
  if (rooms.length === 0) return 0;
  const rays = 16;
  let hits = 0;
  const reach = 10000;
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2;
    const ex = ax + Math.cos(angle) * reach;
    const ey = ay + Math.sin(angle) * reach;
    for (const room of rooms) {
      const pts = room.points;
      for (let j = 0; j < pts.length; j++) {
        const k = (j + 1) % pts.length;
        if (lineIntersect(ax, ay, ex, ey, pts[j][0], pts[j][1], pts[k][0], pts[k][1])) {
          hits++; break;
        }
      }
    }
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
    dist_to_exit: distDoor || distWall,
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
const SHAPES_KEY = "thesis_spatial_shapes";
const MULTI_AGENT_KEY = "thesis_multi_agent";

export function saveShapes(shapes: Shape[]) {
  try { localStorage.setItem(SHAPES_KEY, JSON.stringify(shapes)); } catch {}
}
export function loadShapes(): Shape[] {
  try { const s = localStorage.getItem(SHAPES_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
}
export function saveMultiAgent(data: { personas: PersonaData[]; positions: (AgentPosition | null)[] }) {
  try { localStorage.setItem(MULTI_AGENT_KEY, JSON.stringify(data)); } catch {}
}
export function loadMultiAgent(): { personas: PersonaData[]; positions: (AgentPosition | null)[] } | null {
  try { const s = localStorage.getItem(MULTI_AGENT_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
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
