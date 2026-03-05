// ============================================================
// SentiArch Store - State Management & Computation Logic
// Design: Pixel Architecture Art style
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

// ---- Defaults ----
export const defaultPersona: PersonaData = {
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
  position: {
    cell: [0, 0],
    timestamp: "14:30",
    duration_in_cell: 45,
  },
  environment: {
    lux: 180,
    dB: 58,
    air_temp: 24,
    humidity: 55,
    air_velocity: 0.1,
  },
  spatial: {
    dist_to_wall: 0,
    dist_to_window: 0,
    dist_to_exit: 0,
    ceiling_h: 2.8,
    enclosure_ratio: 0,
    visible_agents: 3,
  },
};

export const defaultExperience: ExperienceData = {
  summary:
    'Waiting for simulation... Click "Simulate Response" to generate experience narrative based on current persona and environment data.',
  comfort_score: 0,
  trend: "stable",
};

// Feedback #3: Default perceptual load values (not all zeros)
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

// ---- PMV/PPD Calculation (Feedback #2: pythermalcomfort-inspired) ----
// Based on ISO 7730 / ASHRAE 55 Fanger model
// Reference: pythermalcomfort by CBE (Center for the Built Environment)
// https://github.com/CenterForTheBuiltEnvironment/pythermalcomfort

export function calculatePMV(
  tdb: number,     // dry bulb air temperature [°C]
  tr: number,      // mean radiant temperature [°C] (assumed = tdb for simplicity)
  vr: number,      // relative air velocity [m/s]
  rh: number,      // relative humidity [%]
  met: number,     // metabolic rate [met]
  clo: number      // clothing insulation [clo]
): { pmv: number; ppd: number } {
  // Internal heat production
  const M = met * 58.15;  // W/m2
  const W = 0;             // external work, assumed 0

  // Clothing insulation in m2K/W
  const Icl = clo * 0.155;

  // Water vapor pressure (Pa)
  const pa = (rh / 100) * 610.5 * Math.exp((17.269 * tdb) / (237.3 + tdb));

  // Clothing surface area factor
  const fcl = clo <= 0.078 ? 1.0 + 1.29 * Icl : 1.05 + 0.645 * Icl;

  // Iterative calculation of clothing surface temperature
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

    if (Math.abs(tclNew - tcl) < 0.00015) {
      tcl = tclNew;
      break;
    }
    tcl = 0.5 * tcl + 0.5 * tclNew;
  }

  const hcn = 2.38 * Math.pow(Math.abs(tcl - tdb), 0.25);
  const hcf = 12.1 * Math.sqrt(vr);
  const hc = Math.max(hcn, hcf);

  // PMV calculation (Fanger's equation)
  const pmv = (0.303 * Math.exp(-0.036 * M) + 0.028) * (
    (M - W)
    - 3.05e-3 * (5733 - 6.99 * (M - W) - pa)
    - 0.42 * ((M - W) - 58.15)
    - 1.7e-5 * M * (5867 - pa)
    - 0.0014 * M * (34 - tdb)
    - 3.96e-8 * fcl * (Math.pow(tcl + 273, 4) - Math.pow(tr + 273, 4))
    - fcl * hc * (tcl - tdb)
  );

  // PPD calculation
  const ppd = 100 - 95 * Math.exp(-0.03353 * Math.pow(pmv, 4) - 0.2179 * Math.pow(pmv, 2));

  const pmvRounded = isNaN(pmv) ? 0 : Math.round(pmv * 100) / 100;
  const ppdRounded = isNaN(ppd) ? 5 : Math.round(ppd * 10) / 10;

  return { pmv: pmvRounded, ppd: ppdRounded };
}

