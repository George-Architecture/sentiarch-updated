// ============================================================
// Home Page - Multi-Agent Occupant Perception Map
// Clean neumorphism UI with Inter font
// Waypoint route system + agent animation + perception log
// Dynamic agent tabs (unlimited)
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import PersonaMindMap from "@/components/PersonaMindMap";
import SpatialMap from "@/components/SpatialMap";
import CoordinateInput from "@/components/CoordinateInput";
import ComparisonView from "@/components/ComparisonView";
import {
  type PersonaData,
  type ExperienceData,
  type AccumulatedState,
  type ComputedOutputs,
  type Shape,
  type AgentPosition,
  type PersonaState,
  type Zone,
  type Waypoint,
  type PerceptionLogEntry,
  type AgentRoute,
  defaultPersonas,
  defaultExperience,
  defaultAccumulatedState,
  defaultComputedOutputs,
  computeOutputs,
  computePerceptualLoad,
  computeSpatialFromAgent,
  computeVisibleAgents,
  computeStressScore,
  posToCell,
  saveShapes,
  loadShapes,
  saveMultiAgent,
  loadMultiAgent,
  saveZones,
  loadZones,
  saveWaypoints,
  loadWaypoints,
  getLLMConfig,
  callLLMWithPrompt,
  buildWalkPrompt,
  buildDwellPrompt,
  isAgentCoreChange,
  getEnvAtPosition,
  zoneEnvToEnvironment,
  getPersonaColor,
  createNewPersona,
  type HeatmapPoint,
  DEFAULT_LAYOUT,
  loadAllWaypoints,
} from "@/lib/store";
import { generateAutoZones } from "@/lib/autoZone";

function createDefaultState(persona: PersonaData): PersonaState {
  return {
    persona,
    experience: defaultExperience,
    accState: defaultAccumulatedState,
    computed: defaultComputedOutputs,
    triggers: [],
    prevExperience: null,
    prevAccState: null,
    agentPos: null,
    hasSimulated: false,
    route: { waypoints: [], perceptionLog: [] },
  };
}

// Interpolate position along a line from A to B by t (0-1)
function lerpPos(a: AgentPosition, b: AgentPosition, t: number): AgentPosition {
  return {
    x: Math.round(a.x + (b.x - a.x) * t),
    y: Math.round(a.y + (b.y - a.y) * t),
  };
}

// Distance between two positions (mm)
function posDist(a: AgentPosition, b: AgentPosition): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Rescale waypoint dwell_minutes proportionally so their sum fits within `budget`.
// Treats `budget` as the upper limit defined by persona.position.duration_in_cell.
// Returns the original list unchanged if already within budget or budget <= 0.
function rescaleWaypointsToBudget(wps: Waypoint[], budget: number): Waypoint[] {
  if (wps.length === 0 || budget <= 0) return wps;
  const total = wps.reduce((s, w) => s + Math.max(0, w.dwell_minutes), 0);
  if (total <= budget) return wps;
  const ratio = budget / total;
  const rounded = wps.map((w) => ({
    ...w,
    dwell_minutes: Math.max(0, Math.round(w.dwell_minutes * ratio)),
  }));
  // Absorb rounding drift in the last waypoint so the sum equals `budget` exactly.
  const newSum = rounded.reduce((s, w) => s + w.dwell_minutes, 0);
  const drift = budget - newSum;
  if (drift !== 0) {
    const last = rounded[rounded.length - 1];
    last.dwell_minutes = Math.max(0, last.dwell_minutes + drift);
  }
  return rounded;
}

