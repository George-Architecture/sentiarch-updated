// ============================================================
// Home Page - Occupant Perception Map
// Design: Pixel Architecture Art
// All 7 Advisor Feedbacks addressed:
//   #1: Intervention arrow mock-up in ENV. SATISFACTION panel
//   #2: PMV via pythermalcomfort-inspired Fanger model (ISO 7730)
//   #3: Perceptual load computed from parameters (not all zeros)
//   #4: Tab names larger font (13px vs 9px)
//   #5: "EXPERIENCE" → "ENV. SATISFACTION"
//   #6: Cleaned duplicate content (removed redundant ESFP, PERSONA, STABLE)
//   #7: "RUN LLM" → "Simulate Response"
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import PersonaMindMap from "@/components/PersonaMindMap";
import SpatialMap from "@/components/SpatialMap";
import CoordinateInput from "@/components/CoordinateInput";
import {
  type PersonaData,
  type ExperienceData,
  type AccumulatedState,
  type ComputedOutputs,
  type Shape,
  type AgentPosition,
  defaultPersona,
  defaultExperience,
  defaultAccumulatedState,
  defaultComputedOutputs,
  computeOutputs,
  computePerceptualLoad,
  computeSpatialFromAgent,
  posToCell,
  saveShapes,
  loadShapes,
  saveAgentPos,
  loadAgentPos,
  savePersona,
  loadPersona,
  getLLMConfig,
  callLLM,
} from "@/lib/store";

// CDN image URLs from original deployment
const HEADER_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663372089862/WRjHgs6LKvCyaEggYn3mGi/pixel-header-bg-CbXhGq7GagYN9FJRghcaKa.webp";
const VINE_DIVIDER = "https://d2xsxph8kpxj0f.cloudfront.net/310519663372089862/WRjHgs6LKvCyaEggYn3mGi/pixel-vine-divider-4N4gwetwgD8hXQoT9eAZit.webp";
const WOOD_TEXTURE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663372089862/WRjHgs6LKvCyaEggYn3mGi/pixel-wood-panel-gYASMJkw8fUFWAkd7LLpbp.webp";

