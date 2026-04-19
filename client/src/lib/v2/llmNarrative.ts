// ============================================================
// SentiArch v2 — LLM Narrative Output
// DeepSeek API + severity tags per node
// ============================================================

import { getLLMConfig } from "../store";
import type { V2Agent } from "./agentSystem";
import { getNarrativeTone, isIntroverted, derivePreferredTemp } from "./agentSystem";
import type { NodeResult, SeverityTag, SimulationRunResult } from "./pmvEngine";
import { getSeverityFromPMV } from "./pmvEngine";
import type { OccupancyLevel } from "./pathSystem";
import type { WeatherScenario, TimeSlot } from "./weatherScenarios";

/** Narrative result for a single node */
export interface NodeNarrative {
  nodeId: string;
  nodeAddress: string;
  mode: "passing_through" | "dwelling";
  narrative: string;
  severity?: SeverityTag;
  designFlag?: string;
}

/** Full narrative result for a simulation run */
export interface NarrativeResult {
  nodeNarratives: NodeNarrative[];
  designFlagSummary: DesignFlag[];
}

/** Design flag for the summary section */
export interface DesignFlag {
  nodeAddress: string;
  severity: SeverityTag;
  description: string;
}

/**
 * Build the LLM prompt for a dwelling node.
 */
function buildDwellingPrompt(
  nodeResult: NodeResult,
  agent: V2Agent,
  weather: WeatherScenario,
  time: TimeSlot,
  occupancy: OccupancyLevel
): string {
  const tone = getNarrativeTone(agent.mbti);
  const introvert = isIntroverted(agent.mbti);
  const prefTemp = derivePreferredTemp(agent);
  const severity = getSeverityFromPMV(nodeResult.pmv);

  const occupancyDesc = occupancy === "crowded"
    ? "The space is crowded with many people."
    : occupancy === "empty"
    ? "The space is nearly empty."
    : "The space has normal occupancy.";

  const socialReaction = occupancy === "crowded"
    ? (introvert
      ? "As an introvert, the crowding causes significant discomfort and social overload."
      : "As an extrovert, the lively atmosphere is energising.")
    : occupancy === "empty"
    ? (introvert
      ? "As an introvert, the quiet emptiness feels peaceful and restorative."
      : "As an extrovert, the emptiness feels isolating.")
    : "";

  const greeneryNote = nodeResult.spaceTag === "green_space"
    ? "\nIMPORTANT: This is a green space with trees and vegetation. The greenery has a calming, restorative psychological effect. Mention the greenery naturally in the narrative."
    : "";

  return `You are simulating the subjective experience of a building occupant in a Hong Kong school (JCTIC — Jockey Club Ti-I College).

AGENT:
- Role: ${agent.role}${agent.stream ? ` (${agent.stream} stream)` : ""}
- Age: ${agent.age}, Gender: ${agent.gender}
- MBTI: ${agent.mbti} — narrative tone should be ${tone}
- Preferred temperature: ${prefTemp}°C

WEATHER: ${weather.label} (${weather.outdoor_temp}°C outdoor, ${weather.humidity}% RH)
TIME: ${time.label}

SPACE: ${nodeResult.nodeAddress}
Space type: ${nodeResult.spaceTag}
Activity: ${nodeResult.activityId || "unknown"} (${nodeResult.duration_minutes || 0} minutes)
${occupancyDesc}
${socialReaction}
${greeneryNote}

ENVIRONMENT (resolved from weather + space type):
- Air temperature: ${nodeResult.resolvedEnv.air_temp}°C
- Mean radiant temperature: ${nodeResult.resolvedEnv.mean_radiant_temp}°C
- Humidity: ${nodeResult.resolvedEnv.humidity}%
- Air velocity: ${nodeResult.resolvedEnv.air_velocity} m/s
- Lux: ${nodeResult.resolvedEnv.lux}
- Noise: ${nodeResult.resolvedEnv.noise_dB} dB

COMPUTED:
- PMV: ${nodeResult.pmv.toFixed(2)} (${nodeResult.pmv > 0 ? "warm" : nodeResult.pmv < 0 ? "cool" : "neutral"} side)
- PPD: ${nodeResult.ppd}%
- Temperature deviation from preference: ${nodeResult.tempDeviation > 0 ? "+" : ""}${nodeResult.tempDeviation}°C
- MET: ${nodeResult.met}, CLO: ${nodeResult.clo}

SEVERITY LEVEL: [${severity}]

Generate a response in this exact format (plain text, no JSON, no markdown):

LINE 1-2: Two sentences in first person describing the immediate sensory and emotional experience of the space. Be specific about temperature, light, sound, and spatial quality. If conditions are poor, express genuine discomfort.
LINE 3: One sentence describing how the current activity (${nodeResult.activityId}) feels in this environment.
LINE 4: One sentence flagging a design concern for the architect, prefixed with [${severity}]:

Example format:
The corridor feels uncomfortably warm as I walk through, with stale air and harsh fluorescent lighting overhead. My shirt clings to my skin from the humidity, and the noise from the basketball court echoes off the concrete walls.
Trying to focus on my sketchbook here feels impossible with the heat and noise competing for my attention.
[WARN]: Natural ventilation in this corridor is insufficient during summer — consider adding ceiling fans or cross-ventilation openings.`;
}