export function computeOutputs(persona: PersonaData): ComputedOutputs {
  const { pmv, ppd } = calculatePMV(
    persona.environment.air_temp,
    persona.environment.air_temp, // tr ≈ tdb
    persona.environment.air_velocity,
    persona.environment.humidity,
    persona.agent.metabolic_rate,
    persona.agent.clothing_insulation
  );

  // Vision factor for effective lux
  const visionFactor =
    persona.agent.vision === "normal" ? 1 :
    persona.agent.vision === "mild_impairment" ? 0.75 : 0.5;
  const effectiveLux = Math.round(persona.environment.lux * visionFactor);

  // Hearing factor for perceived dB
  const hearingFactor =
    persona.agent.hearing === "normal" ? 1 :
    persona.agent.hearing === "impaired" ? 1.1 : 0.7;
  const perceivedDB = Math.round(persona.environment.dB * hearingFactor);

  return { PMV: pmv, PPD: ppd, effective_lux: effectiveLux, perceived_dB: perceivedDB };
}

// ---- Perceptual Load Computation (Feedback #3) ----
// Compute default perceptual loads based on environment + agent parameters
export function computePerceptualLoad(persona: PersonaData, computed: ComputedOutputs): AccumulatedState {
  // Thermal discomfort: based on PMV deviation from 0
  const thermalDiscomfort = Math.min(1, Math.abs(computed.PMV) / 3);

  // Visual strain: based on lux (too low or too high)
  const optimalLux = 300;
  const luxDev = Math.abs(persona.environment.lux - optimalLux) / optimalLux;
  const visionPenalty = persona.agent.vision === "normal" ? 0 : persona.agent.vision === "mild_impairment" ? 0.15 : 0.3;
  const visualStrain = Math.min(1, luxDev * 0.6 + visionPenalty);

  // Noise stress: based on dB level
  const noiseBase = persona.environment.dB > 70 ? 0.8 : persona.environment.dB > 55 ? 0.4 : persona.environment.dB > 40 ? 0.2 : 0.05;
  const hearingPenalty = persona.agent.hearing === "impaired" ? 0.15 : persona.agent.hearing === "deaf" ? -0.1 : 0;
  const noiseStress = Math.min(1, Math.max(0, noiseBase + hearingPenalty));

  // Social overload: based on visible agents and MBTI introversion
  const isIntrovert = persona.agent.mbti.startsWith("I");
  const socialBase = persona.spatial.visible_agents > 5 ? 0.6 : persona.spatial.visible_agents > 2 ? 0.3 : 0.1;
  const socialOverload = Math.min(1, socialBase + (isIntrovert ? 0.2 : -0.1));

  // Fatigue: based on duration and age
  const durationFactor = Math.min(1, persona.position.duration_in_cell / 120);
  const ageFactor = persona.agent.age > 65 ? 0.2 : persona.agent.age > 45 ? 0.1 : 0;
  const fatigue = Math.min(1, durationFactor * 0.5 + ageFactor + thermalDiscomfort * 0.2);

  // Wayfinding anxiety: based on enclosure and exit distance
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
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
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
          hits++;
          break;
        }
      }
    }
  }
  return Math.round((hits / rays) * 100) / 100;
}

export function computeSpatialFromAgent(
  pos: AgentPosition,
  shapes: Shape[],
  currentSpatial: SpatialData
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
    visible_agents: currentSpatial.visible_agents,
  };
}

export function posToCell(x: number, y: number, cellSize = 1000): [number, number] {
  return [Math.floor(x / cellSize), Math.floor(y / cellSize)];
}

// ---- LocalStorage Persistence ----
const SHAPES_KEY = "thesis_spatial_shapes";
const AGENT_POS_KEY = "thesis_agent_position";
const PERSONA_KEY = "thesis_persona";

