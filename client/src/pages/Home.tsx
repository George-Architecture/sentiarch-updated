// ============================================================
// Home Page - Multi-Agent Occupant Perception Map
// Clean neumorphism UI with Inter font
// ============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
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
  defaultPersonas,
  defaultExperience,
  defaultAccumulatedState,
  defaultComputedOutputs,
  computeOutputs,
  computePerceptualLoad,
  computeSpatialFromAgent,
  computeVisibleAgents,
  posToCell,
  saveShapes,
  loadShapes,
  saveMultiAgent,
  loadMultiAgent,
  saveZones,
  loadZones,
  getLLMConfig,
  callLLM,
  isAgentCoreChange,
  getEnvAtPosition,
  zoneEnvToEnvironment,
  PERSONA_COLORS,
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
  };
}

export default function Home() {
  const [, navigate] = useLocation();

  // Multi-agent state: array of 3 persona states
  const [states, setStates] = useState<PersonaState[]>(() => {
    const saved = loadMultiAgent();
    if (saved && saved.personas.length === 3) {
      return saved.personas.map((p, i) => ({
        ...createDefaultState(p),
        agentPos: saved.positions[i],
      }));
    }
    return defaultPersonas.map((p) => createDefaultState(p));
  });

  const [shapes, setShapes] = useState<Shape[]>(() => loadShapes());
  const [zones, setZones] = useState<Zone[]>(() => loadZones());
  const [activeTab, setActiveTab] = useState(0);
  const [simChecked, setSimChecked] = useState([true, true, true]);
  const [running, setRunning] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // Current active persona state
  const current = states[activeTab];

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
      // Also recompute spatial metrics when shapes change
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
    states[0]?.agentPos?.x, states[0]?.agentPos?.y,
    states[1]?.agentPos?.x, states[1]?.agentPos?.y,
    states[2]?.agentPos?.x, states[2]?.agentPos?.y,
    shapes,
  ]);

  // Shape management
  const addShape = useCallback((shape: Shape) => {
    setShapes((s) => [...s, shape]);
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
    setStates((prev) => prev.map((s) => ({ ...s, agentPos: null })));
    toast.info("Map cleared");
  }, []);

  // Agent placement on spatial map — now also derives environment from zones
  const placeAgent = useCallback((idx: number, pos: AgentPosition) => {
    setStates((prev) => {
      const next = [...prev];
      const cell = posToCell(pos.x, pos.y);
      const spatial = computeSpatialFromAgent(pos, shapes, next[idx].persona.spatial);
      // Derive environment from zone at this position (with window influence)
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

  // Environment sync
  const updatePersonaWithEnvSync = useCallback((idx: number, newPersona: PersonaData) => {
    setStates((prev) => {
      const next = [...prev];
      const old = next[idx];
      const envChanged = JSON.stringify(old.persona.environment) !== JSON.stringify(newPersona.environment);

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
        if (envChanged) {
          for (let i = 0; i < next.length; i++) {
            if (i !== idx) {
              next[i] = { ...next[i], persona: { ...next[i].persona, environment: { ...newPersona.environment } } };
            }
          }
        }
        return next;
      }

      next[idx] = { ...old, persona: newPersona };
      if (envChanged) {
        for (let i = 0; i < next.length; i++) {
          if (i !== idx) {
            next[i] = { ...next[i], persona: { ...next[i].persona, environment: { ...newPersona.environment } } };
          }
        }
      }
      return next;
    });
  }, []);

  // Simulate single persona
  const simulateSingle = async (idx: number): Promise<boolean> => {
    const s = states[idx];
    const result = await callLLM(s.persona, s.computed, shapes);
    if (!result) return false;

    setStates((prev) => {
      const next = [...prev];
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

  // Batch simulate
  const batchSimulate = async () => {
    if (!getLLMConfig()) {
      toast.error("Please configure API key first");
      navigate("/settings");
      return;
    }
    const toRun = simChecked.map((c, i) => c ? i : -1).filter((i) => i >= 0);
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

  // JSON export
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
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sentiarch_multi_agent_output.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON exported!");
  };

  const agentPositions = useMemo(() => states.map((s) => s.agentPos), [states]);

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
              disabled={running}
              style={{ opacity: running ? 0.6 : 1 }}
            >
              {running ? "Simulating..." : "Run Simulation"}
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

          {/* Persona Tabs */}
          <div className="flex items-center gap-2 mb-4">
            {states.map((s, i) => {
              const color = PERSONA_COLORS[i];
              const isActive = activeTab === i;
              return (
                <button
                  key={i}
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
                  {/* Circle avatar */}
                  <div className="w-4 h-4 rounded-full" style={{
                    background: isActive ? "#fff" : color.primary,
                    opacity: isActive ? 0.9 : 0.7,
                  }} />
                  <span>{s.persona.agent.id}</span>
                </button>
              );
            })}

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
          <div className="flex items-center gap-4 mb-4 px-1">
            <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
              Simulate:
            </span>
            {states.map((s, i) => (
              <label key={i} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simChecked[i]}
                  onChange={(e) => {
                    const next = [...simChecked];
                    next[i] = e.target.checked;
                    setSimChecked(next);
                  }}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: PERSONA_COLORS[i].primary }}
                />
                <span className="text-sm" style={{ color: PERSONA_COLORS[i].primary, fontFamily: "'JetBrains Mono', monospace" }}>
                  {s.persona.agent.id}
                </span>
              </label>
            ))}
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
              personaColor={PERSONA_COLORS[activeTab]}
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
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Click to place Agent #{activeTab + 1} &middot; World Coordinates (mm)
            </span>
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
          />
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
