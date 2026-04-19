/**
 * SentiArch — End-to-End Smoke Test with JCTIC Template
 *
 * This script programmatically runs through all 6 steps of the
 * SentiArch workflow using the JCTIC template, verifying that
 * each step produces valid output and that data flows correctly
 * between steps.
 *
 * Run with: npx tsx client/src/__tests__/e2e-smoke-jctic.ts
 *
 * NOTE: This is a headless engine-level test — it exercises the
 * data pipeline (engines + types) without rendering React components.
 * UI-level testing would require a browser environment.
 */

// ---- Polyfill for Node.js (no DOM) ----------------------------------------

// The engines use performance.now() which is available in Node.js
// but localStorage is not — we simulate it with a simple Map.
const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};
(globalThis as any).localStorage = mockLocalStorage;

// ---- Imports ---------------------------------------------------------------

import { jcticTemplate, JCTIC_SITE_BOUNDARY } from "../data/templates/jctic";
import { runZoningGA, DEFAULT_GA_PARAMS } from "../engines/zoning";
import { generateAllFloorLayouts, polygonArea } from "../engines/layout";
import { generateMassing, DEFAULT_MASSING_CONFIG } from "../engines/massing";
import { runBatchSimulation, type LayoutRoomInfo } from "../engines/simulation";
import type { ProgramSpec } from "../types/program";
import type { SelectedZoning, FloorAssignment, ZoningCandidate } from "../types/zoning";
import type { Polygon2D, FloorLayoutCandidate, SelectedLayout } from "../types/layout";
import type { SimulationConfig, SimulationResult } from "../types/simulation";

// ---- Utilities -------------------------------------------------------------

