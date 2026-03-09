// ============================================================
// Home Page - Multi-Agent Occupant Perception Map
// Features: 3 Persona tabs, Baseline Reset, Batch Simulate,
//           Environment Sync, Comparison View, Vis.Agent dynamic
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
  getLLMConfig,
  callLLM,
  isAgentCoreChange,
  PERSONA_COLORS,
} from "@/lib/store";

const HEADER_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663372089862/WRjHgs6LKvCyaEggYn3mGi/pixel-header-bg-CbXhGq7GagYN9FJRghcaKa.webp";
const VINE_DIVIDER = "https://d2xsxph8kpxj0f.cloudfront.net/310519663372089862/WRjHgs6LKvCyaEggYn3mGi/pixel-vine-divider-4N4gwetwgD8hXQoT9eAZit.webp";
const WOOD_TEXTURE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663372089862/WRjHgs6LKvCyaEggYn3mGi/pixel-wood-panel-gYASMJkw8fUFWAkd7LLpbp.webp";

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
  const [activeTab, setActiveTab] = useState(0);
  const [simChecked, setSimChecked] = useState([true, true, true]);
  const [running, setRunning] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // Current active persona state
  const current = states[activeTab];

  // Persist
  useEffect(() => { saveShapes(shapes); }, [shapes]);
  useEffect(() => {
    saveMultiAgent({
      personas: states.map((s) => s.persona),
      positions: states.map((s) => s.agentPos),
    });
  }, [states]);

  // Recompute PMV/PPD + perceptual load when persona changes
  useEffect(() => {
    setStates((prev) => prev.map((s) => {
      const c = computeOutputs(s.persona);
      const load = s.hasSimulated ? s.accState : computePerceptualLoad(s.persona, c);
      return { ...s, computed: c, accState: load };
    }));
  }, [
    // Trigger on environment or agent parameter changes
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

  const clearAll = useCallback(() => {
    setShapes([]);
    setStates((prev) => prev.map((s) => ({ ...s, agentPos: null })));
    toast.info("Map cleared");
  }, []);

  // Agent placement on spatial map
  const placeAgent = useCallback((idx: number, pos: AgentPosition) => {
    setStates((prev) => {
      const next = [...prev];
      const cell = posToCell(pos.x, pos.y);
      const spatial = computeSpatialFromAgent(pos, shapes, next[idx].persona.spatial);
      next[idx] = {
        ...next[idx],
        agentPos: pos,
        persona: { ...next[idx].persona, position: { ...next[idx].persona.position, cell }, spatial },
      };
      return next;
    });
  }, [shapes]);

  // Update persona with baseline reset logic
  const updatePersona = useCallback((idx: number, newPersona: PersonaData) => {
    setStates((prev) => {
      const next = [...prev];
      const old = next[idx];

      // Check if agent core fields changed → baseline reset
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

  // Environment sync: when active persona's environment changes, sync to all
  const updatePersonaWithEnvSync = useCallback((idx: number, newPersona: PersonaData) => {
    setStates((prev) => {
      const next = [...prev];
      const old = next[idx];
      const envChanged = JSON.stringify(old.persona.environment) !== JSON.stringify(newPersona.environment);

      // Check baseline reset
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
        // Still sync environment to others
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

      // Sync environment to all other personas
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
      // Compute trend from delta
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

  // Batch simulate all checked personas
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

    // Run all checked personas in parallel
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

  // Agent positions for spatial map
  const agentPositions = useMemo(() => states.map((s) => s.agentPos), [states]);

  return (
    <div className="min-h-screen" style={{ background: "#F2E8D5" }}>
      {/* ---- Header ---- */}
      <header className="relative overflow-hidden" style={{ borderBottom: "4px solid #6B4C3B" }}>
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${HEADER_BG})`, opacity: 0.25 }} />
        <div className="absolute inset-0" style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(107,76,59,0.03) 2px, rgba(107,76,59,0.03) 4px)",
        }} />
        <div className="relative z-10 px-4 py-4 md:px-8 flex items-center justify-between">
          <div>
            <h1 className="font-pixel text-sm md:text-base leading-relaxed" style={{ color: "#6B4C3B" }}>
              Occupant Perception Map
            </h1>
            <p className="font-pixel text-[7px] md:text-[8px] mt-1 tracking-[2px]" style={{ color: "#A89B8C" }}>
              MULTI-AGENT ENVIRONMENTAL EXPERIENCE MODEL
            </p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="text-right hidden md:block mr-2">
              <div className="font-pixel-data text-sm" style={{ color: "#6B4C3B" }}>
                {current.persona.agent.id}
              </div>
              <div className="font-pixel text-[9px] mt-0.5" style={{
                color: current.experience.comfort_score > 0
                  ? (current.experience.trend === "declining" ? "#B85C38" : current.experience.trend === "rising" ? "#6B8E5A" : "#C4956A")
                  : "#A89B8C",
              }}>
                COMFORT {current.experience.comfort_score}/10
              </div>
            </div>
            <button className="pixel-btn" style={{ background: "#3D6B4F" }} onClick={exportJSON}>
              ↓ JSON
            </button>
            <button
              className="pixel-btn"
              onClick={batchSimulate}
              disabled={running}
              style={{ opacity: running ? 0.6 : 1 }}
            >
              {running ? "SIMULATING..." : "⟳ Simulate Response"}
            </button>
            <button
              className="pixel-btn"
              style={{ background: "#EDE3D0", padding: "6px 10px", color: "#6B4C3B" }}
              onClick={() => navigate("/settings")}
            >
              ⚙
            </button>
          </div>
        </div>
      </header>

      {/* ---- Persona Mind Map Section ---- */}
      <section className="relative">
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: `url(${WOOD_TEXTURE})`,
          backgroundSize: "250px 250px",
        }} />
        <div className="relative z-10 container py-6 md:py-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="font-pixel text-[10px] tracking-[1px] px-4 py-1.5" style={{
              background: "#3D6B4F", color: "#F2E8D5",
              border: "2px solid #6B4C3B", boxShadow: "2px 2px 0px #6B4C3B",
            }}>
              PERSONA MIND MAP
            </div>
            <div className="flex-1 h-px" style={{
              background: "repeating-linear-gradient(90deg, #6B4C3B 0px, #6B4C3B 4px, transparent 4px, transparent 8px)",
            }} />
            <span className="font-pixel text-[7px] tracking-wider" style={{ color: "#A89B8C" }}>
              CLICK VALUES TO EDIT
            </span>
          </div>

          {/* ---- Persona Tabs (3 personas) ---- */}
          <div className="flex items-center gap-2 mb-4">
            {states.map((s, i) => {
              const color = PERSONA_COLORS[i];
              const isActive = activeTab === i;
              return (
                <button
                  key={i}
                  onClick={() => setActiveTab(i)}
                  className="flex items-center gap-2 px-4 py-2 transition-all"
                  style={{
                    fontFamily: "var(--font-pixel)",
                    fontSize: "12px",
                    letterSpacing: "1px",
                    background: isActive ? color.primary : "#EDE3D0",
                    color: isActive ? "#F2E8D5" : color.primary,
                    border: `3px solid ${color.primary}`,
                    boxShadow: isActive ? `3px 3px 0px #6B4C3B` : "none",
                    transform: isActive ? "translateY(-2px)" : "none",
                  }}
                >
                  {/* Pixel avatar icon */}
                  <PixelAvatar index={i} size={20} />
                  <span>{s.persona.agent.id}</span>
                </button>
              );
            })}

            {/* Comparison View toggle */}
            <div className="flex-1" />
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="font-pixel text-[9px] px-3 py-1.5"
              style={{
                background: showComparison ? "#6B4C3B" : "#EDE3D0",
                color: showComparison ? "#F2E8D5" : "#6B4C3B",
                border: "2px solid #6B4C3B",
              }}
            >
              {showComparison ? "✕ CLOSE" : "◫ COMPARE"}
            </button>
          </div>

          {/* ---- Simulate Checkboxes ---- */}
          <div className="flex items-center gap-4 mb-4 px-1">
            <span className="font-pixel text-[8px] tracking-wider" style={{ color: "#A89B8C" }}>
              SIMULATE:
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
                  className="w-4 h-4 accent-current"
                  style={{ accentColor: PERSONA_COLORS[i].primary }}
                />
                <span className="font-pixel-data text-sm" style={{ color: PERSONA_COLORS[i].primary }}>
                  {s.persona.agent.id}
                </span>
              </label>
            ))}
          </div>

          {/* ---- Comparison View ---- */}
          {showComparison && (
            <ComparisonView states={states} />
          )}

          {/* ---- Active Persona Mind Map ---- */}
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
            />
          )}
        </div>
      </section>

      {/* ---- Vine Divider ---- */}
      <div className="w-full h-16 bg-repeat-x" style={{
        backgroundImage: `url(${VINE_DIVIDER})`,
        backgroundSize: "auto 64px",
      }} />

      {/* ---- Spatial Map Section ---- */}
      <section className="relative">
        <div className="container py-6 md:py-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="font-pixel text-[10px] tracking-[1px] px-4 py-1.5" style={{
              background: "#3D6B4F", color: "#F2E8D5",
              border: "2px solid #6B4C3B", boxShadow: "2px 2px 0px #6B4C3B",
            }}>
              SPATIAL MAP
            </div>
            <div className="flex-1 h-px" style={{
              background: "repeating-linear-gradient(90deg, #6B4C3B 0px, #6B4C3B 4px, transparent 4px, transparent 8px)",
            }} />
            <span className="font-pixel text-[7px] tracking-wider" style={{ color: "#A89B8C" }}>
              LEFT-CLICK TO PLACE AGENT #{activeTab + 1} · 20,000 × 20,000 mm
            </span>
          </div>

          <div className="flex justify-center">
            <SpatialMap
              shapes={shapes}
              agentPositions={agentPositions}
              activeAgentIdx={activeTab}
              onAgentPlace={(pos) => placeAgent(activeTab, pos)}
              onAgentRemove={(idx) => {
                setStates((prev) => prev.map((s, i) => i === idx ? { ...s, agentPos: null } : s));
              }}
            />
          </div>
        </div>
      </section>

      {/* ---- Vine Divider ---- */}
      <div className="w-full h-16 bg-repeat-x" style={{
        backgroundImage: `url(${VINE_DIVIDER})`,
        backgroundSize: "auto 64px",
      }} />

      {/* ---- Coordinate Input Section ---- */}
      <section className="relative">
        <div className="container py-6 md:py-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="font-pixel text-[10px] tracking-[1px] px-4 py-1.5" style={{
              background: "#3D6B4F", color: "#F2E8D5",
              border: "2px solid #6B4C3B", boxShadow: "2px 2px 0px #6B4C3B",
            }}>
              COORDINATE INPUT
            </div>
            <div className="flex-1 h-px" style={{
              background: "repeating-linear-gradient(90deg, #6B4C3B 0px, #6B4C3B 4px, transparent 4px, transparent 8px)",
            }} />
          </div>
          <div className="pixel-panel">
            <CoordinateInput onAddShape={addShape} onClearAll={clearAll} />
          </div>
        </div>
      </section>
    </div>
  );
}

