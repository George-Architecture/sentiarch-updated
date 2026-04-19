// ============================================================
// SentiArch v2 — Integrated Simulation Page
// Weather → Agent → Spatial Map → Path → Simulate → Narrative → Compare
// Combines v2 weather/agent/PMV/LLM system with Legacy spatial canvas
// ============================================================
import { useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// Legacy components
import SpatialMap from "@/components/SpatialMap";
import CoordinateInput from "@/components/CoordinateInput";

// Legacy store types & helpers
import {
  type Shape,
  type AgentPosition,
  type Zone,
  type ZoneEnv,
  type Waypoint,
  type HeatmapPoint,
  defaultZoneEnv,
} from "@/lib/store";

// v2 modules
import {
  WEATHER_SCENARIOS, TIME_SLOTS,
  type WeatherScenario, type TimeSlot,
  SPACE_TAGS, type SpaceTag,
  resolveEnvironment, type ResolvedEnv,
  type V2Agent, MBTI_TYPES, type AgentRole, type StudentStream, type MBTIType,
  createDefaultAgent, derivePreferredTemp, deriveClothingInsulation, getNarrativeTone,
  type PathNode, type NodeMode, type OccupancyLevel,
  ACTIVITIES, createDefaultNode,
  runSimulation, type SimulationRunResult, type NodeResult, getSeverityFromPMV,
  generateAllNarratives, type NarrativeResult,
  type DesignOption, generateComparison, type ComparisonResult,
} from "@/lib/v2";
import { getWeatherById, getTimeSlotById } from "@/lib/v2/weatherScenarios";

// ---- Types for UI state ----
type SimStep = "setup" | "spatial" | "path" | "results" | "compare";

interface SavedRun {
  id: string;
  label: string;
  simResult: SimulationRunResult;
  narrativeResult?: NarrativeResult;
}

// ---- Season color palette ----
const SEASON_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  spring: { bg: "#E8F5E9", border: "#66BB6A", text: "#2E7D32" },
  summer: { bg: "#FFF3E0", border: "#FFA726", text: "#E65100" },
  autumn: { bg: "#FBE9E7", border: "#FF7043", text: "#BF360C" },
  winter: { bg: "#E3F2FD", border: "#42A5F5", text: "#1565C0" },
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  INFO: { bg: "#E3F2FD", text: "#1565C0", border: "#42A5F5" },
  WARN: { bg: "#FFF8E1", text: "#F57F17", border: "#FFB300" },
  CRITICAL: { bg: "#FFEBEE", text: "#C62828", border: "#EF5350" },
};

const RATING_COLORS: Record<string, string> = {
  Comfortable: "#2E7D32",
  Marginal: "#F57F17",
  Poor: "#C62828",
};

/** Bridge: map v2 ResolvedEnv → Legacy ZoneEnv for SpatialMap zones */
function resolvedEnvToZoneEnv(env: ResolvedEnv): ZoneEnv {
  return {
    temperature: env.air_temp,
    humidity: env.humidity,
    light: env.lux,
    noise: env.noise_dB,
    air_velocity: env.air_velocity,
  };
}