/**
 * Build the LLM prompt for a passing-through node.
 */
function buildPassingPrompt(
  nodeResult: NodeResult,
  agent: V2Agent,
  weather: WeatherScenario,
  time: TimeSlot,
  occupancy: OccupancyLevel
): string {
  const tone = getNarrativeTone(agent.mbti);
  const isTransition = nodeResult.isVerticalTransition;

  const occupancyDesc = occupancy === "crowded"
    ? "crowded"
    : occupancy === "empty"
    ? "empty"
    : "moderately occupied";

  return `You are simulating a building occupant passing through a space in a Hong Kong school.

AGENT: ${agent.role}, age ${agent.age}, ${agent.gender}, MBTI ${agent.mbti} (tone: ${tone})
SPACE: ${nodeResult.nodeAddress} (${nodeResult.spaceTag}, ${occupancyDesc})
WEATHER: ${weather.label}, TIME: ${time.label}
PMV: ${nodeResult.pmv.toFixed(2)}, Temperature: ${nodeResult.resolvedEnv.air_temp}°C
${isTransition ? "This is a VERTICAL TRANSITION space (staircase/lift). Describe the brief transitional experience." : "The agent is passing through this space without stopping."}

Generate ONE short sentence in first person describing the passing-through experience. No severity flag. Be specific about what the agent notices.`;
}

/**
 * Call DeepSeek API with a prompt.
 */
async function callDeepSeek(prompt: string): Promise<string | null> {
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
            content: "You are an architectural experience simulator. Generate first-person narratives about how building occupants experience spaces. Be specific, sensory, and honest about discomfort. Always respond in plain text, never JSON or markdown.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    return content?.trim() || null;
  } catch (err) {
    console.error("DeepSeek API call failed:", err);
    return null;
  }
}

/**
 * Generate narrative for a single node.
 */
export async function generateNodeNarrative(
  nodeResult: NodeResult,
  agent: V2Agent,
  weather: WeatherScenario,
  time: TimeSlot,
  occupancy: OccupancyLevel
): Promise<NodeNarrative> {
  const prompt = nodeResult.mode === "dwelling"
    ? buildDwellingPrompt(nodeResult, agent, weather, time, occupancy)
    : buildPassingPrompt(nodeResult, agent, weather, time, occupancy);

  const narrative = await callDeepSeek(prompt);
  const severity = nodeResult.mode === "dwelling" ? getSeverityFromPMV(nodeResult.pmv) : undefined;

  // Extract design flag from narrative (last line starting with [SEVERITY])
  let designFlag: string | undefined;
  if (narrative && severity) {
    const lines = narrative.split("\n").filter(l => l.trim());
    const flagLine = lines.find(l => l.trim().startsWith("["));
    if (flagLine) {
      designFlag = flagLine.trim();
    }
  }

  return {
    nodeId: nodeResult.nodeId,
    nodeAddress: nodeResult.nodeAddress,
    mode: nodeResult.mode,
    narrative: narrative || `[Unable to generate narrative for ${nodeResult.nodeAddress}]`,
    severity,
    designFlag,
  };
}

/**
 * Generate narratives for all nodes in a simulation run.
 * Processes sequentially to maintain narrative coherence.
 */
export async function generateAllNarratives(
  simResult: SimulationRunResult,
  weather: WeatherScenario,
  time: TimeSlot,
  onProgress?: (completed: number, total: number) => void
): Promise<NarrativeResult> {
  const nodeNarratives: NodeNarrative[] = [];
  const total = simResult.nodeResults.length;

  for (let i = 0; i < total; i++) {
    const nodeResult = simResult.nodeResults[i];
    const narrative = await generateNodeNarrative(
      nodeResult,
      simResult.agent,
      weather,
      time,
      simResult.occupancy
    );
    nodeNarratives.push(narrative);
    onProgress?.(i + 1, total);
  }

  // Build design flag summary from all dwelling nodes
  const designFlagSummary: DesignFlag[] = [];
  for (const nn of nodeNarratives) {
    if (nn.severity && nn.severity !== "INFO" && nn.designFlag) {
      designFlagSummary.push({
        nodeAddress: nn.nodeAddress,
        severity: nn.severity,
        description: nn.designFlag,
      });
    }
  }

  return { nodeNarratives, designFlagSummary };
}