export default function Home() {
  const [, navigate] = useLocation();

  // State
  const [shapes, setShapes] = useState<Shape[]>(() => loadShapes());
  const [agentPos, setAgentPos] = useState<AgentPosition | null>(() => loadAgentPos());
  const [persona, setPersona] = useState<PersonaData>(() => loadPersona() || defaultPersona);
  const [experience, setExperience] = useState<ExperienceData>(defaultExperience);
  const [accState, setAccState] = useState<AccumulatedState>(defaultAccumulatedState);
  const [computed, setComputed] = useState<ComputedOutputs>(defaultComputedOutputs);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [prevExperience, setPrevExperience] = useState<ExperienceData | null>(null);
  const [prevAccState, setPrevAccState] = useState<AccumulatedState | null>(null);

  // Persist
  useEffect(() => { saveShapes(shapes); }, [shapes]);
  useEffect(() => { if (agentPos) saveAgentPos(agentPos); }, [agentPos]);
  useEffect(() => { savePersona(persona); }, [persona]);

  // Recompute PMV/PPD when persona changes (Feedback #2)
  useEffect(() => {
    const c = computeOutputs(persona);
    setComputed(c);
  }, [persona]);

  // Recompute perceptual load when persona or computed changes (Feedback #3)
  useEffect(() => {
    const load = computePerceptualLoad(persona, computed);
    // Only update if no LLM result yet (don't overwrite LLM results)
    if (experience.comfort_score === 0) {
      setAccState(load);
    }
  }, [persona, computed, experience.comfort_score]);

  // Restore spatial from saved agent position
  useEffect(() => {
    const savedPos = loadAgentPos();
    const savedShapes = loadShapes();
    if (savedPos && savedShapes.length > 0) {
      const cell = posToCell(savedPos.x, savedPos.y);
      const savedPersona = loadPersona() || defaultPersona;
      const spatial = computeSpatialFromAgent(savedPos, savedShapes, savedPersona.spatial);
      setPersona((p) => ({
        ...p,
        position: { ...p.position, cell },
        spatial,
      }));
    }
  }, []);

  // Shape management
  const addShape = useCallback((shape: Shape) => {
    setShapes((s) => [...s, shape]);
  }, []);

  const clearAll = useCallback(() => {
    setShapes([]);
    setAgentPos(null);
    toast.info("Map cleared");
  }, []);

  // Agent placement
  const placeAgent = useCallback((pos: AgentPosition) => {
    setAgentPos(pos);
    const cell = posToCell(pos.x, pos.y);
    const spatial = computeSpatialFromAgent(pos, shapes, persona.spatial);
    setPersona((p) => ({
      ...p,
      position: { ...p.position, cell },
      spatial,
    }));
  }, [shapes, persona.spatial]);

  const updatePersona = useCallback((p: PersonaData) => {
    setPersona(p);
  }, []);

  // Feedback #7: "Simulate Response" (was "RUN LLM")
  const simulateResponse = async () => {
    if (!getLLMConfig()) {
      toast.error("Please configure API key first");
      navigate("/settings");
      return;
    }
    setRunning(true);
    toast.info("Running agent simulation...");
    const result = await callLLM(persona, computed, shapes);
    if (result) {
      setPrevExperience({ ...experience });
      setPrevAccState({ ...accState });
      // Bug Fix #2: Override LLM trend with computed trend based on comfort delta
      const prevScore = experience.comfort_score;
      const newScore = result.experience.comfort_score;
      let computedTrend: "rising" | "declining" | "stable" = "stable";
      if (prevScore > 0) {
        const delta = newScore - prevScore;
        if (delta > 0.5) computedTrend = "rising";
        else if (delta < -0.5) computedTrend = "declining";
        else computedTrend = "stable";
      }
      setExperience({ ...result.experience, trend: computedTrend });
      setAccState(result.accumulatedState);
      setTriggers(result.ruleTriggers);
      toast.success("Simulation complete!");
    } else {
      toast.error("Simulation failed. Check your API settings.");
    }
    setRunning(false);
  };

  // JSON export
  const exportJSON = () => {
    const data = {
      agent: persona.agent,
      position: persona.position,
      environment: persona.environment,
      spatial: persona.spatial,
      computed,
      accumulated_state: accState,
      rule_triggers: triggers,
      experience,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${persona.agent.id}_output.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON exported!");
  };

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
              AGENT-BASED ENVIRONMENTAL EXPERIENCE MODEL
            </p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {/* Feedback #6: Simplified header info - removed duplicate MBTI/trend */}
            <div className="text-right hidden md:block mr-2">
              <div className="font-pixel-data text-sm" style={{ color: "#6B4C3B" }}>
                {persona.agent.id}
              </div>
              <div className="font-pixel text-[9px] mt-0.5" style={{
                color: experience.trend === "declining" ? "#B85C38" : experience.trend === "rising" ? "#6B8E5A" : "#C4956A",
              }}>
                COMFORT {experience.comfort_score}/10
              </div>
            </div>
            <button className="pixel-btn" style={{ background: "#3D6B4F" }} onClick={exportJSON}>
              ↓ JSON
            </button>
            {/* Feedback #7: Renamed from "RUN LLM" to "Simulate Response" */}
            <button
              className="pixel-btn"
              onClick={simulateResponse}
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
              background: "#3D6B4F",
              color: "#F2E8D5",
              border: "2px solid #6B4C3B",
              boxShadow: "2px 2px 0px #6B4C3B",
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

          <PersonaMindMap
            persona={persona}
            experience={experience}
            accumulatedState={accState}
            computedOutputs={computed}
            ruleTriggers={triggers}
            prevExperience={prevExperience}
            prevAccumulatedState={prevAccState}
            onPersonaChange={updatePersona}
          />
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
              background: "#3D6B4F",
              color: "#F2E8D5",
              border: "2px solid #6B4C3B",
              boxShadow: "2px 2px 0px #6B4C3B",
            }}>
              SPATIAL MAP
            </div>
            <div className="flex-1 h-px" style={{
              background: "repeating-linear-gradient(90deg, #6B4C3B 0px, #6B4C3B 4px, transparent 4px, transparent 8px)",
            }} />
            <span className="font-pixel text-[7px] tracking-wider" style={{ color: "#A89B8C" }}>
              LEFT-CLICK TO PLACE AGENT · SPATIAL DATA AUTO-CALCULATED · 20,000 × 20,000 mm
            </span>
          </div>

          <div className="flex justify-center">
            <SpatialMap shapes={shapes} agentPosition={agentPos} onAgentPlace={placeAgent} />
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
              background: "#3D6B4F",
              color: "#F2E8D5",
              border: "2px solid #6B4C3B",
              boxShadow: "2px 2px 0px #6B4C3B",
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
