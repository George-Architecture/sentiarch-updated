// ============================================================
// SentiArch v2 — Agent System
// Role, gender, age, MBTI → derived preferred temp, met, clo
// ============================================================

/** Agent role in JCTIC context */
export type AgentRole = "student" | "teacher" | "staff" | "visitor";

/** Student stream (JCTIC is a sports-arts school) */
export type StudentStream = "sports" | "arts";

/** MBTI 16 types */
export const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const;

export type MBTIType = typeof MBTI_TYPES[number];

/** v2 Agent definition — simplified from legacy */
export interface V2Agent {
  id: string;
  role: AgentRole;
  /** Only applicable when role === "student" */
  stream?: StudentStream;
  gender: "male" | "female";
  age: number;
  mbti: MBTIType;
}

/**
 * Derive preferred temperature from age and gender.
 * Based on ASHRAE thermal comfort research.
 *
 * Base: 22°C for adult male (age 18-60)
 * Female modifier: +1.5°C
 * Adolescent (12-17): -0.5°C
 * Elderly (60+): +1.5°C
 * Child (<12): +0°C (same as adult)
 */
export function derivePreferredTemp(agent: V2Agent): number {
  let temp = 22.0; // base for adult male

  // Gender modifier
  if (agent.gender === "female") {
    temp += 1.5;
  }

  // Age modifier
  if (agent.age >= 60) {
    temp += 1.5;
  } else if (agent.age >= 12 && agent.age < 18) {
    temp -= 0.5;
  }
  // child (<12) and adult (18-59): no modifier

  return temp;
}

/**
 * Derive default clothing insulation (clo) from role and weather season.
 * This provides a reasonable default; not manually set.
 */
export function deriveClothingInsulation(
  role: AgentRole,
  season: "spring" | "summer" | "autumn" | "winter"
): number {
  // Base clo by season (Hong Kong context)
  const seasonClo: Record<string, number> = {
    summer: 0.4,   // shorts + t-shirt
    spring: 0.6,   // light layers
    autumn: 0.7,   // light jacket
    winter: 1.0,   // jacket + layers
  };

  let clo = seasonClo[season] ?? 0.6;

  // Role adjustments
  switch (role) {
    case "student":
      clo += 0.1; // school uniform adds slight insulation
      break;
    case "staff":
      clo += 0.05; // work uniform
      break;
    case "visitor":
      break; // no adjustment
    case "teacher":
      clo += 0.1; // formal attire
      break;
  }

  return Math.round(clo * 100) / 100;
}

/**
 * Check if MBTI type is introverted.
 * Introverts react negatively to crowded spaces.
 */
export function isIntroverted(mbti: MBTIType): boolean {
  return mbti.startsWith("I");
}

/**
 * Get narrative tone descriptor from MBTI for LLM prompt guidance.
 */
export function getNarrativeTone(mbti: MBTIType): string {
  // Thinking vs Feeling
  const isThinking = mbti.includes("T");
  // Judging vs Perceiving
  const isJudging = mbti.includes("J");
  // Intuitive vs Sensing
  const isIntuitive = mbti.includes("N");

  if (isThinking && isJudging) return "analytical and structured";
  if (isThinking && !isJudging) return "observational and detached";
  if (!isThinking && isJudging) return "warm and decisive";
  if (!isThinking && !isJudging) return "expressive and open";
  return "balanced";
}

/**
 * Create a default agent for a new simulation.
 */
export function createDefaultAgent(index: number): V2Agent {
  return {
    id: `agent_${String(index + 1).padStart(2, "0")}`,
    role: "student",
    stream: "arts",
    gender: "male",
    age: 16,
    mbti: "INTJ",
  };
}