function log(step: number, msg: string) {
  console.log(`[Step ${step}] ${msg}`);
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

// ---- Step 1: Program Spec --------------------------------------------------

function step1_ProgramSpec(): ProgramSpec {
  log(1, "Loading JCTIC template...");
  const spec = jcticTemplate;

  assert(!!spec.id, "spec.id exists");
  assert(spec.schemaVersion === "1.0.0", `schemaVersion is 1.0.0 (got ${spec.schemaVersion})`);
  assert(spec.spaces.length > 0, `spaces array is non-empty (got ${spec.spaces.length})`);
  assert(spec.adjacencies.length > 0, `adjacencies array is non-empty (got ${spec.adjacencies.length})`);
  assert(spec.constraints.maxFloors > 0, `maxFloors > 0 (got ${spec.constraints.maxFloors})`);

  // Check vertical circulation spaces exist
  const liftCores = spec.spaces.filter((s) => s.name.includes("Lift Core"));
  const staircases = spec.spaces.filter((s) => s.name.includes("Staircase"));
  const corridors = spec.spaces.filter((s) => s.name.includes("Corridor"));
  const fireEscapes = spec.spaces.filter((s) => s.name.includes("Fire Escape"));

  log(1, `  Spaces: ${spec.spaces.length}`);
  log(1, `  Adjacencies: ${spec.adjacencies.length}`);
  log(1, `  Vertical circulation: ${liftCores.length} lifts, ${staircases.length} stairs, ${corridors.length} corridors, ${fireEscapes.length} fire escapes`);
  log(1, `  Max floors: ${spec.constraints.maxFloors}`);

  // Check isOutdoor field exists on some spaces
  const outdoorSpaces = spec.spaces.filter((s) => s.isOutdoor === true);
  log(1, `  Outdoor spaces: ${outdoorSpaces.length} (${outdoorSpaces.map((s) => s.name).join(", ")})`);

  // Check floorMandatory vs floorPreference distribution
  const mandatory = spec.spaces.filter((s) => s.floorMandatory !== undefined);
  const preference = spec.spaces.filter((s) => s.floorPreference !== undefined);
  log(1, `  floorMandatory: ${mandatory.length}, floorPreference: ${preference.length}`);

  // Save to mock localStorage
  mockLocalStorage.setItem("sentiarch_program_spec", JSON.stringify(spec));
  log(1, "PASS — Program spec loaded and saved");
  return spec;
}

// ---- Step 2: Zoning Strategy -----------------------------------------------

async function step2_Zoning(spec: ProgramSpec): Promise<SelectedZoning> {
  log(2, "Running Zoning GA...");

  const params = {
    ...DEFAULT_GA_PARAMS,
    populationSize: 20,   // Smaller for smoke test speed
    generations: 30,       // Fewer generations for speed
    eliteCount: 2,
    mutationRate: 0.15,
    crossoverRate: 0.7,
  };

  const result = await runZoningGA(spec, params);

  assert(result.candidates.length > 0, `GA produced candidates (got ${result.candidates.length})`);

  const best = result.candidates[0];
  assert(best.floors.length > 0, `Best candidate has floors (got ${best.floors.length})`);
  assert(best.fitness.totalScore > 0, `Best fitness > 0 (got ${best.fitness.totalScore})`);

  // Check that floors have space assignments
  const totalAssigned = best.floors.reduce((s, f) => s + f.spaceIds.length, 0);
  assert(totalAssigned > 0, `Total assigned spaces > 0 (got ${totalAssigned})`);

  log(2, `  Candidates: ${result.candidates.length}`);
  log(2, `  Best fitness: ${best.fitness.totalScore.toFixed(4)}`);
  log(2, `  Floors: ${best.floors.length}`);
  log(2, `  Total assigned spaces: ${totalAssigned}`);

  // Check diversity (not all candidates identical)
  if (result.candidates.length > 1) {
    const scores = result.candidates.map((c) => c.fitness.totalScore);
    const uniqueScores = new Set(scores.map((s) => s.toFixed(6)));
    log(2, `  Unique fitness scores: ${uniqueScores.size}/${scores.length}`);
    if (uniqueScores.size === 1) {
      log(2, "  WARNING: All candidates have identical fitness — GA may lack diversity");
    }
  }

  const selected: SelectedZoning = {
    programSpecId: spec.id,
    candidateId: best.id,
    floors: best.floors,
    fitness: best.fitness,
    confirmedAt: new Date().toISOString(),
  };

  mockLocalStorage.setItem("sentiarch_selected_zoning", JSON.stringify(selected));
  log(2, "PASS — Zoning completed and saved");
  return selected;
}

// ---- Step 3: Layout Generation ---------------------------------------------

function step3_Layout(
  spec: ProgramSpec,
  zoning: SelectedZoning,
): SelectedLayout {
  log(3, "Generating layouts with JCTIC site boundary...");

  const boundary: Polygon2D = {
    vertices: JCTIC_SITE_BOUNDARY.vertices.map((v) => ({ x: v.x, y: v.y })),
  };
  const boundaryArea = polygonArea(boundary);

  log(3, `  Site boundary: ${JCTIC_SITE_BOUNDARY.vertices.length} vertices, ${boundaryArea.toFixed(0)} m²`);

  const allLayouts = generateAllFloorLayouts(boundary, zoning.floors, spec, 3);

  const floorKeys = Object.keys(allLayouts);
  assert(floorKeys.length > 0, `Generated layouts for floors (got ${floorKeys.length})`);

  // Select best candidate per floor
  const selectedFloors: Record<string, FloorLayoutCandidate> = {};
  for (const [floorIdx, candidates] of Object.entries(allLayouts)) {
    if (candidates.length > 0) {
      selectedFloors[floorIdx] = candidates[0]; // Best ranked
      log(3, `  Floor ${floorIdx}: ${candidates.length} candidates, best score ${candidates[0].quality.totalScore.toFixed(4)}, ${candidates[0].rooms.length} rooms`);
    }
  }

  assert(Object.keys(selectedFloors).length > 0, "At least one floor has a selected layout");

  const result: SelectedLayout = {
    programSpecId: spec.id,
    zoningCandidateId: zoning.candidateId,
    siteBoundary: { polygon: boundary, areaM2: boundaryArea },
    selectedFloors,
    confirmedAt: new Date().toISOString(),
  };

  mockLocalStorage.setItem("sentiarch_selected_layout", JSON.stringify(result));

  // Also save as layout_result format for AgentSimulation compatibility
  const layoutResultFloors = Object.entries(selectedFloors).map(([idx, candidate]) => ({
    floorIndex: candidate.floorIndex,
    rooms: candidate.rooms.map((r) => ({
      spaceId: r.spaceId,
      polygon: r.polygon.vertices,
      areaM2: r.areaM2,
      touchesExterior: r.touchesExterior,
    })),
  }));
  mockLocalStorage.setItem("sentiarch_layout_result", JSON.stringify({ floors: layoutResultFloors }));

  log(3, "PASS — Layout generated and saved");
  return result;
}

// ---- Step 4: Massing -------------------------------------------------------

function step4_Massing(layout: SelectedLayout) {
  log(4, "Generating massing model...");

  const massing = generateMassing(layout, {
    ...DEFAULT_MASSING_CONFIG,
    floorHeightM: 3.6,
  });

  assert(!!massing, "Massing result is not null");
  assert(massing.building.floors.length > 0, `Building has floors (got ${massing.building.floors.length})`);
  assert(massing.building.totalHeightM > 0, `Total height > 0 (got ${massing.building.totalHeightM})`);

  log(4, `  Floors: ${massing.building.floors.length}`);
  log(4, `  Total height: ${massing.building.totalHeightM.toFixed(1)} m`);
  log(4, `  Compute time: ${massing.computeTimeMs.toFixed(1)} ms`);

  // Check room volumes
  let totalRooms = 0;
  for (const floor of massing.building.floors) {
    totalRooms += floor.rooms.length;
  }
  log(4, `  Total room volumes: ${totalRooms}`);
  assert(totalRooms > 0, "At least one room volume exists");

  mockLocalStorage.setItem("sentiarch_massing_result", JSON.stringify(massing));
  log(4, "PASS — Massing generated and saved");
  return massing;
}

// ---- Step 5: Agent Simulation ----------------------------------------------

async function step5_Simulation(
  spec: ProgramSpec,
  layout: SelectedLayout,
): Promise<SimulationResult> {
  log(5, "Running agent batch simulation...");

  // Build LayoutRoomInfo from the selected layout
  const rooms: LayoutRoomInfo[] = [];
  for (const [floorIdxStr, candidate] of Object.entries(layout.selectedFloors)) {
    const floorRoomIds = candidate.rooms.map((r) => r.spaceId);
    for (const room of candidate.rooms) {
      const spaceInfo = spec.spaces.find((s) => s.id === room.spaceId);
      const cx = room.polygon.vertices.reduce((s, v) => s + v.x, 0) / room.polygon.vertices.length;
      const cy = room.polygon.vertices.reduce((s, v) => s + v.y, 0) / room.polygon.vertices.length;
      rooms.push({
        spaceId: room.spaceId,
        name: spaceInfo?.name ?? room.spaceId,
        category: spaceInfo?.category ?? "unknown",
        floorIndex: candidate.floorIndex,
        areaM2: room.areaM2,
        touchesExterior: room.touchesExterior,
        colorHex: room.colorHex ?? "#999999",
        adjacentRoomIds: floorRoomIds.filter((id) => id !== room.spaceId),
        centroidX: cx,
        centroidY: cy,
      });
    }
  }

  assert(rooms.length > 0, `Rooms extracted for simulation (got ${rooms.length})`);
  log(5, `  Rooms: ${rooms.length}`);

  // Pick two rooms for a sample task
  const originRoom = rooms.find((r) => r.category === "academic") ?? rooms[0];
  const destRoom = rooms.find((r) => r.category === "sport" && r.spaceId !== originRoom.spaceId) ?? rooms[Math.min(1, rooms.length - 1)];

  const config: SimulationConfig = {
    cohorts: [
      {
        id: "student-young",
        label: "Young Student",
        count: 30,
        profile: {
          age: 14,
          gender: "male",
          mbti: "ENFP",
          mobility: "normal",
          hearing: "normal",
          vision: "normal",
          metabolic_rate: 1.2,
          clothing_insulation: 0.7,
        },
        colorHex: "#3498DB",
      },
      {
        id: "teacher-senior",
        label: "Senior Teacher",
        count: 5,
        profile: {
          age: 55,
          gender: "female",
          mbti: "ISTJ",
          mobility: "normal",
          hearing: "normal",
          vision: "mild_impairment",
          metabolic_rate: 1.0,
          clothing_insulation: 0.8,
        },
        colorHex: "#E74C3C",
      },
    ],
    tasks: [
      {
        id: "task-class-to-sport",
        label: `${originRoom.name} → ${destRoom.name}`,
        originSpaceId: originRoom.spaceId,
        destinationSpaceId: destRoom.spaceId,
        dwellMinutes: 45,
        walkingSpeedFactor: 1.0,
      },
    ],
    roomEnvironments: rooms.map((r) => ({
      spaceId: r.spaceId,
      airTemp: 24,
      humidity: 55,
      airVelocity: 0.1,
      lux: 300,
      noiseDb: 50,
      ceilingHeight: 3.6,
    })),
  };

  const result = await runBatchSimulation({
    config,
    rooms,
    maxFloors: spec.constraints.maxFloors,
    programSpecId: spec.id,
  });

  assert(!!result, "Simulation result is not null");
  assert(result.scenarioResults.length > 0, `Scenario results exist (got ${result.scenarioResults.length})`);
  assert(result.statistics.totalScenarios > 0, `Total scenarios > 0 (got ${result.statistics.totalScenarios})`);

  log(5, `  Scenarios: ${result.statistics.totalScenarios}`);
  log(5, `  Avg score: ${result.statistics.avgScore}`);
  log(5, `  Alerts: ${result.statistics.totalAlerts}`);
  log(5, `  Worst room: ${result.statistics.worstRoom}`);
  log(5, `  Best room: ${result.statistics.bestRoom}`);
  log(5, `  Worst cohort: ${result.statistics.worstCohort}`);
  log(5, `  Best cohort: ${result.statistics.bestCohort}`);
  log(5, `  Compute time: ${result.statistics.totalComputeTimeMs.toFixed(1)} ms`);

  // Check cohort summaries for Thermal Equity (comfort gap)
  if (result.cohortSummaries.length >= 2) {
    const scores = result.cohortSummaries.map((c) => c.avgScore);
    const gap = Math.max(...scores) - Math.min(...scores);
    log(5, `  Thermal equity gap: ${gap.toFixed(4)} (lower is better)`);
  }

  mockLocalStorage.setItem("sentiarch_simulation_result", JSON.stringify(result));
  log(5, "PASS — Simulation completed and saved");
  return result;
}

// ---- Step 6: Compare & Refine (Data Availability Check) --------------------

function step6_Compare() {
  log(6, "Checking data availability for Compare & Refine...");

  const keys = [
    "sentiarch_program_spec",
    "sentiarch_selected_zoning",
    "sentiarch_selected_layout",
    "sentiarch_layout_result",
    "sentiarch_massing_result",
    "sentiarch_simulation_result",
  ];

  let allPresent = true;
  for (const key of keys) {
    const raw = mockLocalStorage.getItem(key);
    const present = raw !== null && raw.length > 0;
    const size = raw ? (raw.length / 1024).toFixed(1) : "0";
    log(6, `  ${present ? "✓" : "✗"} ${key} (${size} KB)`);
    if (!present) allPresent = false;
  }

  assert(allPresent, "All localStorage keys have data for Compare step");

  // Verify data can be parsed
  const spec = JSON.parse(mockLocalStorage.getItem("sentiarch_program_spec")!);
  const zoning = JSON.parse(mockLocalStorage.getItem("sentiarch_selected_zoning")!);
  const layout = JSON.parse(mockLocalStorage.getItem("sentiarch_selected_layout")!);
  const massing = JSON.parse(mockLocalStorage.getItem("sentiarch_massing_result")!);
  const simulation = JSON.parse(mockLocalStorage.getItem("sentiarch_simulation_result")!);

  // Cross-reference checks
  assert(zoning.programSpecId === spec.id, `Zoning references correct spec (${zoning.programSpecId} === ${spec.id})`);
  assert(layout.programSpecId === spec.id, `Layout references correct spec`);
  assert(layout.zoningCandidateId === zoning.candidateId, `Layout references correct zoning candidate`);
  assert(massing.programSpecId === spec.id, `Massing references correct spec`);
  assert(simulation.programSpecId !== undefined, `Simulation has programSpecId`);

  log(6, "  Cross-reference checks passed");
  log(6, "PASS — All data available and cross-referenced for Compare step");
}

// ---- Main ------------------------------------------------------------------

async function main() {
  console.log("=".repeat(60));
  console.log("SentiArch E2E Smoke Test — JCTIC Template");
  console.log("=".repeat(60));
  console.log();

  const startTime = performance.now();

  try {
    // Step 1
    const spec = step1_ProgramSpec();
    console.log();

    // Step 2
    const zoning = await step2_Zoning(spec);
    console.log();

    // Step 3
    const layout = step3_Layout(spec, zoning);
    console.log();

    // Step 4
    step4_Massing(layout);
    console.log();

    // Step 5
    await step5_Simulation(spec, layout);
    console.log();

    // Step 6
    step6_Compare();
    console.log();

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log("=".repeat(60));
    console.log(`ALL 6 STEPS PASSED in ${elapsed}s`);
    console.log("=".repeat(60));
    process.exit(0);
  } catch (err) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.error();
    console.error("=".repeat(60));
    console.error(`SMOKE TEST FAILED after ${elapsed}s`);
    console.error(err);
    console.error("=".repeat(60));
    process.exit(1);
  }
}

main();
