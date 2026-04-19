/**
 * SentiArch — Agent Batch Simulation Types
 *
 * Step 5 of the parametric design workflow.
 * Defines agent cohorts, tasks, scenario matrix, and simulation results.
 *
 * Reuses AgentData / EnvironmentData / AccumulatedState types from store.ts
 * for compatibility with the existing single-agent simulation system.
 */
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Agent Cohort — a group of agents sharing the same profile
// ---------------------------------------------------------------------------

export const AgentCohortSchema = z.object({
  /** Unique cohort identifier (kebab-case) */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Human-readable label, e.g. "Young Male Teacher" */
  label: z.string().min(1),
  /** Number of agents in this cohort (for weighting, not individual sim) */
  count: z.int().min(1),
  /** Agent profile — mirrors store.ts AgentData */
  profile: z.object({
    age: z.int().min(5).max(100),
    gender: z.enum(["male", "female"]),
    mbti: z.string().length(4),
    mobility: z.enum(["normal", "walker", "wheelchair", "cane"]),
    hearing: z.enum(["normal", "impaired", "deaf"]),
    vision: z.enum(["normal", "mild_impairment", "severe_impairment"]),
    metabolic_rate: z.number().min(0.7).max(3.0),
    clothing_insulation: z.number().min(0.0).max(2.5),
  }),
  /** Display color (hex) for charts */
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export type AgentCohort = z.infer<typeof AgentCohortSchema>;

// ---------------------------------------------------------------------------
// Room Environment Override — per-room environmental parameters
// ---------------------------------------------------------------------------

export const RoomEnvironmentSchema = z.object({
  /** Room/space ID from the layout */
  spaceId: z.string(),
  /** Air temperature (°C) */
  airTemp: z.number().min(10).max(40).default(24),
  /** Relative humidity (%) */
  humidity: z.number().min(10).max(90).default(55),
  /** Air velocity (m/s) */
  airVelocity: z.number().min(0).max(2).default(0.1),
  /** Illuminance (lux) */
  lux: z.number().min(0).max(2000).default(300),
  /** Noise level (dB) */
  noiseDb: z.number().min(20).max(100).default(55),
  /** Ceiling height (m) */
  ceilingHeight: z.number().min(2).max(6).default(3.6),
});

export type RoomEnvironment = z.infer<typeof RoomEnvironmentSchema>;

// ---------------------------------------------------------------------------
// Simulation Task — an origin→destination journey for a cohort
// ---------------------------------------------------------------------------

export const SimulationTaskSchema = z.object({
  /** Unique task identifier */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Human-readable label, e.g. "Office → Classroom" */
  label: z.string().min(1),
  /** Origin room space ID */
  originSpaceId: z.string(),
  /** Destination room space ID */
  destinationSpaceId: z.string(),
  /** Dwell time at destination (minutes) */
  dwellMinutes: z.number().min(1).max(480),
  /** Walking speed factor (1.0 = normal, 0.5 = slow) */
  walkingSpeedFactor: z.number().min(0.1).max(2.0).default(1.0),
});

export type SimulationTask = z.infer<typeof SimulationTaskSchema>;

// ---------------------------------------------------------------------------
// Scenario — one cohort × one task combination
// ---------------------------------------------------------------------------

export const ScenarioSchema = z.object({
  /** Composite ID: cohortId--taskId */
  id: z.string(),
  cohortId: z.string(),
  taskId: z.string(),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

// ---------------------------------------------------------------------------
// Per-Room Comfort Result — comfort metrics at a single room
// ---------------------------------------------------------------------------

export const RoomComfortSchema = z.object({
  spaceId: z.string(),
  spaceName: z.string(),
  /** ISO 7730 PMV (-3 to +3) */
  pmv: z.number(),
  /** Predicted Percentage Dissatisfied (%) */
  ppd: z.number(),
  /** Effective lux (adjusted for vision) */
  effectiveLux: z.number(),
  /** Perceived dB (adjusted for hearing) */
  perceivedDb: z.number(),
  /** Perceptual load components (0-1 each) */
  perceptualLoad: z.object({
    thermal_discomfort: z.number(),
    visual_strain: z.number(),
    noise_stress: z.number(),
    social_overload: z.number(),
    fatigue: z.number(),
    wayfinding_anxiety: z.number(),
  }),
  /** Aggregate perceptual load (0-1, weighted average) */
  aggregateLoad: z.number(),
  /** Whether this room is flagged as uncomfortable */
  isAlert: z.boolean(),
  /** Alert reasons if any */
  alertReasons: z.array(z.string()),
  /** Duration spent in this room (minutes) — walking transit or dwelling */
  durationMinutes: z.number(),
  /** PMV validity warnings */
  pmvWarnings: z.array(z.string()),
});

export type RoomComfort = z.infer<typeof RoomComfortSchema>;

// ---------------------------------------------------------------------------
// Scenario Result — full result for one cohort × one task
// ---------------------------------------------------------------------------

export const ScenarioResultSchema = z.object({
  scenarioId: z.string(),
  cohortId: z.string(),
  taskId: z.string(),
  /** Ordered list of rooms along the route (origin → ... → destination) */
  route: z.array(z.string()),
  /** Comfort at each room along the route */
  routeComfort: z.array(RoomComfortSchema),
  /** Comfort at the destination (dwelling phase) */
  destinationComfort: RoomComfortSchema,
  /** Overall route comfort score (0-1, 1=perfect) */
  routeScore: z.number(),
  /** Overall destination comfort score (0-1, 1=perfect) */
  destinationScore: z.number(),
  /** Combined score (weighted: 30% route + 70% destination) */
  combinedScore: z.number(),
  /** Computation time (ms) */
  computeTimeMs: z.number(),
});

export type ScenarioResult = z.infer<typeof ScenarioResultSchema>;

// ---------------------------------------------------------------------------
// Aggregated Room Stats — per-room across all scenarios
// ---------------------------------------------------------------------------

export const RoomAggregateSchema = z.object({
  spaceId: z.string(),
  spaceName: z.string(),
  /** Number of scenario visits */
  visitCount: z.number(),
  /** Average PMV across all visits */
  avgPmv: z.number(),
  /** Average PPD across all visits */
  avgPpd: z.number(),
  /** Average aggregate perceptual load */
  avgLoad: z.number(),
  /** Worst (highest) aggregate load observed */
  worstLoad: z.number(),
  /** Number of alert-triggering visits */
  alertCount: z.number(),
  /** Category from layout */
  category: z.string(),
  /** Color from layout */
  colorHex: z.string(),
});

export type RoomAggregate = z.infer<typeof RoomAggregateSchema>;

// ---------------------------------------------------------------------------
// Cohort Summary — per-cohort across all tasks
// ---------------------------------------------------------------------------

export const CohortSummarySchema = z.object({
  cohortId: z.string(),
  cohortLabel: z.string(),
  /** Number of tasks simulated */
  taskCount: z.number(),
  /** Average combined score across all tasks */
  avgScore: z.number(),
  /** Worst combined score */
  worstScore: z.number(),
  /** Best combined score */
  bestScore: z.number(),
  /** Number of alerts triggered */
  alertCount: z.number(),
  /** Most problematic room for this cohort */
  worstRoom: z.string(),
  colorHex: z.string(),
});

export type CohortSummary = z.infer<typeof CohortSummarySchema>;

// ---------------------------------------------------------------------------
// Alert — a flagged comfort issue
// ---------------------------------------------------------------------------

export const AlertSchema = z.object({
  /** Severity: critical (must fix) or warning (should review) */
  severity: z.enum(["critical", "warning"]),
  /** Which room */
  spaceId: z.string(),
  spaceName: z.string(),
  /** Which cohort triggered it */
  cohortId: z.string(),
  cohortLabel: z.string(),
  /** What went wrong */
  reason: z.string(),
  /** The metric value that triggered the alert */
  value: z.number(),
  /** Threshold that was exceeded */
  threshold: z.number(),
});

export type Alert = z.infer<typeof AlertSchema>;

// ---------------------------------------------------------------------------
// Batch Simulation Result — the complete output of Step 5
// ---------------------------------------------------------------------------

export const SimulationResultSchema = z.object({
  /** Schema version for future migration */
  schemaVersion: z.literal("1.0.0"),
  /** When the simulation was run */
  timestamp: z.string(),
  /** Input references */
  programSpecId: z.string(),
  /** Cohorts used */
  cohorts: z.array(AgentCohortSchema),
  /** Tasks defined */
  tasks: z.array(SimulationTaskSchema),
  /** Room environment overrides */
  roomEnvironments: z.array(RoomEnvironmentSchema),
  /** All scenario results */
  scenarioResults: z.array(ScenarioResultSchema),
  /** Per-room aggregates */
  roomAggregates: z.array(RoomAggregateSchema),
  /** Per-cohort summaries */
  cohortSummaries: z.array(CohortSummarySchema),
  /** Alerts */
  alerts: z.array(AlertSchema),
  /** Global statistics */
  statistics: z.object({
    totalScenarios: z.number(),
    totalAlerts: z.number(),
    avgScore: z.number(),
    worstRoom: z.string(),
    bestRoom: z.string(),
    worstCohort: z.string(),
    bestCohort: z.string(),
    totalComputeTimeMs: z.number(),
  }),
});

export type SimulationResult = z.infer<typeof SimulationResultSchema>;

// ---------------------------------------------------------------------------
// Simulation Config — user-defined configuration for the batch run
// ---------------------------------------------------------------------------

export const SimulationConfigSchema = z.object({
  cohorts: z.array(AgentCohortSchema).min(1),
  tasks: z.array(SimulationTaskSchema).min(1),
  roomEnvironments: z.array(RoomEnvironmentSchema),
});

export type SimulationConfig = z.infer<typeof SimulationConfigSchema>;

// ---------------------------------------------------------------------------
// Default Room Environments by Category
// ---------------------------------------------------------------------------

/**
 * Default environmental parameters by room category.
 * Architects can override these per-room in the Scenario Builder.
 */
export const DEFAULT_ROOM_ENVIRONMENTS: Record<
  string,
  { lux: number; noiseDb: number; airTemp: number; humidity: number; airVelocity: number }
> = {
  academic: { lux: 300, noiseDb: 45, airTemp: 24, humidity: 55, airVelocity: 0.1 },
  art: { lux: 500, noiseDb: 50, airTemp: 23, humidity: 50, airVelocity: 0.1 },
  science: { lux: 400, noiseDb: 50, airTemp: 23, humidity: 50, airVelocity: 0.15 },
  public: { lux: 200, noiseDb: 50, airTemp: 24, humidity: 55, airVelocity: 0.1 },
  sport: { lux: 200, noiseDb: 65, airTemp: 22, humidity: 50, airVelocity: 0.2 },
  admin: { lux: 300, noiseDb: 40, airTemp: 24, humidity: 55, airVelocity: 0.1 },
  support: { lux: 150, noiseDb: 50, airTemp: 24, humidity: 55, airVelocity: 0.1 },
  residential: { lux: 200, noiseDb: 35, airTemp: 24, humidity: 55, airVelocity: 0.1 },
  corridor: { lux: 150, noiseDb: 55, airTemp: 24, humidity: 55, airVelocity: 0.15 },
};

/**
 * Specific room overrides for known space types.
 * These take precedence over category defaults.
 */
export const ROOM_SPECIFIC_ENVIRONMENTS: Record<
  string,
  Partial<{ lux: number; noiseDb: number; airTemp: number }>
> = {
  "band-room": { noiseDb: 70 },
  "music": { noiseDb: 70 },
  "gymnasium": { lux: 200, noiseDb: 65 },
  "assembly-hall": { lux: 250, noiseDb: 60 },
  "library": { lux: 350, noiseDb: 35 },
  "chemistry-lab": { noiseDb: 50, airTemp: 23 },
  "biology-lab": { noiseDb: 45 },
  "physics-lab": { noiseDb: 50 },
  "art-ceramics": { lux: 500 },
  "art-printmaking": { lux: 500 },
  "art-painting": { lux: 600 },
  "art-sculpture": { lux: 450 },
  "computer-room": { lux: 300, noiseDb: 45 },
  "laundry": { noiseDb: 60, airTemp: 26 },
  "canteen": { noiseDb: 65, airTemp: 25 },
};

// ---------------------------------------------------------------------------
// Default Agent Cohorts for JCTIC
// ---------------------------------------------------------------------------

export const DEFAULT_COHORTS: AgentCohort[] = [
  {
    id: "young-male-teacher",
    label: "Young Male Teacher",
    count: 5,
    profile: {
      age: 30,
      gender: "male",
      mbti: "ENTJ",
      mobility: "normal",
      hearing: "normal",
      vision: "normal",
      metabolic_rate: 1.4,
      clothing_insulation: 0.6,
    },
    colorHex: "#2E6B8A",
  },
  {
    id: "middle-female-teacher",
    label: "Middle-aged Female Teacher",
    count: 8,
    profile: {
      age: 48,
      gender: "female",
      mbti: "ISFJ",
      mobility: "normal",
      hearing: "normal",
      vision: "mild_impairment",
      metabolic_rate: 1.0,
      clothing_insulation: 0.8,
    },
    colorHex: "#8B5E83",
  },
  {
    id: "elderly-janitor",
    label: "Elderly Janitor",
    count: 2,
    profile: {
      age: 62,
      gender: "male",
      mbti: "ISTJ",
      mobility: "normal",
      hearing: "impaired",
      vision: "mild_impairment",
      metabolic_rate: 1.6,
      clothing_insulation: 0.7,
    },
    colorHex: "#6B8E5A",
  },
  {
    id: "male-student",
    label: "Male Student (16y)",
    count: 15,
    profile: {
      age: 16,
      gender: "male",
      mbti: "ESTP",
      mobility: "normal",
      hearing: "normal",
      vision: "normal",
      metabolic_rate: 1.6,
      clothing_insulation: 0.5,
    },
    colorHex: "#C47A2B",
  },
  {
    id: "female-student",
    label: "Female Student (16y)",
    count: 15,
    profile: {
      age: 16,
      gender: "female",
      mbti: "INFP",
      mobility: "normal",
      hearing: "normal",
      vision: "normal",
      metabolic_rate: 1.2,
      clothing_insulation: 0.6,
    },
    colorHex: "#B85C38",
  },
  {
    id: "wheelchair-student",
    label: "Wheelchair Student",
    count: 1,
    profile: {
      age: 17,
      gender: "male",
      mbti: "INTP",
      mobility: "wheelchair",
      hearing: "normal",
      vision: "normal",
      metabolic_rate: 1.0,
      clothing_insulation: 0.6,
    },
    colorHex: "#4A90D9",
  },
];

// ---------------------------------------------------------------------------
// Default Tasks for JCTIC
// ---------------------------------------------------------------------------

export const DEFAULT_TASKS: SimulationTask[] = [
  {
    id: "teacher-meeting-to-classroom",
    label: "Teacher: Meeting Room → Classroom A",
    originSpaceId: "adm-meeting-room",
    destinationSpaceId: "acad-classroom-a",
    dwellMinutes: 60,
    walkingSpeedFactor: 1.0,
  },
  {
    id: "student-gym-to-classroom",
    label: "Student: Gymnasium → Classroom A",
    originSpaceId: "spt-gymnasium",
    destinationSpaceId: "acad-classroom-a",
    dwellMinutes: 45,
    walkingSpeedFactor: 1.0,
  },
  {
    id: "student-classroom-to-art",
    label: "Student: Classroom A → Art Ceramics",
    originSpaceId: "acad-classroom-a",
    destinationSpaceId: "art-ceramics",
    dwellMinutes: 40,
    walkingSpeedFactor: 1.0,
  },
  {
    id: "student-classroom-to-gym",
    label: "Student: Classroom B → Gymnasium",
    originSpaceId: "acad-classroom-b",
    destinationSpaceId: "spt-gymnasium",
    dwellMinutes: 45,
    walkingSpeedFactor: 1.0,
  },
  {
    id: "student-classroom-to-library",
    label: "Student: Classroom A → Library",
    originSpaceId: "acad-classroom-a",
    destinationSpaceId: "pub-library",
    dwellMinutes: 30,
    walkingSpeedFactor: 1.0,
  },
  {
    id: "janitor-canteen-to-laundry",
    label: "Janitor: Canteen → Laundry",
    originSpaceId: "sup-canteen",
    destinationSpaceId: "sup-laundry",
    dwellMinutes: 20,
    walkingSpeedFactor: 0.8,
  },
];