export default function Home() {
  const [, navigate] = useLocation();

  // Multi-agent state: dynamic array of persona states
  const [states, setStates] = useState<PersonaState[]>(() => {
    const saved = loadMultiAgent();
    if (saved && saved.personas.length > 0) {
      return saved.personas.map((p, i) => {
        const wps = loadWaypoints(i);
        return {
          ...createDefaultState(p),
          agentPos: saved.positions[i],
          route: { waypoints: wps, perceptionLog: [] },
        };
      });
    }
    // No saved multi-agent data — use default layout agent positions
    return defaultPersonas.map((p, i) => ({
      ...createDefaultState(p),
      agentPos: DEFAULT_LAYOUT.agentPositions[i] ?? null,
    }));
  });

  const [shapes, setShapes] = useState<Shape[]>(() => loadShapes());
  const [zones, setZones] = useState<Zone[]>(() => loadZones());
  const [activeTab, setActiveTab] = useState(0);
  const [simChecked, setSimChecked] = useState<boolean[]>(() => states.map(() => true));
  const [running, setRunning] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // Route animation state
  const [animatingAgents, setAnimatingAgents] = useState<Record<number, AgentPosition>>({});
  const [pathTrails, setPathTrails] = useState<Record<number, AgentPosition[]>>({});
  const [routeRunning, setRouteRunning] = useState(false);
  const routeAbortRef = useRef(false);
  // Stores each agent's position as it was just before a route simulation started.
  // Used by resetAgents to restore the pre-route starting position.
  const originalAgentPositionsRef = useRef<Record<number, AgentPosition | null>>({});

  // Current active persona state
  const current = states[activeTab];

  // ---- Dynamic Agent Management ----
  const addAgent = useCallback(() => {
    const newIdx = states.length;
    const newPersona = createNewPersona(newIdx);
    setStates((prev) => [...prev, createDefaultState(newPersona)]);
    setSimChecked((prev) => [...prev, true]);
    setActiveTab(newIdx);
    toast.success(`Agent P${newIdx + 1} added`);
  }, [states.length]);

  const removeAgent = useCallback((idx: number) => {
    if (states.length <= 1) {
      toast.error("Cannot remove the last agent");
      return;
    }
    setStates((prev) => prev.filter((_, i) => i !== idx));
    setSimChecked((prev) => prev.filter((_, i) => i !== idx));
    setPathTrails((prev) => {
      const next: Record<number, AgentPosition[]> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = parseInt(k);
        if (ki < idx) next[ki] = v;
        else if (ki > idx) next[ki - 1] = v;
      });
      return next;
    });
    setAnimatingAgents((prev) => {
      const next: Record<number, AgentPosition> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = parseInt(k);
        if (ki < idx) next[ki] = v;
        else if (ki > idx) next[ki - 1] = v;
      });
      return next;
    });
    if (activeTab >= idx && activeTab > 0) {
      setActiveTab(activeTab - 1);
    }
    toast.info(`Agent P${idx + 1} removed`);
  }, [states.length, activeTab]);

  // Persist
  useEffect(() => { saveShapes(shapes); }, [shapes]);
  useEffect(() => { saveZones(zones); }, [zones]);
  useEffect(() => {
    saveMultiAgent({
      personas: states.map((s) => s.persona),
      positions: states.map((s) => s.agentPos),
    });
  }, [states]);

  // When zones or shapes change, update environment for all placed agents
  useEffect(() => {
    setStates((prev) => prev.map((s) => {
      if (!s.agentPos) return s;
      const zoneEnv = getEnvAtPosition(s.agentPos.x, s.agentPos.y, zones, shapes);
      const newEnv = zoneEnvToEnvironment(zoneEnv);
      const spatial = computeSpatialFromAgent(s.agentPos, shapes, s.persona.spatial);
      return { ...s, persona: { ...s.persona, environment: newEnv, spatial } };
    }));
  }, [zones, shapes]);

  // Recompute PMV/PPD + perceptual load when persona changes
  useEffect(() => {
    setStates((prev) => prev.map((s) => {
      const c = computeOutputs(s.persona);
      const load = s.hasSimulated ? s.accState : computePerceptualLoad(s.persona, c);
      return { ...s, computed: c, accState: load };
    }));
  }, [
    ...states.map((s) => JSON.stringify(s.persona.environment)),
    ...states.map((s) => JSON.stringify(s.persona.agent)),
  ]);

  // Recompute vis.agents when any agent position changes
  useEffect(() => {
    const positions = states.map((s) => s.agentPos);
    setStates((prev) => prev.map((s, i) => {
      const vis = computeVisibleAgents(i, positions, shapes);
      if (s.persona.spatial.visible_agents === vis) return s;
      return {
        ...s,
        persona: { ...s.persona, spatial: { ...s.persona.spatial, visible_agents: vis } },
      };
    }));
  }, [
    ...states.map((s) => `${s.agentPos?.x},${s.agentPos?.y}`),
    shapes,
  ]);

  // Shape management
  const addShape = useCallback((shape: Shape) => {
    setShapes((s) => {
      const next = [...s, shape];
      // Auto-zone: trigger detection when boundary is added
      if (shape.type === "boundary") {
        setTimeout(() => {
          setZones((prevZones) => {
            const autoZones = generateAutoZones(next, prevZones);
            return autoZones;
          });
        }, 0);
      }
      return next;
    });
  }, []);

   const updateShapes = useCallback((newShapes: Shape[]) => {
    setShapes(newShapes);
    // Auto-zone: re-detect when shapes are updated (e.g. drag-move)
    setTimeout(() => {
      setZones((prevZones) => generateAutoZones(newShapes, prevZones));
    }, 0);
  }, []);
  const deleteShape = useCallback((idx: number) => {
    setShapes((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Auto-zone: re-detect when a shape is deleted
      setTimeout(() => {
        setZones((prevZones) => generateAutoZones(next, prevZones));
      }, 0);
      return next;
    });
  }, []);

  // Zone management
  const addZone = useCallback((zone: Zone) => {
    setZones((z) => [...z, zone]);
  }, []);

  const updateZone = useCallback((id: string, updates: Partial<Zone>) => {
    setZones((prev) => prev.map((z) => z.id === id ? { ...z, ...updates } : z));
  }, []);

  const removeZone = useCallback((id: string) => {
    setZones((prev) => prev.filter((z) => z.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setShapes([]);
    setZones([]);
    setStates((prev) => prev.map((s) => ({
      ...s,
      agentPos: null,
      route: { waypoints: [], perceptionLog: [] },
    })));
    setPathTrails({});
    setAnimatingAgents({});
    toast.info("Map cleared");
  }, []);

  // ---- Reset All Agents to Pre-Route Starting Positions ----
  const resetAgents = useCallback(() => {
    // Abort any running route simulation
    routeAbortRef.current = true;
    setRouteRunning(false);

    const savedPositions = originalAgentPositionsRef.current;

    setStates((prev) => prev.map((s, i) => {
      // Use the pre-route snapshot if available; otherwise keep the current position unchanged
      const hasSnapshot = Object.prototype.hasOwnProperty.call(savedPositions, i);
      const startPos = hasSnapshot ? savedPositions[i] : s.agentPos;

      // Recompute spatial and environment from the restored position
      let updatedPersona = s.persona;
      if (startPos) {
        const cell = posToCell(startPos.x, startPos.y);
        const spatial = computeSpatialFromAgent(startPos, shapes, s.persona.spatial);
        const zoneEnv = getEnvAtPosition(startPos.x, startPos.y, zones, shapes);
        const newEnv = zoneEnvToEnvironment(zoneEnv);
        updatedPersona = {
          ...s.persona,
          position: { ...s.persona.position, cell },
          spatial,
          environment: newEnv,
        };
      }

      return {
        ...s,
        persona: updatedPersona,
        agentPos: startPos,
        // Clear perception log but keep waypoints so routes can be re-run
        route: { ...s.route, perceptionLog: [] },
        // Reset experience/perception state so agents are fresh
        experience: defaultExperience,
        accState: defaultAccumulatedState,
        triggers: [],
        prevExperience: null,
        prevAccState: null,
        hasSimulated: false,
      };
    }));

    // Clear animation overlays and path trails
    setPathTrails({});
    setAnimatingAgents({});

    toast.success("All agents reset to starting positions");
  }, [shapes, zones]);

  // ---- Waypoint Management ----
  const addWaypoint = useCallback((agentIdx: number, wp: Waypoint) => {
    setStates((prev) => {
      const next = [...prev];
      if (!next[agentIdx]) return prev;

      // Requirement: Must place agent first
      if (!next[agentIdx].agentPos) {
        toast.error("Please place the agent on the map first before adding waypoints.");
        return prev;
      }

      const route = { ...next[agentIdx].route };
      const budget = next[agentIdx].persona.position.duration_in_cell;
      route.waypoints = rescaleWaypointsToBudget([...route.waypoints, wp], budget);
      next[agentIdx] = { ...next[agentIdx], route };
      saveWaypoints(agentIdx, route.waypoints);
      return next;
    });
  }, []);

  const removeWaypoint = useCallback((agentIdx: number, wpId: string) => {
    setStates((prev) => {
      const next = [...prev];
      if (!next[agentIdx]) return prev;
      const route = { ...next[agentIdx].route };
      route.waypoints = route.waypoints.filter((w) => w.id !== wpId);
      next[agentIdx] = { ...next[agentIdx], route };
      saveWaypoints(agentIdx, route.waypoints);
      return next;
    });
  }, []);

  const updateWaypointDwell = useCallback((agentIdx: number, wpId: string, minutes: number) => {
    setStates((prev) => {
      const next = [...prev];
      if (!next[agentIdx]) return prev;
      const route = { ...next[agentIdx].route };
      const budget = next[agentIdx].persona.position.duration_in_cell;
      route.waypoints = rescaleWaypointsToBudget(
        route.waypoints.map((w) => (w.id === wpId ? { ...w, dwell_minutes: minutes } : w)),
        budget
      );
      next[agentIdx] = { ...next[agentIdx], route };
      saveWaypoints(agentIdx, route.waypoints);
      return next;
    });
  }, []);

  const clearWaypoints = useCallback((agentIdx: number) => {
    setStates((prev) => {
      const next = [...prev];
      if (!next[agentIdx]) return prev;
      next[agentIdx] = {
        ...next[agentIdx],
        route: { waypoints: [], perceptionLog: [] },
      };
      saveWaypoints(agentIdx, []);
      return next;
    });
    setPathTrails((prev) => {
      const next = { ...prev };
      delete next[agentIdx];
      return next;
    });
  }, []);

  // ---- Agent placement on spatial map ----
  const placeAgent = useCallback((idx: number, pos: AgentPosition) => {
    setStates((prev) => {
      const next = [...prev];
      if (!next[idx]) return prev;
      const cell = posToCell(pos.x, pos.y);
      const spatial = computeSpatialFromAgent(pos, shapes, next[idx].persona.spatial);
      const zoneEnv = getEnvAtPosition(pos.x, pos.y, zones, shapes);
      const newEnv = zoneEnvToEnvironment(zoneEnv);
      next[idx] = {
        ...next[idx],
        agentPos: pos,
        persona: {
          ...next[idx].persona,
          position: { ...next[idx].persona.position, cell },
          spatial,
          environment: newEnv,
        },
      };
      return next;
    });
  }, [shapes, zones]);

  // Update persona with baseline reset logic
  const updatePersona = useCallback((idx: number, newPersona: PersonaData) => {
    setStates((prev) => {
      const next = [...prev];
      if (!next[idx]) return prev;
      const old = next[idx];
      if (isAgentCoreChange(old.persona.agent, newPersona.agent)) {
        next[idx] = {
          ...old,
          persona: newPersona,
          experience: defaultExperience,
          accState: defaultAccumulatedState,
          prevExperience: null,
          prevAccState: null,
          triggers: [],
          hasSimulated: false,
        };
        return next;
      }
      next[idx] = { ...old, persona: newPersona };
      return next;
    });
  }, []);

  // Environment sync (no longer syncs across agents - each agent gets zone-based env)
  const updatePersonaWithEnvSync = useCallback((idx: number, newPersona: PersonaData) => {
    setStates((prev) => {
      const next = [...prev];
      if (!next[idx]) return prev;
      const old = next[idx];

      // The position duration is a SHARED clock: all agents inhabit the same
      // time budget. When it changes for one, propagate to every agent and
      // re-clamp each agent's waypoint dwells against the new budget.
      const oldBudget = old.persona.position.duration_in_cell;
      const newBudget = newPersona.position.duration_in_cell;
      const budgetChanged = oldBudget !== newBudget;

      const route = budgetChanged
        ? { ...old.route, waypoints: rescaleWaypointsToBudget(old.route.waypoints, newBudget) }
        : old.route;
      if (budgetChanged && route.waypoints !== old.route.waypoints) {
        saveWaypoints(idx, route.waypoints);
      }

      if (isAgentCoreChange(old.persona.agent, newPersona.agent)) {
        next[idx] = {
          ...old,
          persona: newPersona,
          experience: defaultExperience,
          accState: defaultAccumulatedState,
          prevExperience: null,
          prevAccState: null,
          triggers: [],
          hasSimulated: false,
          route,
        };
      } else {
        next[idx] = { ...old, persona: newPersona, route };
      }

      // Propagate the shared budget to every other agent.
      if (budgetChanged) {
        for (let i = 0; i < next.length; i++) {
          if (i === idx) continue;
          const other = next[i];
          const rescaled = rescaleWaypointsToBudget(other.route.waypoints, newBudget);
          if (rescaled !== other.route.waypoints) {
            saveWaypoints(i, rescaled);
          }
          next[i] = {
            ...other,
            persona: {
              ...other.persona,
              position: { ...other.persona.position, duration_in_cell: newBudget },
            },
            route: { ...other.route, waypoints: rescaled },
          };
        }
      }

      return next;
    });
  }, []);

  // ---- Route Playback Engine ----
  const runRouteForAgent = async (idx: number): Promise<PerceptionLogEntry[]> => {
    const s = states[idx];
    if (!s || !s.agentPos) return [];
    const wps = s.route.waypoints;
    // Requirement: Route starts from agent position (index 0)
    if (wps.length < 1) return [];

    const log: PerceptionLogEntry[] = [];
    // Full path: Agent Position -> Waypoint 1 -> Waypoint 2 ...
    const fullPath: AgentPosition[] = [s.agentPos, ...wps.map(w => w.position)];
    // Track accumulated state across steps
    let currentAccState: typeof s.accState = { ...s.accState };
    // Cumulative dwell minutes elapsed (walks don't accumulate; only dwells do).
    let cumulativeDwellMin = 0;
    const totalBudgetMin = s.persona.position.duration_in_cell;
    const legCount = fullPath.length - 1;

    for (let i = 0; i < fullPath.length - 1; i++) {
      if (routeAbortRef.current) break;

      const fromPos = fullPath[i];
      const toPos = fullPath[i + 1];
      // Waypoint ID for log: "agent-start" for agent pos, then actual waypoint IDs
      const fromID = i === 0 ? "agent-start" : wps[i - 1].id;
      const toID = wps[i].id;
      const targetWP = wps[i];

      const midPos = lerpPos(fromPos, toPos, 0.5);
      const walkEnv = getEnvAtPosition(midPos.x, midPos.y, zones, shapes);
      const walkEnvData = zoneEnvToEnvironment(walkEnv);
      const walkSpatial = computeSpatialFromAgent(midPos, shapes, s.persona.spatial);
      const walkPersona = { ...s.persona, environment: walkEnvData, spatial: walkSpatial };
      const walkComputed = computeOutputs(walkPersona);

      // Create a dummy fromWP for the prompt if it's the agent start
      const dummyFromWP: Waypoint = i === 0 
        ? { id: "agent-start", position: fromPos, dwell_minutes: 0, label: "Agent Start" }
        : wps[i-1];

      const walkPrompt = buildWalkPrompt(
        walkPersona, walkComputed, shapes, dummyFromWP, targetWP, midPos, zones, currentAccState,
        { cumulativeMin: cumulativeDwellMin, totalBudgetMin, legIndex: i + 1, legCount }
      );
      const walkResult = await callLLMWithPrompt(walkPrompt);

      const walkEntry: PerceptionLogEntry = {
        waypoint_id: toID,
        phase: "walking",
        from: fromID,
        to: toID,
        position: midPos,
        environment: walkEnvData,
        spatial: walkSpatial,
        computed: walkComputed,
        experience: walkResult?.experience || { summary: "Walking...", comfort_score: 5, trend: "stable" },
        accState: walkResult?.accumulatedState || currentAccState,
        triggers: walkResult?.ruleTriggers || [],
        timestamp: new Date().toISOString(),
      };
      log.push(walkEntry);

      if (walkResult) {
        currentAccState = walkResult.accumulatedState;
        setStates((prev) => {
          const next = [...prev];
          if (!next[idx]) return prev;
          next[idx] = {
            ...next[idx],
            experience: walkResult.experience,
            accState: walkResult.accumulatedState,
            triggers: walkResult.ruleTriggers,
            hasSimulated: true,
          };
          return next;
        });
      }

      if (routeAbortRef.current) break;

      const arrivalPos = targetWP.position;

      const dwellEnv = getEnvAtPosition(arrivalPos.x, arrivalPos.y, zones, shapes);
      const dwellEnvData = zoneEnvToEnvironment(dwellEnv);
      const dwellSpatial = computeSpatialFromAgent(arrivalPos, shapes, s.persona.spatial);
      const dwellPersona = { ...s.persona, environment: dwellEnvData, spatial: dwellSpatial };
      const dwellComputed = computeOutputs(dwellPersona);

      cumulativeDwellMin += targetWP.dwell_minutes;
      const dwellPrompt = buildDwellPrompt(
        dwellPersona, dwellComputed, shapes, targetWP, targetWP.dwell_minutes, zones, currentAccState,
        { cumulativeMin: cumulativeDwellMin, totalBudgetMin, legIndex: i + 1, legCount }
      );
      const dwellResult = await callLLMWithPrompt(dwellPrompt);

      const dwellEntry: PerceptionLogEntry = {
        waypoint_id: targetWP.id,
        phase: "dwelling",
        position: arrivalPos,
        environment: dwellEnvData,
        spatial: dwellSpatial,
        computed: dwellComputed,
        experience: dwellResult?.experience || { summary: "Dwelling...", comfort_score: 5, trend: "stable" },
        accState: dwellResult?.accumulatedState || currentAccState,
        triggers: dwellResult?.ruleTriggers || [],
        timestamp: new Date().toISOString(),
      };
      log.push(dwellEntry);

      if (dwellResult) {
        currentAccState = dwellResult.accumulatedState;
        setStates((prev) => {
          const next = [...prev];
          if (!next[idx]) return prev;
          next[idx] = {
            ...next[idx],
            experience: dwellResult.experience,
            accState: dwellResult.accumulatedState,
            triggers: dwellResult.ruleTriggers,
            hasSimulated: true,
            agentPos: arrivalPos,
          };
          return next;
        });
      }
    }

    return log;
  };

  // Stationary "stay-in-place" simulation: agent has no waypoints, so we
  // simulate dwelling at their current position for the full duration budget.
  // Produces a single dwelling PerceptionLogEntry so §07 Route Summary works.
  const simulateStationary = async (idx: number): Promise<PerceptionLogEntry[]> => {
    const s = states[idx];
    if (!s || !s.agentPos) return [];

    const pos = s.agentPos;
    const dwellEnv = getEnvAtPosition(pos.x, pos.y, zones, shapes);
    const dwellEnvData = zoneEnvToEnvironment(dwellEnv);
    const dwellSpatial = computeSpatialFromAgent(pos, shapes, s.persona.spatial);
    const dwellPersona = { ...s.persona, environment: dwellEnvData, spatial: dwellSpatial };
    const dwellComputed = computeOutputs(dwellPersona);
    const totalBudgetMin = s.persona.position.duration_in_cell;

    const stationaryWP: Waypoint = {
      id: "stationary",
      label: "Position",
      position: pos,
      dwell_minutes: totalBudgetMin,
    };

    const prompt = buildDwellPrompt(
      dwellPersona, dwellComputed, shapes, stationaryWP, totalBudgetMin, zones, undefined,
      { cumulativeMin: totalBudgetMin, totalBudgetMin, legIndex: 1, legCount: 1 }
    );
    const result = await callLLMWithPrompt(prompt);

    const entry: PerceptionLogEntry = {
      waypoint_id: stationaryWP.id,
      phase: "dwelling",
      position: pos,
      environment: dwellEnvData,
      spatial: dwellSpatial,
      computed: dwellComputed,
      experience: result?.experience || { summary: "Stayed in position.", comfort_score: 5, trend: "stable" },
      accState: result?.accumulatedState || s.accState,
      triggers: result?.ruleTriggers || [],
      timestamp: new Date().toISOString(),
    };

    if (result) {
      setStates((prev) => {
        const next = [...prev];
        if (!next[idx]) return prev;
        next[idx] = {
          ...next[idx],
          experience: result.experience,
          accState: result.accumulatedState,
          triggers: result.ruleTriggers,
          hasSimulated: true,
        };
        return next;
      });
    }

    return [entry];
  };

  // Unified run: every selected agent gets simulated. Agents with waypoints
  // run the full route; agents without waypoints dwell in place for the
  // shared duration budget. Both feed the same Route Summary in §07.
  const runUnifiedSimulation = async () => {
    if (!getLLMConfig()) {
      toast.error("Please configure API key first");
      navigate("/settings");
      return;
    }

    const toRun = states
      .map((s, i) => ({ idx: i, s }))
      .filter(({ s, idx }) => simChecked[idx] && !!s.agentPos);

    if (toRun.length === 0) {
      toast.error("Place at least one selected agent on the map first.");
      return;
    }

    const withRoute = toRun.filter(({ s }) => s.route.waypoints.length >= 1);
    const stationary = toRun.filter(({ s }) => s.route.waypoints.length === 0);

    // Snapshot positions of moving agents so resetAgents can restore them.
    const snapshot: Record<number, AgentPosition | null> = {};
    withRoute.forEach(({ idx }) => { snapshot[idx] = states[idx]?.agentPos ?? null; });
    originalAgentPositionsRef.current = snapshot;

    setRouteRunning(true);
    routeAbortRef.current = false;
    setPathTrails({});
    toast.info(`Simulating ${withRoute.length} route(s) + ${stationary.length} stationary...`);

    const results = await Promise.all([
      ...withRoute.map(async ({ idx }) => {
        try {
          const log = await runRouteForAgent(idx);
          return { idx, log };
        } catch (err) {
          console.error(`Route failed for agent ${idx}:`, err);
          return { idx, log: [] };
        }
      }),
      ...stationary.map(async ({ idx }) => {
        try {
          const log = await simulateStationary(idx);
          return { idx, log };
        } catch (err) {
          console.error(`Stationary failed for agent ${idx}:`, err);
          return { idx, log: [] };
        }
      }),
    ]);

    setStates((prev) => {
      const next = [...prev];
      for (const { idx, log } of results) {
        if (next[idx]) {
          next[idx] = {
            ...next[idx],
            route: { ...next[idx].route, perceptionLog: log },
          };
        }
      }
      return next;
    });

    const total = results.reduce((s, r) => s + r.log.length, 0);
    toast.success(`Simulation complete: ${total} entries logged.`);
    setRouteRunning(false);
  };

  const stopRoutes = () => {
    routeAbortRef.current = true;
    setRouteRunning(false);
    setAnimatingAgents({});
    toast.info("Route simulation stopped");
  };

  // JSON export (full perception log)
  const exportJSON = () => {
    const data = states.map((s) => ({
      agent: s.persona.agent,
      position: s.persona.position,
      environment: s.persona.environment,
      spatial: s.persona.spatial,
      computed: s.computed,
      accumulated_state: s.accState,
      rule_triggers: s.triggers,
      experience: s.experience,
      route: {
        waypoints: s.route.waypoints,
        perception_log: s.route.perceptionLog.map((entry) => ({
          ...entry,
          stress_score: computeStressScore(entry.accState),
        })),
      },
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sentiarch_multi_agent_output.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON exported (with perception logs)!");
  };

  const agentPositions = useMemo(() => states.map((s) => s.agentPos), [states]);
  const allWaypoints = useMemo(() => {
    const wps: Record<number, Waypoint[]> = {};
    states.forEach((s, i) => {
      if (s.route.waypoints.length > 0) wps[i] = s.route.waypoints;
    });
    return wps;
  }, [states]);

  // Heatmap toggle
  const [showHeatmap, setShowHeatmap] = useState(false);

  const heatmapPoints = useMemo<HeatmapPoint[]>(() => {
    if (!showHeatmap) return [];
    const points: HeatmapPoint[] = [];
    states.forEach((s, agentIdx) => {
      for (const entry of s.route.perceptionLog) {
        if (entry.phase === "dwelling") {
          points.push({
            x: entry.position.x,
            y: entry.position.y,
            value: computeStressScore(entry.accState),
            agentIdx,
          });
        }
      }
    });
    return points;
  }, [states, showHeatmap]);

  const activeWPs = states[activeTab]?.route.waypoints || [];
  const activeLog = states[activeTab]?.route.perceptionLog || [];

  // Roll the per-leg perception log into a single Env. Satisfaction summary.
  // Works for both route runs (multi-leg) and stationary runs (single dwell).
  const activeRouteSummary = useMemo(() => {
    if (!current || activeLog.length === 0) return null;
    const dwellEntries = activeLog.filter((e) => e.phase === "dwelling");
    if (dwellEntries.length === 0) return null;
    const avgComfort = Math.round(
      (activeLog.reduce((s, e) => s + e.experience.comfort_score, 0) / activeLog.length) * 10
    ) / 10;
    const avgStress = Math.round(
      (dwellEntries.reduce((s, e) => s + computeStressScore(e.accState), 0) / dwellEntries.length) * 10
    ) / 10;
    const hasRoute = activeWPs.length > 0;
    const totalBudgetMin = current.persona.position.duration_in_cell;
    const totalDwellMin = hasRoute
      ? activeWPs.reduce((s, w) => s + (w.dwell_minutes || 0), 0)
      : totalBudgetMin;
    const legCount = hasRoute ? activeWPs.length : 1;
    const startComfort = activeLog[0].experience.comfort_score;
    const endComfort = activeLog[activeLog.length - 1].experience.comfort_score;
    const delta = endComfort - startComfort;
    const trend: "rising" | "declining" | "stable" =
      delta > 0.5 ? "rising" : delta < -0.5 ? "declining" : "stable";
    const finalSummary = dwellEntries[dwellEntries.length - 1].experience.summary || "";
    return {
      totalDwellMin,
      totalBudgetMin,
      avgComfort,
      avgStress,
      legCount,
      finalSummary,
      trend,
      startComfort,
      endComfort,
    };
  }, [activeLog, activeWPs, current]);

  if (!current) return null;

  // ---- Derived values for bottom bar / comfort strip ----
  const comfortScore = current.experience.comfort_score || 0;
  const comfortColor = comfortScore >= 7 ? "var(--calm)" : comfortScore >= 4 ? "var(--amber)" : "var(--brick)";
  const simLiveLabel = running ? "CALC" : routeRunning ? "ROUTE" : current.hasSimulated ? "READY" : "IDLE";
  const simulatedCount = states.filter((s) => s.hasSimulated).length;
  const totalWaypoints = Object.values(allWaypoints).reduce((acc, wps) => acc + wps.length, 0);

  return (
    <div className="sa-shell">
      {/* ============================================================ */}
      {/* TOP BAR                                                      */}
      {/* ============================================================ */}
      <div className="sa-topbar">
        <div className="flex items-center gap-5" style={{ minWidth: 0 }}>
          <div className="sa-brand">
            <svg viewBox="0 0 22 22" fill="none" width="22" height="22" style={{ flexShrink: 0 }}>
              <rect x="2" y="2" width="18" height="18" stroke="var(--amber)" strokeWidth="1.2" />
              <path d="M2 11 L20 11 M11 2 L11 20" stroke="var(--amber)" strokeWidth="0.6" strokeDasharray="1.5 1.5" />
              <circle cx="11" cy="11" r="3.2" fill="var(--amber)" opacity="0.85" />
            </svg>
            <span>SentiArch</span>
          </div>
          <div className="sa-crumb" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span>Project</span>
            <span style={{ color: "var(--ink-3)" }}>·</span>
            <b>SENTIARCH / Multi-Agent</b>
            <span style={{ color: "var(--ink-3)" }}>·</span>
            <span>Scenario</span>
            <span style={{ color: "var(--ink-3)" }}>·</span>
            <b>{states.length} agent{states.length !== 1 ? "s" : ""}</b>
          </div>
        </div>
        <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
          <span className="sa-session-tag">
            <span className="sa-live-dot"></span>SIM · {simLiveLabel}
          </span>
          <button className="sa-btn" onClick={exportJSON}>Export JSON</button>
          <button
            className="sa-btn sa-btn-primary"
            onClick={runUnifiedSimulation}
            disabled={running || routeRunning}
            style={{ opacity: (running || routeRunning) ? 0.5 : 1 }}
          >
            {routeRunning ? "Simulating…" : "Run Simulation"}
          </button>
          <button className="sa-btn" onClick={() => navigate("/settings")}>Settings</button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* LEFT PANEL — persona tabs, mind map, waypoints, logs         */}
      {/* ============================================================ */}
      <div className="sa-left-panel">
        {/* --- Agent tabs & comparison toggle --- */}
        <div className="sa-section">
          <div className="sa-section-head">
            <span className="sa-section-title">
              <span className="sa-section-dot" style={{ background: "var(--amber)" }} />
              <span><span className="sa-section-title-num">00</span> · Agents</span>
            </span>
            <span className="sa-section-meta">{states.length} agent{states.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
            {states.map((s, i) => {
              const color = getPersonaColor(i);
              const isActive = activeTab === i;
              return (
                <div key={i} className="relative group">
                  <button
                    onClick={() => setActiveTab(i)}
                    style={{
                      padding: "4px 10px",
                      border: `1px solid ${isActive ? color.primary : "var(--line-1)"}`,
                      background: isActive ? `${color.primary}22` : "var(--bg-2)",
                      color: isActive ? color.primary : "var(--ink-2)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.06em",
                      borderRadius: 2,
                      cursor: "pointer",
                    }}
                  >
                    {s.persona.agent.id}
                  </button>
                  {states.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeAgent(i); }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: "var(--brick)", color: "#fff", fontSize: 9, lineHeight: 1, borderRadius: 2 }}
                      title={`Remove ${s.persona.agent.id}`}
                    >×</button>
                  )}
                </div>
              );
            })}
            <button
              onClick={addAgent}
              style={{
                padding: "4px 10px",
                border: "1px dashed var(--line-2)",
                background: "transparent",
                color: "var(--ink-2)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.06em",
                borderRadius: 2,
                cursor: "pointer",
              }}
              title="Add new agent"
            >+ ADD</button>
            <div className="flex-1" />
            <button
              onClick={() => setShowComparison(!showComparison)}
              style={{
                padding: "4px 10px",
                border: `1px solid ${showComparison ? "var(--amber)" : "var(--line-2)"}`,
                background: showComparison ? "rgba(232,160,74,0.12)" : "var(--bg-2)",
                color: showComparison ? "var(--amber)" : "var(--ink-2)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderRadius: 2,
                cursor: "pointer",
              }}
            >
              {showComparison ? "Close Compare" : "Compare All"}
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap" style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
            <span style={{ color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Simulate</span>
            {states.map((s, i) => {
              const color = getPersonaColor(i);
              return (
                <label key={i} className="flex items-center gap-1.5" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={simChecked[i] ?? true}
                    onChange={(e) => {
                      const next = [...simChecked];
                      next[i] = e.target.checked;
                      setSimChecked(next);
                    }}
                    style={{ width: 12, height: 12, accentColor: color.primary }}
                  />
                  <span style={{ color: color.primary, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    {s.persona.agent.id}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* --- Comparison view or active persona mind map --- */}
        {showComparison ? (
          <div className="sa-section">
            <ComparisonView states={states} />
          </div>
        ) : (
          <PersonaMindMap
            persona={current.persona}
            experience={current.experience}
            accumulatedState={current.accState}
            computedOutputs={current.computed}
            ruleTriggers={current.triggers}
            prevExperience={current.prevExperience}
            prevAccumulatedState={current.prevAccState}
            onPersonaChange={(p) => updatePersonaWithEnvSync(activeTab, p)}
            hasSimulated={current.hasSimulated}
            personaColor={getPersonaColor(activeTab)}
            agentPlaced={current.agentPos !== null}
            routeSummary={activeRouteSummary}
          />
        )}

        {/* --- Waypoint Route section --- */}
        <div className="sa-section">
          <div className="sa-section-head">
            <span className="sa-section-title">
              <span className="sa-section-dot" style={{ background: "var(--brick)" }} />
              <span><span className="sa-section-title-num">09</span> · Waypoint Route</span>
            </span>
            <span className="sa-section-meta">{activeWPs.length} WP</span>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {routeRunning ? (
              <button className="sa-btn sa-btn-danger" style={{ flex: 1, fontSize: 11 }} onClick={stopRoutes}>Stop Routes</button>
            ) : (
              <button className="sa-btn sa-btn-primary" style={{ flex: 1, fontSize: 11 }} disabled={running} onClick={runUnifiedSimulation}>Run Simulation</button>
            )}
            {activeWPs.length > 0 && (
              <button className="sa-btn" style={{ fontSize: 11, color: "var(--brick)", borderColor: "var(--brick)" }} onClick={() => clearWaypoints(activeTab)}>Clear</button>
            )}
          </div>

          {activeWPs.length === 0 ? (
            <p style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.6, fontFamily: "var(--font-mono)" }}>
              Select the Waypoint tool on the map toolbar and click to place waypoints for {current.persona.agent.id}. At least 2 waypoints are needed.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {activeWPs.map((wp, i) => (
                <div key={wp.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", background: "var(--bg-2)", border: "1px solid var(--line-1)",
                }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: getPersonaColor(activeTab).primary, minWidth: 20, fontWeight: 600 }}>{i + 1}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-0)", minWidth: 40 }}>{wp.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)" }}>({wp.position.x}, {wp.position.y})</span>
                  <div className="flex-1" />
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>
                    <span>DWELL</span>
                    <input
                      type="number" min={0} max={120} value={wp.dwell_minutes}
                      onChange={(e) => updateWaypointDwell(activeTab, wp.id, parseInt(e.target.value) || 0)}
                      style={{
                        width: 44, padding: "2px 4px", textAlign: "center",
                        background: "var(--bg-1)", border: "1px solid var(--line-1)",
                        color: "var(--ink-0)", fontFamily: "var(--font-mono)", fontSize: 11,
                      }}
                    />
                    <span style={{ color: "var(--ink-3)" }}>min</span>
                  </label>
                  <button
                    onClick={() => removeWaypoint(activeTab, wp.id)}
                    style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", color: "var(--brick)", border: "1px solid var(--line-1)", fontSize: 11, cursor: "pointer" }}
                    title="Remove waypoint"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- Route results summary --- */}
        {activeLog.length > 0 && (() => {
          const dwellEntries = activeLog.filter((e) => e.phase === "dwelling");
          const walkEntries = activeLog.filter((e) => e.phase === "walking");
          const avgComfort = activeLog.length > 0
            ? Math.round((activeLog.reduce((s, e) => s + e.experience.comfort_score, 0) / activeLog.length) * 10) / 10
            : 0;
          const avgStress = dwellEntries.length > 0
            ? Math.round((dwellEntries.reduce((s, e) => s + computeStressScore(e.accState), 0) / dwellEntries.length) * 10) / 10
            : 0;

          const pillColor = (good: boolean, mid: boolean) => good ? "var(--calm)" : mid ? "var(--amber)" : "var(--brick)";

          return (
            <div className="sa-section">
              <div className="sa-section-head">
                <span className="sa-section-title">
                  <span className="sa-section-dot" style={{ background: "var(--calm)" }} />
                  <span><span className="sa-section-title-num">10</span> · Route Results</span>
                </span>
                <span className="sa-section-meta">{activeLog.length} entries</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
                <div style={{ background: "var(--bg-2)", border: "1px solid var(--line-1)", padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Avg Comfort</div>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, color: pillColor(avgComfort >= 7, avgComfort >= 4), lineHeight: 1 }}>{avgComfort}<span style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 2 }}>/10</span></div>
                </div>
                <div style={{ background: "var(--bg-2)", border: "1px solid var(--line-1)", padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Avg Stress</div>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, color: pillColor(avgStress <= 3, avgStress <= 6), lineHeight: 1 }}>{avgStress}<span style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 2 }}>/10</span></div>
                </div>
                <div style={{ background: "var(--bg-2)", border: "1px solid var(--line-1)", padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Entries</div>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, color: "var(--ink-0)", lineHeight: 1 }}>{activeLog.length}</div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dwellEntries.map((entry, i) => {
                  const wp = activeWPs.find((w) => w.id === entry.waypoint_id);
                  const stress = computeStressScore(entry.accState);
                  const stressCol = stress <= 3 ? "var(--calm)" : stress <= 6 ? "var(--amber)" : "var(--brick)";
                  const comfortCol = entry.experience.comfort_score >= 7 ? "var(--calm)" : entry.experience.comfort_score >= 4 ? "var(--amber)" : "var(--brick)";
                  const walkEntry = walkEntries.find((w) => w.to === entry.waypoint_id);
                  return (
                    <div key={i} style={{ background: "var(--bg-2)", border: "1px solid var(--line-1)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-1)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: getPersonaColor(activeTab).primary, fontWeight: 600 }}>{wp?.label || `WP${i+1}`}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)" }}>({entry.position.x}, {entry.position.y})</span>
                        <div className="flex-1" />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: comfortCol }}>C {entry.experience.comfort_score}/10</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: stressCol }}>S {stress}/10</span>
                      </div>
                      <div style={{ padding: "8px 10px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 12px", marginBottom: 8 }}>
                          {([
                            { key: "thermal_discomfort", label: "Thermal" },
                            { key: "visual_strain",      label: "Visual"  },
                            { key: "noise_stress",       label: "Noise"   },
                            { key: "social_overload",    label: "Social"  },
                            { key: "fatigue",            label: "Fatigue" },
                            { key: "wayfinding_anxiety", label: "Wayfind" },
                          ] as const).map(({ key, label }) => {
                            const val = entry.accState[key];
                            const col = val <= 0.3 ? "var(--calm)" : val <= 0.6 ? "var(--amber)" : "var(--brick)";
                            return (
                              <div key={key}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9 }}>
                                  <span style={{ color: "var(--ink-3)" }}>{label}</span>
                                  <span style={{ color: col }}>{val.toFixed(1)}</span>
                                </div>
                                <div style={{ width: "100%", height: 2, background: "var(--line-1)", marginTop: 2 }}>
                                  <div style={{ width: `${Math.min(100, val*100)}%`, height: "100%", background: col }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-1)", fontFamily: "var(--font-serif)", borderLeft: "2px solid var(--amber)", paddingLeft: 10, margin: 0 }}>{entry.experience.summary}</p>
                        {walkEntry && (
                          <div style={{ marginTop: 8, padding: "6px 10px", background: "var(--bg-1)", border: "1px solid var(--line-1)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--teal)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                              <span style={{ border: "1px solid var(--teal)", padding: "1px 5px" }}>WALK</span>
                              <span style={{ color: "var(--ink-3)" }}>en route to {wp?.label || "?"}</span>
                            </div>
                            <p style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ink-2)", margin: 0 }}>{walkEntry.experience.summary}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Full Perception Log — {activeLog.length} entries
                </summary>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, maxHeight: 300, overflowY: "auto" }}>
                  {activeLog.map((entry, i) => (
                    <div key={i} style={{ padding: "6px 8px", background: entry.phase === "walking" ? "rgba(122,166,196,0.08)" : "rgba(138,166,118,0.08)", border: `1px solid ${entry.phase === "walking" ? "rgba(122,166,196,0.2)" : "rgba(138,166,118,0.2)"}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, fontFamily: "var(--font-mono)", fontSize: 9 }}>
                        <span style={{ padding: "1px 5px", border: `1px solid ${entry.phase === "walking" ? "var(--teal)" : "var(--calm)"}`, color: entry.phase === "walking" ? "var(--teal)" : "var(--calm)", letterSpacing: "0.1em" }}>
                          {entry.phase === "walking" ? "WALK" : "DWELL"}
                        </span>
                        {entry.phase === "walking" && entry.from && entry.to && (
                          <span style={{ color: "var(--ink-3)" }}>
                            {activeWPs.find((w) => w.id === entry.from)?.label || "?"} → {activeWPs.find((w) => w.id === entry.to)?.label || "?"}
                          </span>
                        )}
                        {entry.phase === "dwelling" && (
                          <span style={{ color: "var(--ink-3)" }}>@ {activeWPs.find((w) => w.id === entry.waypoint_id)?.label || "?"}</span>
                        )}
                        <div className="flex-1" />
                        <span style={{ color: "var(--ink-3)" }}>S {computeStressScore(entry.accState).toFixed(1)}</span>
                        <span style={{ color: entry.experience.comfort_score >= 7 ? "var(--calm)" : entry.experience.comfort_score >= 4 ? "var(--amber)" : "var(--brick)" }}>C {entry.experience.comfort_score}/10</span>
                      </div>
                      <p style={{ fontSize: 11, lineHeight: 1.4, color: "var(--ink-1)", margin: 0 }}>{entry.experience.summary}</p>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          );
        })()}

        {/* --- Coordinate Input section --- */}
        <div className="sa-section" style={{ borderBottom: "none" }}>
          <div className="sa-section-head">
            <span className="sa-section-title">
              <span className="sa-section-dot" style={{ background: "var(--teal)" }} />
              <span><span className="sa-section-title-num">11</span> · Coordinate Input</span>
            </span>
          </div>
          <CoordinateInput
            onAddShape={addShape}
            onClearAll={clearAll}
            zones={zones}
            onAddZone={addZone}
            onUpdateZone={updateZone}
            onRemoveZone={removeZone}
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* MAP AREA                                                     */}
      {/* ============================================================ */}
      <div className="sa-map-area">
        {/* Map action bar — sits above the canvas, never overlaps toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-1)", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginRight: 4 }}>Map</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Active</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {states.map((s, i) => {
              const color = getPersonaColor(i);
              const isActive = activeTab === i;
              return (
                <button
                  key={i}
                  onClick={() => setActiveTab(i)}
                  title={s.persona.agent.id}
                  style={{
                    padding: "3px 9px",
                    border: `1px solid ${isActive ? color.primary : "var(--line-1)"}`,
                    background: isActive ? `${color.primary}22` : "var(--bg-2)",
                    color: isActive ? color.primary : "var(--ink-2)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    borderRadius: 2,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span style={{ width: 7, height: 7, background: color.primary, borderRadius: 1 }} />
                  {s.persona.agent.id}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className="sa-tool-btn"
            data-active={showHeatmap}
          >
            {showHeatmap ? "Hide Heatmap" : "Stress Heatmap"}
          </button>
          <button
            onClick={resetAgents}
            disabled={routeRunning}
            className="sa-tool-btn"
            style={{ opacity: routeRunning ? 0.5 : 1 }}
          >
            Reset Agents
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", overflow: "auto" }}>
          <SpatialMap
            shapes={shapes}
            zones={zones}
            agentPositions={agentPositions}
            activeAgentIdx={activeTab}
            onAgentPlace={(pos) => placeAgent(activeTab, pos)}
            onAgentRemove={(idx) => {
              setStates((prev) => prev.map((s, i) => i === idx ? { ...s, agentPos: null } : s));
            }}
            onAddShape={addShape}
            onAddZone={addZone}
            onUpdateShapes={updateShapes}
            onDeleteShape={deleteShape}
            allWaypoints={allWaypoints}
            onAddWaypoint={addWaypoint}
            onRemoveWaypoint={removeWaypoint}
            animatingAgents={animatingAgents}
            pathTrails={pathTrails}
            heatmapPoints={heatmapPoints}
            showHeatmap={showHeatmap}
          />



          {/* Comfort card overlay (top-right, under toolbar) */}
          {current.hasSimulated && (
            <div style={{
              position: "absolute", top: 58, right: 14, zIndex: 5,
              background: "rgba(33,30,27,0.92)", backdropFilter: "blur(8px)",
              border: "1px solid var(--line-2)", padding: "12px 16px", minWidth: 200,
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-2)", marginBottom: 6 }}>
                Comfort Score · {current.persona.agent.id}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 32, color: comfortColor, lineHeight: 1 }}>{comfortScore}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)" }}>/10</span>
                <div className="flex-1" />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: current.experience.trend === "rising" ? "var(--calm)" : current.experience.trend === "declining" ? "var(--brick)" : "var(--ink-2)" }}>
                  {current.experience.trend === "rising" ? "↑" : current.experience.trend === "declining" ? "↓" : "→"} {current.experience.trend}
                </span>
              </div>
              <div style={{ height: 3, background: "var(--line-1)", marginTop: 10 }}>
                <div style={{ height: "100%", width: `${comfortScore * 10}%`, background: comfortColor, transition: "width 0.3s" }} />
              </div>
            </div>
          )}
        </div>

        {/* Comfort strip between map and bottom bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 18px", height: 40, borderTop: "1px solid var(--line-1)", background: "var(--bg-1)", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-2)", letterSpacing: "0.1em" }}>COMFORT</span>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 20, color: comfortColor }}>{comfortScore}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)" }}>/10</span>
          <div style={{ flex: 1, height: 3, background: "var(--line-1)", position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${comfortScore * 10}%`, background: comfortColor, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em" }}>{current.persona.agent.id} · {current.experience.trend}</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* BOTTOM BAR — transport, timeline, status pills               */}
      {/* ============================================================ */}
      <div className="sa-bottom-bar">
        <div className="sa-transport">
          <button
            className="sa-transport-btn"
            onClick={resetAgents}
            disabled={routeRunning}
            title="Reset all agents"
          >⏮</button>
          <button
            className="sa-transport-btn sa-transport-btn-primary"
            onClick={() => {
              if (routeRunning) stopRoutes();
              else runUnifiedSimulation();
            }}
            disabled={running}
            title={routeRunning ? "Stop simulation" : "Run simulation (route + stationary)"}
          >{routeRunning ? "❚❚" : "▶"}</button>
          <button
            className="sa-transport-btn"
            onClick={runUnifiedSimulation}
            disabled={running || routeRunning}
            title="Run simulation"
          >⏭</button>
          <button
            className="sa-transport-btn"
            onClick={clearAll}
            title="Clear map"
          >↻</button>
        </div>

        <div className="sa-timeline">
          <div className="sa-timeline-track" />
          <div className="sa-timeline-fill" style={{ width: `${Math.min(100, simulatedCount / Math.max(1, states.length) * 100)}%` }} />
          {states.map((s, i) => (
            <div
              key={i}
              className={`sa-timeline-event ${s.hasSimulated ? "sa-timeline-event-amber" : ""}`}
              style={{ left: `${((i + 0.5) / states.length) * 100}%` }}
              title={s.persona.agent.id}
            />
          ))}
          <span style={{ position: "absolute", bottom: -2, left: 0, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)" }}>AGENT 1</span>
          <span style={{ position: "absolute", bottom: -2, right: 0, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)" }}>AGENT {states.length}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="sa-status-pill"><span className="sa-live-dot" />LLM SYNC</span>
          <span className="sa-status-pill">WAYPOINTS · {totalWaypoints}</span>
          <span className="sa-status-pill">SHAPES · {shapes.length}</span>
          <span className="sa-status-pill">ZONES · {zones.length}</span>
        </div>
      </div>
    </div>
  );
}