export function saveShapes(shapes: Shape[]) {
  try { localStorage.setItem(SHAPES_KEY, JSON.stringify(shapes)); } catch {}
}
export function loadShapes(): Shape[] {
  try { const s = localStorage.getItem(SHAPES_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
}
export function saveAgentPos(pos: AgentPosition) {
  try { localStorage.setItem(AGENT_POS_KEY, JSON.stringify(pos)); } catch {}
}
export function loadAgentPos(): AgentPosition | null {
  try { const s = localStorage.getItem(AGENT_POS_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function savePersona(p: PersonaData) {
  try { localStorage.setItem(PERSONA_KEY, JSON.stringify(p)); } catch {}
}
export function loadPersona(): PersonaData | null {
  try { const s = localStorage.getItem(PERSONA_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}

// ---- LLM Integration ----
export function getLLMConfig(): { apiKey: string; apiUrl: string; model: string } | null {
  const raw = localStorage.getItem("llm_config");
  if (!raw) return null;
  const cfg = JSON.parse(raw);
  return cfg.apiKey ? cfg : null;
}

export function buildLLMPrompt(persona: PersonaData, computed: ComputedOutputs): string {
  return `You are simulating the subjective experience of a building occupant. Based on the following persona, environmental, and spatial data, generate a first-person narrative and perceptual analysis.

AGENT:
- ID: ${persona.agent.id}
- Age: ${persona.agent.age}, Gender: ${persona.agent.gender}
- MBTI: ${persona.agent.mbti} (Use this to infer ALL personality-driven preferences — noise tolerance, light preference, social density preference, etc.)
- Mobility: ${persona.agent.mobility}
- Hearing: ${persona.agent.hearing}
- Vision: ${persona.agent.vision}
- Metabolic Rate: ${persona.agent.metabolic_rate} met
- Clothing: ${persona.agent.clothing_insulation} clo

POSITION:
- Cell: [${persona.position.cell.join(", ")}]
- Time: ${persona.position.timestamp}
- Duration in cell: ${persona.position.duration_in_cell} min

ENVIRONMENT:
- Light: ${persona.environment.lux} lux
- Noise: ${persona.environment.dB} dB
- Temperature: ${persona.environment.air_temp}°C
- Humidity: ${persona.environment.humidity}%
- Air velocity: ${persona.environment.air_velocity} m/s

SPATIAL:
- Distance to wall: ${persona.spatial.dist_to_wall} m
- Distance to window: ${persona.spatial.dist_to_window} m
- Distance to exit: ${persona.spatial.dist_to_exit} m
- Ceiling height: ${persona.spatial.ceiling_h} m
- Enclosure ratio: ${persona.spatial.enclosure_ratio}
- Visible agents: ${persona.spatial.visible_agents}

COMPUTED (PMV/PPD):
- PMV: ${computed.PMV}
- PPD: ${computed.PPD}%
- Effective Lux: ${computed.effective_lux}
- Perceived dB: ${computed.perceived_dB}

Respond in this exact JSON format (no markdown, no explanation, just JSON):
{
  "experience": {
    "summary": "A 2-3 sentence first-person narrative of their experience in this space",
    "comfort_score": <number 1-10>,
    "trend": "<rising|declining|stable>"
  },
  "accumulated_state": {
    "thermal_discomfort": <0.0-1.0>,
    "visual_strain": <0.0-1.0>,
    "noise_stress": <0.0-1.0>,
    "social_overload": <0.0-1.0>,
    "fatigue": <0.0-1.0>,
    "wayfinding_anxiety": <0.0-1.0>
  },
  "rule_triggers": ["<issue_tag_1>", "<issue_tag_2>"]
}

Important: As an ${persona.agent.mbti} personality type, reflect their cognitive functions and emotional tendencies. The comfort score should reflect genuine subjective experience, not just physical conditions. Consider how their MBTI type would react to the spatial enclosure, noise levels, lighting, and social density.`;
}

export async function callLLM(
  persona: PersonaData,
  computed: ComputedOutputs
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "You are an agent-based environmental experience model. You simulate how different MBTI personality types experience architectural spaces. MBTI is the sole personality input — you must infer all preferences from it. Always respond with valid JSON only, no markdown.",
          },
          { role: "user", content: buildLLMPrompt(persona, computed) },
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
      experience: {
        summary: parsed.experience.summary,
        comfort_score: parsed.experience.comfort_score,
        trend: parsed.experience.trend,
      },
      accumulatedState: parsed.accumulated_state,
      ruleTriggers: parsed.rule_triggers || [],
    };
  } catch (err) {
    console.error("LLM call failed:", err);
    return null;
  }
}