// ============================================================
// Main Component
// ============================================================
export default function V2Simulation() {
  const [, navigate] = useLocation();

  // ---- Step state ----
  const [step, setStep] = useState<SimStep>("setup");

  // ---- Setup state ----
  const [weatherId, setWeatherId] = useState<string>("summer_sunny");
  const [timeSlotId, setTimeSlotId] = useState<string>("lunch");
  const [occupancy, setOccupancy] = useState<OccupancyLevel>("normal");
  const [agent, setAgent] = useState<V2Agent>(createDefaultAgent(0));

  // ---- Spatial state (Legacy integration) ----
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [spatialWaypoints, setSpatialWaypoints] = useState<Record<number, Waypoint[]>>({});
  const [agentPositions, setAgentPositions] = useState<(AgentPosition | null)[]>([null]);
  const [activeAgentIdx] = useState(0);
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // ---- Path state ----
  const [pathNodes, setPathNodes] = useState<PathNode[]>([createDefaultNode(0)]);

  // ---- Results state ----
  const [simResult, setSimResult] = useState<SimulationRunResult | null>(null);
  const [narrativeResult, setNarrativeResult] = useState<NarrativeResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [narrativeProgress, setNarrativeProgress] = useState({ done: 0, total: 0 });

  // ---- Compare state ----
  const [savedRuns, setSavedRuns] = useState<SavedRun[]>([]);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);

  // ---- Derived ----
  const weather = useMemo(() => getWeatherById(weatherId), [weatherId]);
  const timeSlot = useMemo(() => getTimeSlotById(timeSlotId), [timeSlotId]);
  const preferredTemp = useMemo(() => derivePreferredTemp(agent), [agent]);
  const clo = useMemo(
    () => weather ? deriveClothingInsulation(agent.role, weather.season) : 0.6,
    [agent.role, weather]
  );

  // ---- Spatial Callbacks ----
  const addShape = useCallback((shape: Shape) => {
    setShapes(prev => [...prev, shape]);
  }, []);

  const updateShapes = useCallback((newShapes: Shape[]) => {
    setShapes(newShapes);
  }, []);

  const deleteShape = useCallback((idx: number) => {
    setShapes(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const addZone = useCallback((zone: Zone) => {
    setZones(prev => [...prev, zone]);
  }, []);

  const updateZone = useCallback((id: string, updates: Partial<Zone>) => {
    setZones(prev => prev.map(z => z.id === id ? { ...z, ...updates } : z));
  }, []);

  const removeZone = useCallback((id: string) => {
    setZones(prev => prev.filter(z => z.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setShapes([]);
    setZones([]);
    setAgentPositions([null]);
    setSpatialWaypoints({});
    setHeatmapPoints([]);
    toast.info("Spatial map cleared");
  }, []);

  const placeAgent = useCallback((pos: AgentPosition) => {
    setAgentPositions([pos]);
  }, []);

  const addWaypoint = useCallback((agentIdx: number, wp: Waypoint) => {
    setSpatialWaypoints(prev => {
      const existing = prev[agentIdx] || [];
      return { ...prev, [agentIdx]: [...existing, wp] };
    });
  }, []);

  const removeWaypoint = useCallback((agentIdx: number, wpId: string) => {
    setSpatialWaypoints(prev => {
      const existing = prev[agentIdx] || [];
      return { ...prev, [agentIdx]: existing.filter(w => w.id !== wpId) };
    });
  }, []);

  /** Auto-derive zone environments from current weather + space tag */
  const autoDeriveSpatialEnv = useCallback(() => {
    if (!weather || !timeSlot) {
      toast.error("Please select weather and time slot first");
      return;
    }
    setZones(prev => prev.map(z => {
      const name = (z.label || z.id).toLowerCase();
      let tag: SpaceTag = "indoor_ac";
      if (name.includes("outdoor") || name.includes("court") || name.includes("field") || name.includes("playground")) {
        tag = "outdoor";
      } else if (name.includes("green") || name.includes("garden") || name.includes("landscape")) {
        tag = "green_space";
      } else if (name.includes("semi") || name.includes("corridor") || name.includes("covered") || name.includes("canopy") || name.includes("terrace") || name.includes("balcony")) {
        tag = "semi_outdoor";
      } else if (name.includes("natural") || name.includes("vent") || name.includes("atrium")) {
        tag = "indoor_natural";
      }
      const resolved = resolveEnvironment(tag, weather, timeSlot);
      return { ...z, env: resolvedEnvToZoneEnv(resolved) };
    }));
    toast.success("Zone environments auto-derived from weather scenario");
  }, [weather, timeSlot]);

  // ---- Path Node Management ----
  const addNode = useCallback(() => {
    setPathNodes(prev => [...prev, createDefaultNode(prev.length)]);
  }, []);

  const removeNode = useCallback((index: number) => {
    setPathNodes(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateNode = useCallback((index: number, updates: Partial<PathNode>) => {
    setPathNodes(prev => prev.map((n, i) => i === index ? { ...n, ...updates } : n));
  }, []);

  const moveNode = useCallback((index: number, direction: "up" | "down") => {
    setPathNodes(prev => {
      const next = [...prev];
      const targetIdx = direction === "up" ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      [next[index], next[targetIdx]] = [next[targetIdx], next[index]];
      return next;
    });
  }, []);

  // ---- Run Simulation ----
  const handleRunSimulation = useCallback(async () => {
    if (!weather || !timeSlot) {
      toast.error("Please select weather and time slot");
      return;
    }
    if (pathNodes.length === 0) {
      toast.error("Please add at least one path node");
      return;
    }

    setIsSimulating(true);
    try {
      const result = runSimulation(pathNodes, agent, weather, timeSlot, occupancy);
      setSimResult(result);
      setNarrativeResult(null);

      // Generate heatmap from simulation results if agent is placed
      const agentPos = agentPositions[0];
      if (agentPos) {
        const points: HeatmapPoint[] = result.nodeResults
          .filter(r => r.mode === "dwelling")
          .map((r, i) => ({
            x: agentPos.x + (i * 2000),
            y: agentPos.y,
            value: Math.abs(r.pmv) * 2,
            agentIdx: 0,
          }));
        setHeatmapPoints(points);
      }

      setStep("results");
      toast.success(`Simulation complete! Average PMV: ${result.avgPMV.toFixed(2)}, Rating: ${result.overallRating}`);
    } catch (err) {
      toast.error("Simulation failed: " + (err as Error).message);
    } finally {
      setIsSimulating(false);
    }
  }, [weather, timeSlot, pathNodes, agent, occupancy, agentPositions]);

  // ---- Generate Narratives ----
  const handleGenerateNarratives = useCallback(async () => {
    if (!simResult || !weather || !timeSlot) return;

    setIsGeneratingNarrative(true);
    setNarrativeProgress({ done: 0, total: simResult.nodeResults.length });

    try {
      const result = await generateAllNarratives(
        simResult, weather, timeSlot,
        (done, total) => setNarrativeProgress({ done, total })
      );
      setNarrativeResult(result);
      toast.success(`Generated ${result.nodeNarratives.length} narratives, ${result.designFlagSummary.length} design flags`);
    } catch (err) {
      toast.error("Narrative generation failed: " + (err as Error).message);
    } finally {
      setIsGeneratingNarrative(false);
    }
  }, [simResult, weather, timeSlot]);

  // ---- Save Run for Comparison ----
  const handleSaveRun = useCallback(() => {
    if (!simResult) return;
    const label = `${weather?.label || "?"} @ ${timeSlot?.label || "?"} — ${agent.role} (${agent.mbti})`;
    const run: SavedRun = {
      id: `run_${Date.now()}`,
      label,
      simResult,
      narrativeResult: narrativeResult || undefined,
    };
    setSavedRuns(prev => [...prev, run]);
    toast.success(`Saved as "${label}"`);
  }, [simResult, narrativeResult, weather, timeSlot, agent]);

  // ---- Run Comparison ----
  const handleCompare = useCallback(() => {
    if (savedRuns.length < 2) {
      toast.error("Need at least 2 saved runs to compare");
      return;
    }
    const options: DesignOption[] = savedRuns.map(r => ({
      id: r.id,
      label: r.label,
      simResult: r.simResult,
      narrativeResult: r.narrativeResult,
    }));
    const result = generateComparison(options);
    setComparisonResult(result);
    setStep("compare");
  }, [savedRuns]);

  // ---- Export JSON ----
  const handleExportJSON = useCallback(() => {
    const data = {
      agent,
      weather: weatherId,
      timeSlot: timeSlotId,
      occupancy,
      path: pathNodes,
      spatial: { shapes, zones },
      simulation: simResult,
      narratives: narrativeResult,
      comparison: comparisonResult,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sentiarch_v2_output.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON exported!");
  }, [agent, weatherId, timeSlotId, occupancy, pathNodes, shapes, zones, simResult, narrativeResult, comparisonResult]);

  // ---- Step labels ----
  const STEPS: { key: SimStep; label: string }[] = [
    { key: "setup", label: "1. Setup" },
    { key: "spatial", label: "2. Spatial" },
    { key: "path", label: "3. Path" },
    { key: "results", label: "4. Results" },
    { key: "compare", label: "5. Compare" },
  ];
  const stepKeys = STEPS.map(s => s.key);

  // ============================================================
  // RENDER
  // ============================================================
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
              SentiArch v2
            </h1>
            <p className="text-xs mt-0.5 tracking-wide" style={{ color: "var(--muted-foreground)" }}>
              Weather-Driven Occupant Experience Simulation
            </p>
          </div>
          <div className="flex items-center gap-2">
            {simResult && (
              <button className="sa-btn text-xs" onClick={handleExportJSON}>Export JSON</button>
            )}
            <button className="sa-btn text-xs" onClick={() => navigate("/settings")}>Settings</button>
            <button className="sa-btn text-xs" onClick={() => navigate("/")}>Home</button>
          </div>
        </div>
      </header>

      {/* ---- Step Navigation ---- */}
      <div className="container py-3">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const isActive = s.key === step;
            const isPast = stepKeys.indexOf(step) > i;
            return (
              <button
                key={s.key}
                onClick={() => setStep(s.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: isActive ? "var(--foreground)" : isPast ? "var(--primary)" : "var(--card)",
                  color: isActive ? "var(--background)" : isPast ? "#fff" : "var(--muted-foreground)",
                  border: `1px solid ${isActive ? "var(--foreground)" : "var(--border)"}`,
                  opacity: isActive ? 1 : isPast ? 0.85 : 0.6,
                }}
              >
                {isPast && !isActive && <span style={{ fontSize: "10px" }}>&#10003;</span>}
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Content ---- */}
      <div className="container py-4">
        {step === "setup" && (
          <SetupPanel
            weatherId={weatherId} setWeatherId={setWeatherId}
            timeSlotId={timeSlotId} setTimeSlotId={setTimeSlotId}
            occupancy={occupancy} setOccupancy={setOccupancy}
            agent={agent} setAgent={setAgent}
            preferredTemp={preferredTemp} clo={clo}
            onNext={() => setStep("spatial")}
          />
        )}

        {step === "spatial" && (
          <SpatialPanel
            shapes={shapes}
            zones={zones}
            agentPositions={agentPositions}
            activeAgentIdx={activeAgentIdx}
            waypoints={spatialWaypoints}
            showHeatmap={showHeatmap}
            heatmapPoints={heatmapPoints}
            onAgentPlace={placeAgent}
            onAddShape={addShape}
            onUpdateShapes={updateShapes}
            onDeleteShape={deleteShape}
            onAddZone={addZone}
            onUpdateZone={updateZone}
            onRemoveZone={removeZone}
            onClearAll={clearAll}
            onAddWaypoint={addWaypoint}
            onRemoveWaypoint={removeWaypoint}
            onToggleHeatmap={() => setShowHeatmap(h => !h)}
            onAutoDerive={autoDeriveSpatialEnv}
            weather={weather}
            timeSlot={timeSlot}
            onBack={() => setStep("setup")}
            onNext={() => setStep("path")}
          />
        )}

        {step === "path" && (
          <PathPanel
            nodes={pathNodes}
            addNode={addNode}
            removeNode={removeNode}
            updateNode={updateNode}
            moveNode={moveNode}
            onBack={() => setStep("spatial")}
            onRun={handleRunSimulation}
            isSimulating={isSimulating}
          />
        )}

        {step === "results" && simResult && (
          <ResultsPanel
            simResult={simResult}
            narrativeResult={narrativeResult}
            onGenerateNarratives={handleGenerateNarratives}
            isGeneratingNarrative={isGeneratingNarrative}
            narrativeProgress={narrativeProgress}
            onSaveRun={handleSaveRun}
            savedRunCount={savedRuns.length}
            onCompare={handleCompare}
            onBack={() => setStep("path")}
            weather={weather!}
            timeSlot={timeSlot!}
          />
        )}

        {step === "compare" && comparisonResult && (
          <ComparePanel
            result={comparisonResult}
            onBack={() => setStep("results")}
            onClearRuns={() => { setSavedRuns([]); setComparisonResult(null); setStep("results"); }}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-Components
// ============================================================

// ---- Setup Panel ----
function SetupPanel({
  weatherId, setWeatherId,
  timeSlotId, setTimeSlotId,
  occupancy, setOccupancy,
  agent, setAgent,
  preferredTemp, clo,
  onNext,
}: {
  weatherId: string; setWeatherId: (v: string) => void;
  timeSlotId: string; setTimeSlotId: (v: string) => void;
  occupancy: OccupancyLevel; setOccupancy: (v: OccupancyLevel) => void;
  agent: V2Agent; setAgent: (v: V2Agent) => void;
  preferredTemp: number; clo: number;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Weather Scenarios */}
      <div className="sa-card">
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>
          Weather Scenario
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {WEATHER_SCENARIOS.map(w => {
            const colors = SEASON_COLORS[w.season];
            const isSelected = w.id === weatherId;
            return (
              <button
                key={w.id}
                onClick={() => setWeatherId(w.id)}
                className="p-3 rounded-lg text-left transition-all text-xs"
                style={{
                  background: isSelected ? colors.bg : "var(--background)",
                  border: `2px solid ${isSelected ? colors.border : "var(--border)"}`,
                  boxShadow: isSelected ? `0 2px 8px ${colors.border}30` : "none",
                }}
              >
                <div className="font-semibold" style={{ color: isSelected ? colors.text : "var(--foreground)" }}>
                  {w.label}
                </div>
                <div className="mt-1" style={{ color: "var(--muted-foreground)" }}>
                  {w.outdoor_temp}&deg;C &middot; {w.humidity}% RH &middot; {w.wind_speed} m/s
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time of Day */}
      <div className="sa-card">
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>
          Time of Day
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {TIME_SLOTS.map(t => {
            const isSelected = t.id === timeSlotId;
            return (
              <button
                key={t.id}
                onClick={() => setTimeSlotId(t.id)}
                className="p-3 rounded-lg text-center transition-all text-xs"
                style={{
                  background: isSelected ? "var(--foreground)" : "var(--background)",
                  color: isSelected ? "var(--background)" : "var(--foreground)",
                  border: `2px solid ${isSelected ? "var(--foreground)" : "var(--border)"}`,
                }}
              >
                <div className="font-semibold">{t.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Occupancy */}
      <div className="sa-card">
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>
          Occupancy Level
        </h2>
        <div className="flex gap-2">
          {(["empty", "normal", "crowded"] as OccupancyLevel[]).map(o => {
            const isSelected = o === occupancy;
            return (
              <button
                key={o}
                onClick={() => setOccupancy(o)}
                className="flex-1 p-3 rounded-lg text-center transition-all text-xs font-medium capitalize"
                style={{
                  background: isSelected ? "var(--foreground)" : "var(--background)",
                  color: isSelected ? "var(--background)" : "var(--foreground)",
                  border: `2px solid ${isSelected ? "var(--foreground)" : "var(--border)"}`,
                }}
              >
                {o}
              </button>
            );
          })}
        </div>
      </div>

      {/* Agent Configuration */}
      <div className="sa-card">
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>
          Agent Configuration
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted-foreground)" }}>Role</label>
            <select
              value={agent.role}
              onChange={e => setAgent({ ...agent, role: e.target.value as AgentRole, stream: e.target.value === "student" ? agent.stream || "arts" : undefined })}
              className="w-full p-2 rounded-lg text-sm"
              style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="staff">Staff</option>
              <option value="visitor">Visitor</option>
            </select>
          </div>

          {agent.role === "student" && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted-foreground)" }}>Stream</label>
              <select
                value={agent.stream || "arts"}
                onChange={e => setAgent({ ...agent, stream: e.target.value as StudentStream })}
                className="w-full p-2 rounded-lg text-sm"
                style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              >
                <option value="sports">Sports</option>
                <option value="arts">Arts</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted-foreground)" }}>Gender</label>
            <div className="flex gap-2">
              {(["male", "female"] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setAgent({ ...agent, gender: g })}
                  className="flex-1 p-2 rounded-lg text-sm font-medium capitalize transition-all"
                  style={{
                    background: agent.gender === g ? "var(--foreground)" : "var(--background)",
                    color: agent.gender === g ? "var(--background)" : "var(--foreground)",
                    border: `1.5px solid ${agent.gender === g ? "var(--foreground)" : "var(--border)"}`,
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted-foreground)" }}>Age</label>
            <input
              type="number"
              min={1} max={100}
              value={agent.age}
              onChange={e => setAgent({ ...agent, age: Math.max(1, Math.min(100, parseInt(e.target.value) || 16)) })}
              className="w-full p-2 rounded-lg text-sm"
              style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }}
            />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted-foreground)" }}>MBTI</label>
            <select
              value={agent.mbti}
              onChange={e => setAgent({ ...agent, mbti: e.target.value as MBTIType })}
              className="w-full p-2 rounded-lg text-sm"
              style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }}
            >
              {MBTI_TYPES.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Derived Parameters */}
        <div className="mt-4 p-3 rounded-lg" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium mb-2" style={{ color: "var(--muted-foreground)" }}>Derived Parameters</div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <span style={{ color: "var(--muted-foreground)" }}>Preferred Temp: </span>
              <span className="font-bold" style={{ color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
                {preferredTemp}&deg;C
              </span>
            </div>
            <div>
              <span style={{ color: "var(--muted-foreground)" }}>Clothing: </span>
              <span className="font-bold" style={{ color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
                {clo} clo
              </span>
            </div>
            <div>
              <span style={{ color: "var(--muted-foreground)" }}>Tone: </span>
              <span className="font-bold" style={{ color: "var(--foreground)" }}>
                {getNarrativeTone(agent.mbti)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="sa-btn sa-btn-primary" onClick={onNext}>
          Next: Spatial Map &rarr;
        </button>
      </div>
    </div>
  );
}

// ---- Spatial Panel (Legacy Integration) ----
function SpatialPanel({
  shapes, zones, agentPositions, activeAgentIdx, waypoints,
  showHeatmap, heatmapPoints,
  onAgentPlace, onAddShape, onUpdateShapes, onDeleteShape,
  onAddZone, onUpdateZone, onRemoveZone, onClearAll,
  onAddWaypoint, onRemoveWaypoint,
  onToggleHeatmap, onAutoDerive,
  weather, timeSlot,
  onBack, onNext,
}: {
  shapes: Shape[];
  zones: Zone[];
  agentPositions: (AgentPosition | null)[];
  activeAgentIdx: number;
  waypoints: Record<number, Waypoint[]>;
  showHeatmap: boolean;
  heatmapPoints: HeatmapPoint[];
  onAgentPlace: (pos: AgentPosition) => void;
  onAddShape: (shape: Shape) => void;
  onUpdateShapes: (shapes: Shape[]) => void;
  onDeleteShape: (idx: number) => void;
  onAddZone: (zone: Zone) => void;
  onUpdateZone: (id: string, updates: Partial<Zone>) => void;
  onRemoveZone: (id: string) => void;
  onClearAll: () => void;
  onAddWaypoint: (agentIdx: number, wp: Waypoint) => void;
  onRemoveWaypoint: (agentIdx: number, wpId: string) => void;
  onToggleHeatmap: () => void;
  onAutoDerive: () => void;
  weather: WeatherScenario | undefined;
  timeSlot: TimeSlot | undefined;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Spatial Map Canvas */}
      <div className="sa-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Spatial Map
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Click to place agent &middot; Use toolbar for shapes/zones/waypoints
            </span>
            <button
              onClick={onToggleHeatmap}
              className="sa-btn text-xs px-3 py-1"
              style={{
                background: showHeatmap ? "#D94F4F" : "var(--card)",
                color: showHeatmap ? "#fff" : "var(--foreground)",
                borderColor: showHeatmap ? "#D94F4F" : "var(--border)",
              }}
            >
              {showHeatmap ? "Hide Heatmap" : "Stress Heatmap"}
            </button>
            <button
              onClick={onClearAll}
              className="sa-btn text-xs px-3 py-1"
              style={{ background: "#FFEBEE", color: "#C62828", borderColor: "#EF535040" }}
            >
              Clear All
            </button>
          </div>
        </div>

        <SpatialMap
          shapes={shapes}
          zones={zones}
          agentPositions={agentPositions}
          activeAgentIdx={activeAgentIdx}
          onAgentPlace={onAgentPlace}
          onAddShape={onAddShape}
          onAddZone={onAddZone}
          onUpdateShapes={onUpdateShapes}
          onDeleteShape={onDeleteShape}
          allWaypoints={waypoints}
          onAddWaypoint={onAddWaypoint}
          onRemoveWaypoint={onRemoveWaypoint}
          heatmapPoints={heatmapPoints}
          showHeatmap={showHeatmap}
        />
      </div>

      {/* Zone Environment Controls */}
      <div className="sa-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Zone Environment
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onAutoDerive}
              className="sa-btn sa-btn-primary text-xs"
              disabled={!weather || !timeSlot}
              style={{ opacity: (!weather || !timeSlot) ? 0.5 : 1 }}
            >
              Auto-Derive from Weather
            </button>
          </div>
        </div>

        {weather && timeSlot && (
          <div className="mb-4 p-3 rounded-lg text-xs" style={{
            background: SEASON_COLORS[weather.season]?.bg || "var(--background)",
            border: `1px solid ${SEASON_COLORS[weather.season]?.border || "var(--border)"}`,
          }}>
            <span className="font-semibold" style={{ color: SEASON_COLORS[weather.season]?.text || "var(--foreground)" }}>
              Active: {weather.label} @ {timeSlot.label}
            </span>
            <span style={{ color: "var(--muted-foreground)" }}>
              {" "}&middot; {weather.outdoor_temp}&deg;C &middot; {weather.humidity}% RH &middot; {weather.wind_speed} m/s
            </span>
          </div>
        )}

        {zones.length > 0 ? (
          <div className="space-y-2">
            {zones.map(z => (
              <div key={z.id} className="p-3 rounded-lg flex items-center gap-3" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
                <div className="w-3 h-3 rounded" style={{ background: "#888" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                  {z.label || z.id}
                </span>
                <div className="flex-1" />
                <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {z.env.temperature}&deg;C &middot; {z.env.humidity}% &middot; {z.env.light} lux &middot; {z.env.noise} dB &middot; {z.env.air_velocity} m/s
                </span>
                <button
                  onClick={() => onRemoveZone(z.id)}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ background: "#FFEBEE", color: "#C62828" }}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            No zones defined yet. Draw boundaries on the spatial map or use Coordinate Input below to create zones.
            Zones will auto-receive environment parameters from the weather scenario.
          </p>
        )}
      </div>

      {/* Coordinate Input (Legacy) */}
      <div className="sa-card">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Coordinate Input &amp; Zone Editor
          </h2>
        </div>
        <CoordinateInput
          onAddShape={onAddShape}
          onClearAll={onClearAll}
          zones={zones}
          onAddZone={onAddZone}
          onUpdateZone={onUpdateZone}
          onRemoveZone={onRemoveZone}
        />
      </div>

      <div className="flex justify-between">
        <button className="sa-btn" onClick={onBack}>&larr; Back to Setup</button>
        <button className="sa-btn sa-btn-primary" onClick={onNext}>
          Next: Define Path &rarr;
        </button>
      </div>
    </div>
  );
}

// ---- Path Panel ----
function PathPanel({
  nodes, addNode, removeNode, updateNode, moveNode,
  onBack, onRun, isSimulating,
}: {
  nodes: PathNode[];
  addNode: () => void;
  removeNode: (i: number) => void;
  updateNode: (i: number, u: Partial<PathNode>) => void;
  moveNode: (i: number, d: "up" | "down") => void;
  onBack: () => void;
  onRun: () => void;
  isSimulating: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="sa-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Wayfinding Path ({nodes.length} nodes)
          </h2>
          <button className="sa-btn text-xs" onClick={addNode}>+ Add Node</button>
        </div>

        <div className="space-y-3">
          {nodes.map((node, i) => (
            <div key={node.id} className="p-3 rounded-lg" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{
                  background: "var(--foreground)", color: "var(--background)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {i + 1}
                </span>
                <div className="flex-1" />
                <button className="text-xs px-1" onClick={() => moveNode(i, "up")} disabled={i === 0}
                  style={{ opacity: i === 0 ? 0.3 : 1, color: "var(--muted-foreground)" }}>&#9650;</button>
                <button className="text-xs px-1" onClick={() => moveNode(i, "down")} disabled={i === nodes.length - 1}
                  style={{ opacity: i === nodes.length - 1 ? 0.3 : 1, color: "var(--muted-foreground)" }}>&#9660;</button>
                {nodes.length > 1 && (
                  <button className="text-xs px-2 py-0.5 rounded" onClick={() => removeNode(i)}
                    style={{ background: "#FFEBEE", color: "#C62828" }}>Remove</button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-2">
                <input
                  placeholder="Zone (e.g., Senior Secondary)"
                  value={node.zone}
                  onChange={e => updateNode(i, { zone: e.target.value })}
                  className="p-1.5 rounded text-xs"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                />
                <input
                  placeholder="Floor (e.g., 4F)"
                  value={node.floor}
                  onChange={e => updateNode(i, { floor: e.target.value })}
                  className="p-1.5 rounded text-xs"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                />
                <input
                  placeholder="Program (e.g., Computer Room)"
                  value={node.program}
                  onChange={e => updateNode(i, { program: e.target.value })}
                  className="p-1.5 rounded text-xs"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                <select
                  value={node.spaceTag}
                  onChange={e => updateNode(i, { spaceTag: e.target.value as SpaceTag })}
                  className="p-1.5 rounded text-xs"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                >
                  {SPACE_TAGS.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>

                <select
                  value={node.mode}
                  onChange={e => updateNode(i, { mode: e.target.value as NodeMode })}
                  className="p-1.5 rounded text-xs"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                >
                  <option value="passing_through">Passing Through</option>
                  <option value="dwelling">Dwelling</option>
                </select>

                {node.mode === "dwelling" && (
                  <>
                    <select
                      value={node.activityId || "attending_class"}
                      onChange={e => updateNode(i, { activityId: e.target.value })}
                      className="p-1.5 rounded text-xs"
                      style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                    >
                      {ACTIVITIES.map(a => (
                        <option key={a.id} value={a.id}>{a.label} (MET {a.met})</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1} max={240}
                        value={node.duration_minutes || 30}
                        onChange={e => updateNode(i, { duration_minutes: parseInt(e.target.value) || 30 })}
                        className="w-full p-1.5 rounded text-xs"
                        style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }}
                      />
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>min</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button className="sa-btn" onClick={onBack}>&larr; Back to Spatial</button>
        <button
          className="sa-btn sa-btn-primary"
          onClick={onRun}
          disabled={isSimulating}
          style={{ opacity: isSimulating ? 0.6 : 1 }}
        >
          {isSimulating ? "Simulating..." : "Run Simulation"}
        </button>
      </div>
    </div>
  );
}

// ---- Results Panel ----
function ResultsPanel({
  simResult, narrativeResult,
  onGenerateNarratives, isGeneratingNarrative, narrativeProgress,
  onSaveRun, savedRunCount, onCompare,
  onBack, weather, timeSlot,
}: {
  simResult: SimulationRunResult;
  narrativeResult: NarrativeResult | null;
  onGenerateNarratives: () => void;
  isGeneratingNarrative: boolean;
  narrativeProgress: { done: number; total: number };
  onSaveRun: () => void;
  savedRunCount: number;
  onCompare: () => void;
  onBack: () => void;
  weather: WeatherScenario;
  timeSlot: TimeSlot;
}) {
  // Compute Thermal Equity Score (thesis core metric)
  const thermalEquityScore = useMemo(() => {
    const dwellingResults = simResult.nodeResults.filter(r => r.mode === "dwelling");
    if (dwellingResults.length === 0) return 100;
    const absPMVs = dwellingResults.map(r => Math.abs(r.pmv));
    const meanAbsPMV = absPMVs.reduce((s, v) => s + v, 0) / absPMVs.length;
    const variance = absPMVs.reduce((s, v) => s + (v - meanAbsPMV) ** 2, 0) / absPMVs.length;
    const stdDev = Math.sqrt(variance);
    const score = Math.max(0, Math.min(100,
      100 - (meanAbsPMV * 20) - (stdDev * 10) - (simResult.criticalCount * 15)
    ));
    return Math.round(score);
  }, [simResult]);

  const tesColor = thermalEquityScore >= 70 ? "#2E7D32" : thermalEquityScore >= 40 ? "#F57F17" : "#C62828";

  return (
    <div className="space-y-4">
      {/* Thermal Equity Score */}
      <div className="sa-card" style={{
        background: `${tesColor}08`,
        border: `2px solid ${tesColor}30`,
      }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>
              Thermal Equity Score
            </h2>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Composite metric: mean |PMV| deviation, variance across spaces, and critical zone count
            </p>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold" style={{
              color: tesColor,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {thermalEquityScore}
            </div>
            <div className="text-xs font-medium" style={{ color: tesColor }}>/ 100</div>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="sa-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Simulation Results
          </h2>
          <span className="text-xs px-2 py-1 rounded font-bold" style={{
            background: RATING_COLORS[simResult.overallRating] + "15",
            color: RATING_COLORS[simResult.overallRating],
            border: `1px solid ${RATING_COLORS[simResult.overallRating]}40`,
          }}>
            {simResult.overallRating}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="text-center p-3 rounded-lg" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Avg PMV</div>
            <div className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--foreground)" }}>
              {simResult.avgPMV.toFixed(2)}
            </div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Avg PPD</div>
            <div className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--foreground)" }}>
              {simResult.avgPPD.toFixed(1)}%
            </div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: "#FFF8E1", border: "1px solid #FFB30040" }}>
            <div className="text-xs" style={{ color: "#F57F17" }}>WARN</div>
            <div className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F57F17" }}>
              {simResult.warnCount}
            </div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: "#FFEBEE", border: "1px solid #EF535040" }}>
            <div className="text-xs" style={{ color: "#C62828" }}>CRITICAL</div>
            <div className="text-lg font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#C62828" }}>
              {simResult.criticalCount}
            </div>
          </div>
        </div>

        {/* Per-Node Results Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th className="text-left p-2" style={{ color: "var(--muted-foreground)" }}>#</th>
                <th className="text-left p-2" style={{ color: "var(--muted-foreground)" }}>Space</th>
                <th className="text-left p-2" style={{ color: "var(--muted-foreground)" }}>Tag</th>
                <th className="text-left p-2" style={{ color: "var(--muted-foreground)" }}>Mode</th>
                <th className="text-right p-2" style={{ color: "var(--muted-foreground)" }}>Temp</th>
                <th className="text-right p-2" style={{ color: "var(--muted-foreground)" }}>MRT</th>
                <th className="text-right p-2" style={{ color: "var(--muted-foreground)" }}>PMV</th>
                <th className="text-right p-2" style={{ color: "var(--muted-foreground)" }}>PPD</th>
                <th className="text-center p-2" style={{ color: "var(--muted-foreground)" }}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {simResult.nodeResults.map((r, i) => {
                const severity = getSeverityFromPMV(r.pmv);
                const sevColor = SEVERITY_COLORS[severity];
                return (
                  <tr key={r.nodeId} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="p-2 font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{i + 1}</td>
                    <td className="p-2">{r.nodeAddress}</td>
                    <td className="p-2">
                      <span className="px-1.5 py-0.5 rounded" style={{ background: "var(--background)", fontSize: "10px" }}>
                        {r.spaceTag}
                      </span>
                    </td>
                    <td className="p-2 capitalize">{r.mode.replace("_", " ")}</td>
                    <td className="p-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {r.resolvedEnv.air_temp}&deg;C
                    </td>
                    <td className="p-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {r.resolvedEnv.mean_radiant_temp}&deg;C
                    </td>
                    <td className="p-2 text-right font-bold" style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      color: sevColor.text,
                    }}>
                      {r.pmv.toFixed(2)}
                    </td>
                    <td className="p-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {r.ppd.toFixed(1)}%
                    </td>
                    <td className="p-2 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{
                        background: sevColor.bg,
                        color: sevColor.text,
                        border: `1px solid ${sevColor.border}40`,
                      }}>
                        {severity}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PMV Distribution Visualization */}
      <div className="sa-card">
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>
          PMV Distribution Along Path
        </h2>
        <div className="flex items-end gap-1" style={{ height: "120px" }}>
          {simResult.nodeResults.map((r, i) => {
            const severity = getSeverityFromPMV(r.pmv);
            const sevColor = SEVERITY_COLORS[severity];
            const barHeight = Math.min(100, Math.max(10, Math.abs(r.pmv) * 30 + 10));
            return (
              <div key={r.nodeId} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px]" style={{ color: sevColor.text, fontFamily: "'JetBrains Mono', monospace" }}>
                  {r.pmv.toFixed(1)}
                </span>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${barHeight}%`,
                    background: sevColor.text + "40",
                    border: `1px solid ${sevColor.border}60`,
                    minWidth: "12px",
                  }}
                />
                <span className="text-[8px] text-center" style={{ color: "var(--muted-foreground)", lineHeight: "1.1" }}>
                  {i + 1}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-4 mt-3">
          {(["INFO", "WARN", "CRITICAL"] as const).map(s => (
            <div key={s} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ background: SEVERITY_COLORS[s].text + "40", border: `1px solid ${SEVERITY_COLORS[s].border}60` }} />
              <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Narrative Section */}
      <div className="sa-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            LLM Narratives
          </h2>
          {!narrativeResult && (
            <button
              className="sa-btn sa-btn-primary text-xs"
              onClick={onGenerateNarratives}
              disabled={isGeneratingNarrative}
              style={{ opacity: isGeneratingNarrative ? 0.6 : 1 }}
            >
              {isGeneratingNarrative
                ? `Generating... (${narrativeProgress.done}/${narrativeProgress.total})`
                : "Generate Narratives (DeepSeek)"}
            </button>
          )}
        </div>

        {narrativeResult ? (
          <div className="space-y-3">
            {narrativeResult.nodeNarratives.map((nn, i) => {
              const sevColor = nn.severity ? SEVERITY_COLORS[nn.severity] : null;
              return (
                <div key={nn.nodeId} className="p-3 rounded-lg" style={{
                  background: sevColor ? sevColor.bg + "40" : "var(--background)",
                  border: `1px solid ${sevColor ? sevColor.border + "40" : "var(--border)"}`,
                }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      Node {i + 1}
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {nn.nodeAddress}
                    </span>
                    <span className="text-xs capitalize px-1.5 py-0.5 rounded" style={{
                      background: "var(--background)", color: "var(--muted-foreground)",
                    }}>
                      {nn.mode.replace("_", " ")}
                    </span>
                    {nn.severity && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                        background: SEVERITY_COLORS[nn.severity].bg,
                        color: SEVERITY_COLORS[nn.severity].text,
                      }}>
                        {nn.severity}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
                    {nn.narrative}
                  </p>
                </div>
              );
            })}

            {/* Design Flag Summary */}
            {narrativeResult.designFlagSummary.length > 0 && (
              <div className="mt-4 p-4 rounded-lg" style={{ background: "#FFF8E1", border: "1px solid #FFB30040" }}>
                <h3 className="text-xs font-bold mb-3" style={{ color: "#F57F17" }}>
                  Design Flag Summary ({narrativeResult.designFlagSummary.length} flags)
                </h3>
                <div className="space-y-2">
                  {narrativeResult.designFlagSummary.map((flag, i) => {
                    const fc = SEVERITY_COLORS[flag.severity];
                    return (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="px-1.5 py-0.5 rounded font-bold shrink-0" style={{
                          background: fc.bg, color: fc.text, border: `1px solid ${fc.border}40`,
                        }}>
                          {flag.severity}
                        </span>
                        <span style={{ color: "var(--muted-foreground)" }}>{flag.nodeAddress}:</span>
                        <span style={{ color: "var(--foreground)" }}>{flag.description}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Click &quot;Generate Narratives&quot; to create first-person experience descriptions using DeepSeek API.
            Requires API key configured in Settings.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button className="sa-btn" onClick={onBack}>&larr; Back to Path</button>
        <div className="flex items-center gap-2">
          <button className="sa-btn text-xs" onClick={onSaveRun}>
            Save Run ({savedRunCount} saved)
          </button>
          {savedRunCount >= 2 && (
            <button className="sa-btn sa-btn-primary text-xs" onClick={onCompare}>
              Compare {savedRunCount} Runs
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Compare Panel ----
function ComparePanel({
  result, onBack, onClearRuns,
}: {
  result: ComparisonResult;
  onBack: () => void;
  onClearRuns: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="sa-card">
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>
          Cross-Option Comparison ({result.rows.length} options)
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th className="text-left p-2" style={{ color: "var(--muted-foreground)" }}>Option</th>
                <th className="text-right p-2" style={{ color: "var(--muted-foreground)" }}>Avg PMV</th>
                <th className="text-right p-2" style={{ color: "var(--muted-foreground)" }}>Avg PPD</th>
                <th className="text-right p-2" style={{ color: "var(--muted-foreground)" }}>WARN</th>
                <th className="text-right p-2" style={{ color: "var(--muted-foreground)" }}>CRITICAL</th>
                <th className="text-center p-2" style={{ color: "var(--muted-foreground)" }}>Rating</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map(row => {
                const isBest = row.optionId === result.bestOptionId;
                const isWorst = row.optionId === result.worstOptionId;
                return (
                  <tr key={row.optionId} style={{
                    borderBottom: "1px solid var(--border)",
                    background: isBest ? "#E8F5E920" : isWorst ? "#FFEBEE20" : "transparent",
                  }}>
                    <td className="p-2">
                      {row.optionLabel}
                      {isBest && <span className="ml-1 text-[10px] font-bold" style={{ color: "#2E7D32" }}>(Best)</span>}
                      {isWorst && result.rows.length > 1 && <span className="ml-1 text-[10px] font-bold" style={{ color: "#C62828" }}>(Worst)</span>}
                    </td>
                    <td className="p-2 text-right font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {row.avgPMV.toFixed(2)}
                    </td>
                    <td className="p-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {row.avgPPD.toFixed(1)}%
                    </td>
                    <td className="p-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace", color: row.warnCount > 0 ? "#F57F17" : "var(--muted-foreground)" }}>
                      {row.warnCount}
                    </td>
                    <td className="p-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace", color: row.criticalCount > 0 ? "#C62828" : "var(--muted-foreground)" }}>
                      {row.criticalCount}
                    </td>
                    <td className="p-2 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{
                        color: RATING_COLORS[row.overallRating],
                        background: RATING_COLORS[row.overallRating] + "15",
                      }}>
                        {row.overallRating}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Design Flags across all options */}
      {result.allFlags.some(f => f.flags.length > 0) && (
        <div className="sa-card">
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>
            Design Flags Across All Options
          </h2>
          <div className="space-y-4">
            {result.allFlags.filter(f => f.flags.length > 0).map((group, gi) => (
              <div key={gi}>
                <div className="text-xs font-bold mb-2" style={{ color: "var(--foreground)" }}>
                  {group.optionLabel}
                </div>
                <div className="space-y-1">
                  {group.flags.map((flag, fi) => {
                    const fc = SEVERITY_COLORS[flag.severity];
                    return (
                      <div key={fi} className="flex items-start gap-2 text-xs pl-3">
                        <span className="px-1.5 py-0.5 rounded font-bold shrink-0" style={{
                          background: fc.bg, color: fc.text, border: `1px solid ${fc.border}40`,
                        }}>
                          {flag.severity}
                        </span>
                        <span style={{ color: "var(--muted-foreground)" }}>{flag.nodeAddress}:</span>
                        <span style={{ color: "var(--foreground)" }}>{flag.description}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button className="sa-btn" onClick={onBack}>&larr; Back to Results</button>
        <button className="sa-btn text-xs" onClick={onClearRuns}
          style={{ background: "#FFEBEE", color: "#C62828", borderColor: "#EF535040" }}>
          Clear All Saved Runs
        </button>
      </div>
    </div>
  );
}