// ---- Pixel Avatar Component ----
function PixelAvatar({ index, size = 20 }: { index: number; size?: number }) {
  const colors = PERSONA_COLORS[index];
  // Each avatar has distinct features: hat, glasses, backpack
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
      {/* Body */}
      <rect x="5" y="9" width="6" height="5" fill={colors.primary} />
      {/* Head */}
      <rect x="5" y="4" width="6" height="5" fill={colors.secondary} />
      {/* Eyes */}
      <rect x="6" y="6" width="2" height="1" fill="#F2E8D5" />
      <rect x="10" y="6" width="2" height="1" fill="#F2E8D5" />
      {/* Distinct features per persona */}
      {index === 0 && (
        <>
          {/* Hat */}
          <rect x="4" y="2" width="8" height="2" fill={colors.primary} />
          <rect x="3" y="3" width="10" height="1" fill={colors.primary} />
        </>
      )}
      {index === 1 && (
        <>
          {/* Glasses */}
          <rect x="5" y="5" width="3" height="3" fill="none" stroke="#F2E8D5" strokeWidth="0.5" />
          <rect x="9" y="5" width="3" height="3" fill="none" stroke="#F2E8D5" strokeWidth="0.5" />
          <rect x="8" y="6" width="1" height="1" fill="#F2E8D5" />
        </>
      )}
      {index === 2 && (
        <>
          {/* Backpack */}
          <rect x="11" y="8" width="3" height="5" fill={colors.primary} />
          <rect x="12" y="9" width="1" height="2" fill={colors.secondary} />
        </>
      )}
      {/* Legs */}
      <rect x="5" y="14" width="2" height="2" fill={colors.primary} />
      <rect x="9" y="14" width="2" height="2" fill={colors.primary} />
    </svg>
  );
}
