// ============================================================
// SentiArch v2 — Main Simulation Page
// Weather → Agent → Path → Simulate → Narrative → Compare
// ============================================================
import { useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// v2 modules
import {
  WEATHER_SCENARIOS, TIME_SLOTS,
  type WeatherScenario, type TimeSlot,
  SPACE_TAGS, type SpaceTag,
  type V2Agent, MBTI_TYPES, type AgentRole, type StudentStream, type MBTIType,
  createDefaultAgent, derivePreferredTemp, deriveClothingInsulation, isIntroverted, getNarrativeTone,
  type PathNode, type NodeMode, type OccupancyLevel,
  ACTIVITIES, createDefaultNode, getNodeAddress, getMetForActivity,
  runSimulation, type SimulationRunResult, type NodeResult, getSeverityFromPMV,
  generateAllNarratives, type NarrativeResult, type NodeNarrative, type DesignFlag,
  type DesignOption, generateComparison, type ComparisonResult, formatComparisonText,
} from "@/lib/v2";
import { getWeatherById, getTimeSlotById } from "@/lib/v2/weatherScenarios";

// ---- Types for UI state ----
type SimStep = "setup" | "path" | "results" | "compare";

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
      setStep("results");
      toast.success(`Simulation complete! Average PMV: ${result.avgPMV.toFixed(2)}, Rating: ${result.overallRating}`);
    } catch (err) {
      toast.error("Simulation failed: " + (err as Error).message);
    } finally {
      setIsSimulating(false);
    }
  }, [weather, timeSlot, pathNodes, agent, occupancy]);

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
  }, [agent, weatherId, timeSlotId, occupancy, pathNodes, simResult, narrativeResult, comparisonResult]);

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
          {(["setup", "path", "results", "compare"] as SimStep[]).map((s, i) => {
            const labels = ["1. Setup", "2. Path", "3. Results", "4. Compare"];
            const isActive = s === step;
            const isPast = (["setup", "path", "results", "compare"] as SimStep[]).indexOf(step) > i;
            return (
              <button
                key={s}
                onClick={() => setStep(s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: isActive ? "var(--foreground)" : isPast ? "var(--primary)" : "var(--card)",
                  color: isActive ? "var(--background)" : isPast ? "#fff" : "var(--muted-foreground)",
                  border: `1px solid ${isActive ? "var(--foreground)" : "var(--border)"}`,
                  opacity: isActive ? 1 : isPast ? 0.85 : 0.6,
                }}
              >
                {isPast && !isActive && <span>&#10003;</span>}
                {labels[i]}
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
            onBack={() => setStep("setup")}
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
            savedRuns={savedRuns}
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
                  {w.outdoor_temp}°C &middot; {w.humidity}% RH &middot; {w.wind_speed} m/s
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
          {/* Role */}
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

          {/* Stream (only for students) */}
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

          {/* Gender */}
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

          {/* Age */}
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

          {/* MBTI */}
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
                {preferredTemp}°C
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
                {/* Space Tag */}
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

                {/* Mode */}
                <select
                  value={node.mode}
                  onChange={e => updateNode(i, { mode: e.target.value as NodeMode })}
                  className="p-1.5 rounded text-xs"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                >
                  <option value="passing_through">Passing Through</option>
                  <option value="dwelling">Dwelling</option>
                </select>

                {/* Activity (dwelling only) */}
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
        <button className="sa-btn" onClick={onBack}>&larr; Back</button>
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
  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="sa-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Simulation Results
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded font-bold" style={{
              background: RATING_COLORS[simResult.overallRating] + "15",
              color: RATING_COLORS[simResult.overallRating],
              border: `1px solid ${RATING_COLORS[simResult.overallRating]}40`,
            }}>
              {simResult.overallRating}
            </span>
          </div>
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
                      {r.resolvedEnv.air_temp}°C
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
            Click "Generate Narratives" to create first-person experience descriptions using DeepSeek API.
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
  result, savedRuns, onBack, onClearRuns,
}: {
  result: ComparisonResult;
  savedRuns: SavedRun[];
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
        <button className="sa-btn sa-btn-danger text-xs" onClick={onClearRuns}>
          Clear All Saved Runs
        </button>
      </div>
    </div>
  );
}
