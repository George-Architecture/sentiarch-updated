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
  callLLM,
  callLLMWithPrompt,
  buildWalkPrompt,
  buildDwellPrompt,
  isAgentCoreChange,
  getEnvAtPosition,
  zoneEnvToEnvironment,
  getPersonaColor,
  createNewPersona,
  type HeatmapPoint,
} from "@/lib/store";

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
    return defaultPersonas.map((p) => createDefaultState(p));
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
    setShapes((s) => [...s, shape]);
  }, []);

  const updateShapes = useCallback((newShapes: Shape[]) => {
    setShapes(newShapes);
  }, []);

  const deleteShape = useCallback((idx: number) => {
    setShapes((prev) => prev.filter((_, i) => i !== idx));
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
      route.waypoints = [...route.waypoints, wp];
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
      route.waypoints = route.waypoints.map((w) =>
        w.id === wpId ? { ...w, dwell_minutes: minutes } : w
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

  // Simulate single persona (snapshot)
  const simulateSingle = async (idx: number): Promise<boolean> => {
    const s = states[idx];
    if (!s) return false;
    const result = await callLLM(s.persona, s.computed, shapes, zones);
    if (!result) return false;

    setStates((prev) => {
      const next = [...prev];
      if (!next[idx]) return prev;
      const old = next[idx];
      const prevScore = old.hasSimulated ? old.experience.comfort_score : 0;
      const newScore = result.experience.comfort_score;
      let trend: "rising" | "declining" | "stable" = "stable";
      if (prevScore > 0) {
        const delta = newScore - prevScore;
        if (delta > 0.5) trend = "rising";
        else if (delta < -0.5) trend = "declining";
      }

      next[idx] = {
        ...old,
        prevExperience: old.hasSimulated ? { ...old.experience } : null,
        prevAccState: old.hasSimulated ? { ...old.accState } : null,
        experience: { ...result.experience, trend },
        accState: result.accumulatedState,
        triggers: result.ruleTriggers,
        hasSimulated: true,
      };
      return next;
    });
    return true;
  };

  // Batch simulate (snapshot)
  const batchSimulate = async () => {
    if (!getLLMConfig()) {
      toast.error("Please configure API key first");
      navigate("/settings");
      return;
    }
    const toRun = simChecked.map((c, i) => c ? i : -1).filter((i) => i >= 0 && i < states.length);
    if (toRun.length === 0) {
      toast.error("Please select at least one persona to simulate");
      return;
    }
    setRunning(true);
    toast.info(`Simulating ${toRun.length} persona(s)...`);
    const results = await Promise.all(toRun.map((idx) => simulateSingle(idx)));
    const successes = results.filter(Boolean).length;
    const failures = results.filter((r) => !r).length;
    if (successes > 0) toast.success(`${successes} simulation(s) complete!`);
    if (failures > 0) toast.error(`${failures} simulation(s) failed.`);
    setRunning(false);
  };

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
    const trail: AgentPosition[] = [fullPath[0]];
    const WALK_SPEED = 1200;
    const ANIM_INTERVAL = 50;

    for (let i = 0; i < fullPath.length - 1; i++) {
      if (routeAbortRef.current) break;

      const fromPos = fullPath[i];
      const toPos = fullPath[i + 1];
      // Waypoint ID for log: "agent-start" for agent pos, then actual waypoint IDs
      const fromID = i === 0 ? "agent-start" : wps[i - 1].id;
      const toID = wps[i].id;
      const targetWP = wps[i];
      const dist = posDist(fromPos, toPos);
      const walkDuration = (dist / WALK_SPEED) * 1000;
      const steps = Math.max(1, Math.floor(walkDuration / ANIM_INTERVAL));

      for (let step = 0; step <= steps; step++) {
        if (routeAbortRef.current) break;
        const t = step / steps;
        const pos = lerpPos(fromPos, toPos, t);
        setAnimatingAgents((prev) => ({ ...prev, [idx]: pos }));
        trail.push(pos);
        setPathTrails((prev) => ({ ...prev, [idx]: [...trail] }));
        await new Promise((r) => setTimeout(r, ANIM_INTERVAL));
      }

      if (routeAbortRef.current) break;

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

      const walkPrompt = buildWalkPrompt(walkPersona, walkComputed, shapes, dummyFromWP, targetWP, midPos, zones);
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
        accState: walkResult?.accumulatedState || s.accState,
        triggers: walkResult?.ruleTriggers || [],
        timestamp: new Date().toISOString(),
      };
      log.push(walkEntry);

      if (walkResult) {
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
      setAnimatingAgents((prev) => ({ ...prev, [idx]: arrivalPos }));

      const dwellEnv = getEnvAtPosition(arrivalPos.x, arrivalPos.y, zones, shapes);
      const dwellEnvData = zoneEnvToEnvironment(dwellEnv);
      const dwellSpatial = computeSpatialFromAgent(arrivalPos, shapes, s.persona.spatial);
      const dwellPersona = { ...s.persona, environment: dwellEnvData, spatial: dwellSpatial };
      const dwellComputed = computeOutputs(dwellPersona);

      const dwellPrompt = buildDwellPrompt(dwellPersona, dwellComputed, shapes, targetWP, targetWP.dwell_minutes, zones);
      const dwellResult = await callLLMWithPrompt(dwellPrompt);

      const dwellEntry: PerceptionLogEntry = {
        waypoint_id: targetWP.id,
        phase: "dwelling",
        position: arrivalPos,
        environment: dwellEnvData,
        spatial: dwellSpatial,
        computed: dwellComputed,
        experience: dwellResult?.experience || { summary: "Dwelling...", comfort_score: 5, trend: "stable" },
        accState: dwellResult?.accumulatedState || s.accState,
        triggers: dwellResult?.ruleTriggers || [],
        timestamp: new Date().toISOString(),
      };
      log.push(dwellEntry);

      if (dwellResult) {
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

      await new Promise((r) => setTimeout(r, 800));
    }

    setAnimatingAgents((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });

    return log;
  };

  const runAllRoutes = async () => {
    if (!getLLMConfig()) {
      toast.error("Please configure API key first");
      navigate("/settings");
      return;
    }

    const agentsWithRoutes = states
      .map((s, i) => ({ idx: i, wps: s.route.waypoints, hasPos: !!s.agentPos }))
      .filter((a) => a.hasPos && a.wps.length >= 1 && simChecked[a.idx]);

    if (agentsWithRoutes.length === 0) {
      toast.error("No agents have waypoint routes defined (need agent placed and at least 1 waypoint)");
      return;
    }

    setRouteRunning(true);
    routeAbortRef.current = false;
    setPathTrails({});
    toast.info(`Running route simulation for ${agentsWithRoutes.length} agent(s)...`);

    const results = await Promise.all(
      agentsWithRoutes.map(async ({ idx }) => {
        try {
          const log = await runRouteForAgent(idx);
          return { idx, log };
        } catch (err) {
          console.error(`Route failed for agent ${idx}:`, err);
          return { idx, log: [] };
        }
      })
    );

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
    toast.success(`Route simulation complete! ${total} perception entries logged.`);
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

  if (!current) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* ---- Header ---- */}
      <header style={{
        background: "var(--card)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
      }}>
        <div className="container py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
              SentiArch
            </h1>
            <p className="text-xs mt-0.5 tracking-wide" style={{ color: "var(--muted-foreground)" }}>
              Multi-Agent Environmental Experience Model
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right hidden md:block mr-3">
              <div className="text-sm font-medium" style={{ color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
                {current.persona.agent.id}
              </div>
              <div className="text-xs font-medium" style={{
                color: current.experience.comfort_score > 0
                  ? (current.experience.trend === "declining" ? "#D94F4F" : current.experience.trend === "rising" ? "#1D9E75" : "var(--muted-foreground)")
                  : "var(--muted-foreground)",
              }}>
                Comfort {current.experience.comfort_score}/10
              </div>
            </div>
            <button className="sa-btn" onClick={exportJSON}>
              Export JSON
            </button>
            <button
              className="sa-btn sa-btn-primary"
              onClick={batchSimulate}
              disabled={running || routeRunning}
              style={{ opacity: (running || routeRunning) ? 0.6 : 1 }}
            >
              {running ? "Calculating..." : "Run Current Calculation"}
            </button>
            <button
              className="sa-btn"
              onClick={() => navigate("/settings")}
              style={{ padding: "8px 12px" }}
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      {/* ---- Persona Mind Map Section ---- */}
      <section>
        <div className="container py-6">
          {/* Section header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="sa-tag" style={{ background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" }}>
              Persona Mind Map
            </div>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Click values to edit
            </span>
          </div>

          {/* ---- Dynamic Persona Tabs ---- */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {states.map((s, i) => {
              const color = getPersonaColor(i);
              const isActive = activeTab === i;
              return (
                <div key={i} className="relative group">
                  <button
                    onClick={() => setActiveTab(i)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium"
                    style={{
                      background: isActive ? color.primary : "var(--card)",
                      color: isActive ? "#fff" : color.primary,
                      border: `1.5px solid ${isActive ? color.primary : "var(--border)"}`,
                      boxShadow: isActive
                        ? `0 2px 8px ${color.primary}30`
                        : "2px 2px 6px rgba(0,0,0,0.04), -1px -1px 4px rgba(255,255,255,0.7)",
                      transform: isActive ? "translateY(-1px)" : "none",
                    }}
                  >
                    <div className="w-4 h-4 rounded-full" style={{
                      background: isActive ? "#fff" : color.primary,
                      opacity: isActive ? 0.9 : 0.7,
                    }} />
                    <span>{s.persona.agent.id}</span>
                  </button>
                  {/* Remove button on hover */}
                  {states.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeAgent(i); }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{
                        background: "#D94F4F",
                        color: "#fff",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                        lineHeight: 1,
                      }}
                      title={`Remove P${i + 1}`}
                    >
                      x
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add Agent Button */}
            <button
              onClick={addAgent}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all text-sm font-medium"
              style={{
                background: "var(--card)",
                color: "var(--muted-foreground)",
                border: "1.5px dashed var(--border)",
                boxShadow: "2px 2px 6px rgba(0,0,0,0.04), -1px -1px 4px rgba(255,255,255,0.7)",
              }}
              title="Add new agent"
            >
              <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span>
              <span>Add Agent</span>
            </button>

            <div className="flex-1" />
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="sa-btn text-xs"
              style={{
                background: showComparison ? "var(--foreground)" : "var(--card)",
                color: showComparison ? "#fff" : "var(--foreground)",
              }}
            >
              {showComparison ? "Close Compare" : "Compare All"}
            </button>
          </div>

          {/* Simulate Checkboxes */}
          <div className="flex items-center gap-4 mb-4 px-1 flex-wrap">
            <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
              Simulate:
            </span>
            {states.map((s, i) => {
              const color = getPersonaColor(i);
              return (
                <label key={i} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simChecked[i] ?? true}
                    onChange={(e) => {
                      const next = [...simChecked];
                      next[i] = e.target.checked;
                      setSimChecked(next);
                    }}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: color.primary }}
                  />
                  <span className="text-sm" style={{ color: color.primary, fontFamily: "'JetBrains Mono', monospace" }}>
                    {s.persona.agent.id}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Comparison View */}
          {showComparison && <ComparisonView states={states} />}

          {/* Active Persona Mind Map */}
          {!showComparison && (
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
            />
          )}
        </div>
      </section>

      {/* ---- Divider ---- */}
      <div className="container">
        <div className="h-px" style={{ background: "var(--border)" }} />
      </div>

      {/* ---- Spatial Map Section ---- */}
      <section>
        <div className="container py-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="sa-tag" style={{ background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" }}>
              Spatial Map
            </div>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                Click to place Agent #{activeTab + 1} &middot; World Coordinates (mm)
              </span>
              <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className="sa-btn text-xs px-3 py-1"
                style={{
                  background: showHeatmap ? "#D94F4F" : "var(--card)",
                  color: showHeatmap ? "#fff" : "var(--foreground)",
                  borderColor: showHeatmap ? "#D94F4F" : "var(--border)",
                }}
              >
                {showHeatmap ? "Hide Heatmap" : "Stress Heatmap"}
              </button>
            </div>
          </div>

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
        </div>
      </section>

      {/* ---- Divider ---- */}
      <div className="container">
        <div className="h-px" style={{ background: "var(--border)" }} />
      </div>

      {/* ---- Waypoint Route Section ---- */}
      <section>
        <div className="container py-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="sa-tag" style={{ background: "#E67E22", color: "#fff", borderColor: "#E67E22" }}>
              Waypoint Routes
            </div>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            <div className="flex items-center gap-2">
              {routeRunning ? (
                <button className="sa-btn text-xs" onClick={stopRoutes}
                  style={{ background: "#D94F4F15", color: "#D94F4F", borderColor: "#D94F4F40" }}>
                  Stop Routes
                </button>
              ) : (
                <button className="sa-btn sa-btn-primary text-xs" onClick={runAllRoutes}
                  disabled={running}
                  style={{ background: "#E67E22", borderColor: "#E67E22" }}>
                  Run Route Simulation
                </button>
              )}
            </div>
          </div>

          {/* Active agent waypoints */}
          <div className="sa-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ background: getPersonaColor(activeTab).primary }} />
              <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                P{activeTab + 1} Route — {activeWPs.length} waypoint{activeWPs.length !== 1 ? "s" : ""}
              </span>
              <div className="flex-1" />
              {activeWPs.length > 0 && (
                <button className="sa-btn text-xs" onClick={() => clearWaypoints(activeTab)}
                  style={{ background: "#D94F4F10", color: "#D94F4F", borderColor: "#D94F4F30" }}>
                  Clear Route
                </button>
              )}
            </div>

            {activeWPs.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                Select the Waypoint tool on the map toolbar and click to place waypoints for this agent.
                At least 2 waypoints are needed to run a route simulation.
              </p>
            ) : (
              <div className="space-y-2">
                {activeWPs.map((wp, i) => (
                  <div key={wp.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                  }}>
                    <span className="text-xs font-bold" style={{
                      color: getPersonaColor(activeTab).primary,
                      fontFamily: "'JetBrains Mono', monospace",
                      minWidth: "24px",
                    }}>
                      {i + 1}
                    </span>
                    <span className="text-xs font-medium" style={{ color: "var(--foreground)", minWidth: "50px" }}>
                      {wp.label}
                    </span>
                    <span className="text-xs" style={{
                      color: "var(--muted-foreground)",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      ({wp.position.x}, {wp.position.y})
                    </span>
                    <div className="flex-1" />
                    <label className="flex items-center gap-1.5 text-xs">
                      <span style={{ color: "var(--muted-foreground)" }}>Dwell:</span>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={wp.dwell_minutes}
                        onChange={(e) => updateWaypointDwell(activeTab, wp.id, parseInt(e.target.value) || 0)}
                        className="w-12 px-1 py-0.5 rounded text-xs text-center"
                        style={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          color: "var(--foreground)",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      />
                      <span style={{ color: "var(--muted-foreground)" }}>min</span>
                    </label>
                    <button
                      onClick={() => removeWaypoint(activeTab, wp.id)}
                      className="w-5 h-5 flex items-center justify-center rounded text-xs"
                      style={{ background: "#D94F4F15", color: "#D94F4F" }}
                      title="Remove waypoint"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- Results Panel: Per-Waypoint Summary ---- */}
          {activeLog.length > 0 && (() => {
            const dwellEntries = activeLog.filter((e) => e.phase === "dwelling");
            const walkEntries = activeLog.filter((e) => e.phase === "walking");
            const avgComfort = activeLog.length > 0
              ? Math.round((activeLog.reduce((s, e) => s + e.experience.comfort_score, 0) / activeLog.length) * 10) / 10
              : 0;
            const avgStress = dwellEntries.length > 0
              ? Math.round((dwellEntries.reduce((s, e) => s + computeStressScore(e.accState), 0) / dwellEntries.length) * 10) / 10
              : 0;

            return (
              <>
                <div className="sa-card mt-4">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                      Route Results Summary
                    </span>
                    <div className="flex-1" />
                    <div className="flex items-center gap-3">
                      <div className="text-center px-3 py-1.5 rounded-lg" style={{
                        background: avgComfort >= 7 ? "#1D9E7512" : avgComfort >= 4 ? "#E67E2212" : "#D94F4F12",
                        border: `1px solid ${avgComfort >= 7 ? "#1D9E7530" : avgComfort >= 4 ? "#E67E2230" : "#D94F4F30"}`,
                      }}>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Avg Comfort</div>
                        <div className="text-lg font-bold" style={{
                          color: avgComfort >= 7 ? "#1D9E75" : avgComfort >= 4 ? "#E67E22" : "#D94F4F",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>{avgComfort}/10</div>
                      </div>
                      <div className="text-center px-3 py-1.5 rounded-lg" style={{
                        background: avgStress <= 3 ? "#1D9E7512" : avgStress <= 6 ? "#E67E2212" : "#D94F4F12",
                        border: `1px solid ${avgStress <= 3 ? "#1D9E7530" : avgStress <= 6 ? "#E67E2230" : "#D94F4F30"}`,
                      }}>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Avg Stress</div>
                        <div className="text-lg font-bold" style={{
                          color: avgStress <= 3 ? "#1D9E75" : avgStress <= 6 ? "#E67E22" : "#D94F4F",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>{avgStress}/10</div>
                      </div>
                      <div className="text-center px-3 py-1.5 rounded-lg" style={{
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                      }}>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Entries</div>
                        <div className="text-lg font-bold" style={{
                          color: "var(--foreground)",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>{activeLog.length}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {dwellEntries.map((entry, i) => {
                      const wp = activeWPs.find((w) => w.id === entry.waypoint_id);
                      const stress = computeStressScore(entry.accState);
                      const stressColor = stress <= 3 ? "#1D9E75" : stress <= 6 ? "#E67E22" : "#D94F4F";
                      const comfortColor = entry.experience.comfort_score >= 7 ? "#1D9E75" :
                                           entry.experience.comfort_score >= 4 ? "#E67E22" : "#D94F4F";
                      const walkEntry = walkEntries.find((w) => w.to === entry.waypoint_id);

                      return (
                        <div key={i} className="rounded-xl overflow-hidden" style={{
                          border: "1px solid var(--border)",
                          background: "var(--background)",
                        }}>
                          <div className="flex items-center gap-3 px-4 py-2.5" style={{
                            background: "var(--card)",
                            borderBottom: "1px solid var(--border)",
                          }}>
                            <span className="text-sm font-bold" style={{
                              color: getPersonaColor(activeTab).primary,
                              fontFamily: "'JetBrains Mono', monospace",
                            }}>
                              {wp?.label || `WP${i + 1}`}
                            </span>
                            <span className="text-xs" style={{
                              color: "var(--muted-foreground)",
                              fontFamily: "'JetBrains Mono', monospace",
                            }}>
                              ({entry.position.x}, {entry.position.y})
                            </span>
                            <div className="flex-1" />
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded" style={{
                                background: `${comfortColor}12`,
                                border: `1px solid ${comfortColor}30`,
                              }}>
                                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Comfort</span>
                                <span className="text-xs font-bold" style={{
                                  color: comfortColor,
                                  fontFamily: "'JetBrains Mono', monospace",
                                }}>{entry.experience.comfort_score}/10</span>
                              </div>
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded" style={{
                                background: `${stressColor}12`,
                                border: `1px solid ${stressColor}30`,
                              }}>
                                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Stress</span>
                                <span className="text-xs font-bold" style={{
                                  color: stressColor,
                                  fontFamily: "'JetBrains Mono', monospace",
                                }}>{stress}/10</span>
                              </div>
                            </div>
                          </div>

                          <div className="px-4 py-3">
                            <div className="grid grid-cols-3 gap-x-4 gap-y-2 mb-3">
                              {([
                                { key: "thermal_discomfort", label: "Thermal" },
                                { key: "visual_strain", label: "Visual" },
                                { key: "noise_stress", label: "Noise" },
                                { key: "social_overload", label: "Social" },
                                { key: "fatigue", label: "Fatigue" },
                                { key: "wayfinding_anxiety", label: "Wayfinding" },
                              ] as const).map(({ key, label }) => {
                                const val = entry.accState[key];
                                const barColor = val <= 3 ? "#1D9E75" : val <= 6 ? "#E67E22" : "#D94F4F";
                                return (
                                  <div key={key}>
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-xs" style={{ color: "var(--muted-foreground)", fontSize: "10px" }}>{label}</span>
                                      <span className="text-xs font-medium" style={{
                                        color: barColor,
                                        fontFamily: "'JetBrains Mono', monospace",
                                        fontSize: "10px",
                                      }}>{val.toFixed(1)}</span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full" style={{ background: "var(--border)" }}>
                                      <div className="h-full rounded-full transition-all" style={{
                                        width: `${Math.min(100, val * 10)}%`,
                                        background: barColor,
                                        opacity: 0.7,
                                      }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="rounded-lg px-3 py-2" style={{
                              background: "var(--card)",
                              border: "1px solid var(--border)",
                            }}>
                              <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
                                {entry.experience.summary}
                              </p>
                            </div>

                            {walkEntry && (
                              <div className="mt-2 rounded-lg px-3 py-2" style={{
                                background: "#3B82F606",
                                border: "1px solid #3B82F615",
                              }}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-xs font-bold px-1 py-0.5 rounded" style={{
                                    background: "#3B82F612",
                                    color: "#3B82F6",
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: "9px",
                                  }}>WALK</span>
                                  <span className="text-xs" style={{ color: "var(--muted-foreground)", fontSize: "10px" }}>
                                    en route to {wp?.label || "?"}
                                  </span>
                                </div>
                                <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
                                  {walkEntry.experience.summary}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <details className="sa-card mt-4">
                  <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                    Full Perception Log — {activeLog.length} entries
                  </summary>
                  <div className="space-y-2 mt-3 max-h-80 overflow-y-auto">
                    {activeLog.map((entry, i) => (
                      <div key={i} className="px-3 py-2 rounded-lg" style={{
                        background: entry.phase === "walking" ? "#3B82F608" : "#1D9E7508",
                        border: `1px solid ${entry.phase === "walking" ? "#3B82F620" : "#1D9E7520"}`,
                      }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{
                            background: entry.phase === "walking" ? "#3B82F615" : "#1D9E7515",
                            color: entry.phase === "walking" ? "#3B82F6" : "#1D9E75",
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            {entry.phase === "walking" ? "WALK" : "DWELL"}
                          </span>
                          {entry.phase === "walking" && entry.from && entry.to && (
                            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                              {activeWPs.find((w) => w.id === entry.from)?.label || "?"} → {activeWPs.find((w) => w.id === entry.to)?.label || "?"}
                            </span>
                          )}
                          {entry.phase === "dwelling" && (
                            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                              @ {activeWPs.find((w) => w.id === entry.waypoint_id)?.label || "?"}
                            </span>
                          )}
                          <div className="flex-1" />
                          <span className="text-xs" style={{
                            color: "var(--muted-foreground)",
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: "10px",
                          }}>
                            Stress: {computeStressScore(entry.accState).toFixed(1)}
                          </span>
                          <span className="text-xs font-medium" style={{
                            color: entry.experience.comfort_score >= 7 ? "#1D9E75" :
                                   entry.experience.comfort_score >= 4 ? "#E67E22" : "#D94F4F",
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            {entry.experience.comfort_score}/10
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
                          {entry.experience.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            );
          })()}
        </div>
      </section>

      {/* ---- Divider ---- */}
      <div className="container">
        <div className="h-px" style={{ background: "var(--border)" }} />
      </div>

      {/* ---- Coordinate Input Section ---- */}
      <section>
        <div className="container py-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="sa-tag" style={{ background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" }}>
              Coordinate Input
            </div>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>
          <div className="sa-card">
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
      </section>
    </div>
  );
}
