// ============================================================
// SentiArch v2 — Integrated Single-Page Simulation
// All panels visible on one page: Setup | Spatial+Waypoints | Results | Compare
// Fixes: auto-zone, auto-env, multi-agent, unified waypoint-path, comparison
// ============================================================
import { useState, useCallback, useMemo, useEffect } from "react";
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
  getPersonaColor,
} from "@/lib/store";

// Auto-zone detection
import { generateAutoZones } from "@/lib/autoZone";

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

// ---- Types ----
interface SavedRun {
  id: string;
  label: string;
  agents: V2Agent[];
  weatherId: string;
  timeSlotId: string;
  simResults: { agent: V2Agent; result: SimulationRunResult }[];
  narrativeResults: { agentId: string; result: NarrativeResult }[];
}

// ---- Color constants ----
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

/** Bridge: v2 ResolvedEnv → Legacy ZoneEnv */
function resolvedEnvToZoneEnv(env: ResolvedEnv): ZoneEnv {
  return {
    temperature: env.air_temp,
    humidity: env.humidity,
    light: env.lux,
    noise: env.noise_dB,
    air_velocity: env.air_velocity,
  };
}

/** Infer space tag from zone label */
function inferSpaceTag(label: string): SpaceTag {
  const l = label.toLowerCase();
  if (l.includes("outdoor") || l.includes("court") || l.includes("field") || l.includes("playground")) return "outdoor";
  if (l.includes("green") || l.includes("garden") || l.includes("landscape")) return "green_space";
  if (l.includes("semi") || l.includes("corridor") || l.includes("covered") || l.includes("canopy") || l.includes("terrace") || l.includes("balcony")) return "semi_outdoor";
  if (l.includes("natural") || l.includes("vent") || l.includes("atrium")) return "indoor_natural";
  return "indoor_ac";
}

/** Generate path nodes from waypoints */
function waypointsToPathNodes(waypoints: Waypoint[], zoneName: string): PathNode[] {
  const nodes: PathNode[] = [];
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    // Add passing-through node between waypoints
    if (i > 0) {
      nodes.push({
        id: `pass_${wp.id}`,
        zone: zoneName,
        floor: "",
        program: `Transit to ${wp.label}`,
        spaceTag: "semi_outdoor",
        mode: "passing_through",
      });
    }
    // Add dwelling node for each waypoint
    nodes.push({
      id: `dwell_${wp.id}`,
      zone: zoneName,
      floor: "",
      program: wp.label,
      spaceTag: "indoor_ac",
      mode: "dwelling",
      activityId: "attending_class",
      duration_minutes: wp.dwell_minutes || 30,
    });
  }
  return nodes;
}

// ============================================================
// Main Component
// ============================================================
export default function V2Simulation() {
  const [, navigate] = useLocation();

  // ---- Collapsible sections ----
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  // ---- Weather & Time ----
  const [weatherId, setWeatherId] = useState<string>("summer_sunny");
  const [timeSlotId, setTimeSlotId] = useState<string>("lunch");
  const [occupancy, setOccupancy] = useState<OccupancyLevel>("normal");

  // ---- Multi-Agent ----
  const [agents, setAgents] = useState<V2Agent[]>([createDefaultAgent(0)]);
  const [activeAgentIdx, setActiveAgentIdx] = useState(0);

  // ---- Spatial ----
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneSpaceTags, setZoneSpaceTags] = useState<Record<string, SpaceTag>>({});
  const [agentPositions, setAgentPositions] = useState<(AgentPosition | null)[]>([null]);
  const [allWaypoints, setAllWaypoints] = useState<Record<number, Waypoint[]>>({});
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // ---- Path (auto-generated from waypoints + manual override) ----
  const [pathNodes, setPathNodes] = useState<PathNode[]>([]);
  const [pathManualOverride, setPathManualOverride] = useState(false);

  // ---- Results ----
  const [simResults, setSimResults] = useState<{ agent: V2Agent; result: SimulationRunResult }[]>([]);
  const [narrativeResults, setNarrativeResults] = useState<{ agentId: string; result: NarrativeResult }[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);

  // ---- Compare ----
  const [savedRuns, setSavedRuns] = useState<SavedRun[]>([]);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);

  // ---- Derived ----
  const weather = useMemo(() => getWeatherById(weatherId), [weatherId]);
  const timeSlot = useMemo(() => getTimeSlotById(timeSlotId), [timeSlotId]);

  // ---- Auto-derive zone env when weather/time/zones/spaceTags change ----
  useEffect(() => {
    if (!weather || !timeSlot || zones.length === 0) return;
    setZones(prev => prev.map(z => {
      const tag = zoneSpaceTags[z.id] || inferSpaceTag(z.label || z.id);
      const resolved = resolveEnvironment(tag, weather, timeSlot);
      return { ...z, env: resolvedEnvToZoneEnv(resolved) };
    }));
  }, [weatherId, timeSlotId, zoneSpaceTags]);
  // Note: we intentionally don't include zones in deps to avoid infinite loop

  // ---- Auto-generate path from active agent's waypoints ----
  useEffect(() => {
    if (pathManualOverride) return;
    const wps = allWaypoints[activeAgentIdx] || [];
    if (wps.length === 0) {
      setPathNodes([]);
      return;
    }
    const nodes = waypointsToPathNodes(wps, "Campus");
    setPathNodes(nodes);
  }, [allWaypoints, activeAgentIdx, pathManualOverride]);

  // ---- Shape handlers with auto-zone ----
  const addShape = useCallback((shape: Shape) => {
    setShapes(prev => {
      const next = [...prev, shape];
      if (shape.type === "boundary") {
        setTimeout(() => {
          setZones(prevZones => {
            const autoZones = generateAutoZones(next, prevZones);
            // Auto-derive env for new zones
            if (weather && timeSlot) {
              return autoZones.map(z => {
                const tag = zoneSpaceTags[z.id] || inferSpaceTag(z.label || z.id);
                const resolved = resolveEnvironment(tag, weather, timeSlot);
                return { ...z, env: resolvedEnvToZoneEnv(resolved) };
              });
            }
            return autoZones;
          });
        }, 0);
      }
      return next;
    });
  }, [weather, timeSlot, zoneSpaceTags]);

  const updateShapes = useCallback((newShapes: Shape[]) => {
    setShapes(newShapes);
    setTimeout(() => {
      setZones(prevZones => {
        const autoZones = generateAutoZones(newShapes, prevZones);
        if (weather && timeSlot) {
          return autoZones.map(z => {
            const tag = zoneSpaceTags[z.id] || inferSpaceTag(z.label || z.id);
            const resolved = resolveEnvironment(tag, weather, timeSlot);
            return { ...z, env: resolvedEnvToZoneEnv(resolved) };
          });
        }
        return autoZones;
      });
    }, 0);
  }, [weather, timeSlot, zoneSpaceTags]);

  const deleteShape = useCallback((idx: number) => {
    setShapes(prev => {
      const next = prev.filter((_, i) => i !== idx);
      setTimeout(() => {
        setZones(prevZones => {
          const autoZones = generateAutoZones(next, prevZones);
          if (weather && timeSlot) {
            return autoZones.map(z => {
              const tag = zoneSpaceTags[z.id] || inferSpaceTag(z.label || z.id);
              const resolved = resolveEnvironment(tag, weather, timeSlot);
              return { ...z, env: resolvedEnvToZoneEnv(resolved) };
            });
          }
          return autoZones;
        });
      }, 0);
      return next;
    });
  }, [weather, timeSlot, zoneSpaceTags]);

  // ---- Agent management ----
  const addAgent = useCallback(() => {
    const idx = agents.length;
    setAgents(prev => [...prev, createDefaultAgent(idx)]);
    setAgentPositions(prev => [...prev, null]);
    setActiveAgentIdx(idx);
    toast.success(`Agent ${idx + 1} added`);
  }, [agents.length]);

  const removeAgent = useCallback((idx: number) => {
    if (agents.length <= 1) { toast.error("Cannot remove the last agent"); return; }
    setAgents(prev => prev.filter((_, i) => i !== idx));
    setAgentPositions(prev => prev.filter((_, i) => i !== idx));
    setAllWaypoints(prev => {
      const next: Record<number, Waypoint[]> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = parseInt(k);
        if (ki < idx) next[ki] = v;
        else if (ki > idx) next[ki - 1] = v;
      });
      return next;
    });
    if (activeAgentIdx >= idx && activeAgentIdx > 0) setActiveAgentIdx(activeAgentIdx - 1);
    toast.info(`Agent ${idx + 1} removed`);
  }, [agents.length, activeAgentIdx]);

  const updateAgent = useCallback((idx: number, updates: Partial<V2Agent>) => {
    setAgents(prev => prev.map((a, i) => i === idx ? { ...a, ...updates } : a));
  }, []);

  const placeAgent = useCallback((pos: AgentPosition) => {
    setAgentPositions(prev => {
      const next = [...prev];
      next[activeAgentIdx] = pos;
      return next;
    });
  }, [activeAgentIdx]);

  // ---- Waypoint management ----
  const addWaypoint = useCallback((agentIdx: number, wp: Waypoint) => {
    setAllWaypoints(prev => {
      const existing = prev[agentIdx] || [];
      return { ...prev, [agentIdx]: [...existing, wp] };
    });
  }, []);

  const removeWaypoint = useCallback((agentIdx: number, wpId: string) => {
    setAllWaypoints(prev => {
      const existing = prev[agentIdx] || [];
      return { ...prev, [agentIdx]: existing.filter(w => w.id !== wpId) };
    });
  }, []);

  // ---- Zone management ----
  const addZone = useCallback((zone: Zone) => {
    const withEnv = (() => {
      if (weather && timeSlot) {
        const tag = inferSpaceTag(zone.label || zone.id);
        const resolved = resolveEnvironment(tag, weather, timeSlot);
        return { ...zone, env: resolvedEnvToZoneEnv(resolved) };
      }
      return zone;
    })();
    setZones(prev => [...prev, withEnv]);
  }, [weather, timeSlot]);

  const updateZone = useCallback((id: string, updates: Partial<Zone>) => {
    setZones(prev => prev.map(z => z.id === id ? { ...z, ...updates } : z));
  }, []);

  const removeZone = useCallback((id: string) => {
    setZones(prev => prev.filter(z => z.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setShapes([]);
    setZones([]);
    setAgentPositions(prev => prev.map(() => null));
    setAllWaypoints({});
    setHeatmapPoints([]);
    toast.info("Spatial map cleared");
  }, []);

  // ---- Run Simulation (all agents) ----
  const handleRunSimulation = useCallback(async () => {
    if (!weather || !timeSlot) { toast.error("Select weather and time slot"); return; }
    const wps = allWaypoints[activeAgentIdx] || [];
    const nodes = pathManualOverride ? pathNodes : (wps.length > 0 ? waypointsToPathNodes(wps, "Campus") : pathNodes);
    if (nodes.length === 0) { toast.error("Add waypoints or path nodes first"); return; }

    setIsSimulating(true);
    try {
      const results: { agent: V2Agent; result: SimulationRunResult }[] = [];
      for (const agent of agents) {
        const result = runSimulation(nodes, agent, weather, timeSlot, occupancy);
        results.push({ agent, result });
      }
      setSimResults(results);
      setNarrativeResults([]);

      // Generate heatmap
      const points: HeatmapPoint[] = [];
      results.forEach(({ result }, agentIdx) => {
        const pos = agentPositions[agentIdx];
        if (pos) {
          result.nodeResults.filter(r => r.mode === "dwelling").forEach((r, i) => {
            points.push({ x: pos.x + i * 2000, y: pos.y, value: Math.abs(r.pmv) * 2, agentIdx });
          });
        }
      });
      setHeatmapPoints(points);
      toast.success(`Simulation complete for ${agents.length} agent(s)`);
    } catch (err) {
      toast.error("Simulation failed: " + (err as Error).message);
    } finally {
      setIsSimulating(false);
    }
  }, [weather, timeSlot, pathNodes, agents, occupancy, agentPositions, allWaypoints, activeAgentIdx, pathManualOverride]);

  // ---- Generate Narratives ----
  const handleGenerateNarratives = useCallback(async () => {
    if (simResults.length === 0 || !weather || !timeSlot) return;
    setIsGeneratingNarrative(true);
    try {
      const results: { agentId: string; result: NarrativeResult }[] = [];
      for (const { agent, result } of simResults) {
        const nr = await generateAllNarratives(result, weather, timeSlot, () => {});
        results.push({ agentId: agent.id, result: nr });
      }
      setNarrativeResults(results);
      toast.success("Narratives generated");
    } catch (err) {
      toast.error("Narrative generation failed: " + (err as Error).message);
    } finally {
      setIsGeneratingNarrative(false);
    }
  }, [simResults, weather, timeSlot]);

  // ---- Save Run ----
  const handleSaveRun = useCallback(() => {
    if (simResults.length === 0) return;
    const label = `${weather?.label || "?"} @ ${timeSlot?.label || "?"} (${agents.length} agents)`;
    const run: SavedRun = {
      id: `run_${Date.now()}`,
      label,
      agents: [...agents],
      weatherId,
      timeSlotId,
      simResults: [...simResults],
      narrativeResults: [...narrativeResults],
    };
    setSavedRuns(prev => [...prev, run]);
    toast.success(`Run saved: "${label}"`);
  }, [simResults, narrativeResults, weather, timeSlot, agents, weatherId, timeSlotId]);

  // ---- Compare ----
  const handleCompare = useCallback(() => {
    if (savedRuns.length < 2) { toast.error("Need at least 2 saved runs"); return; }
    // Build DesignOptions from first agent of each run for comparison
    const options: DesignOption[] = savedRuns.map(r => ({
      id: r.id,
      label: r.label,
      simResult: r.simResults[0]?.result || { agent: agents[0], weatherId: "", timeSlotId: "", occupancy: "normal", nodeResults: [], avgPMV: 0, avgPPD: 5, warnCount: 0, criticalCount: 0, overallRating: "Comfortable" as const },
      narrativeResult: r.narrativeResults[0]?.result,
    }));
    setComparisonResult(generateComparison(options));
  }, [savedRuns, agents]);

  // ---- Export ----
  const handleExportJSON = useCallback(() => {
    const data = { agents, weatherId, timeSlotId, occupancy, shapes, zones, pathNodes, simResults, narrativeResults, savedRuns, comparisonResult };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sentiarch_v2_output.json"; a.click();
    URL.revokeObjectURL(url);
  }, [agents, weatherId, timeSlotId, occupancy, shapes, zones, pathNodes, simResults, narrativeResults, savedRuns, comparisonResult]);

  const activeAgent = agents[activeAgentIdx] || agents[0];
  const activeWaypoints = allWaypoints[activeAgentIdx] || [];

  // ============================================================
  // RENDER — Single Page Layout
  // ============================================================
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Header */}
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", boxShadow: "0 1px 8px rgba(0,0,0,0.04)" }}>
        <div className="container py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>SentiArch v2</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>Weather-Driven Occupant Experience Simulation</p>
          </div>
          <div className="flex items-center gap-2">
            {simResults.length > 0 && <button className="sa-btn text-xs" onClick={handleExportJSON}>Export JSON</button>}
            <button className="sa-btn text-xs" onClick={() => navigate("/settings")}>Settings</button>
            <button className="sa-btn text-xs" onClick={() => navigate("/")}>Home</button>
          </div>
        </div>
      </header>

      <div className="container py-4 space-y-4">
        {/* ================================================================ */}
        {/* SECTION 1: Weather + Time + Occupancy */}
        {/* ================================================================ */}
        <SectionHeader title="Weather &amp; Time" tag="1" collapsed={collapsed["weather"]} onToggle={() => toggle("weather")} />
        {!collapsed["weather"] && (
          <div className="sa-card space-y-4">
            {/* Weather grid */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: "var(--muted-foreground)" }}>Weather Scenario</label>
              <div className="grid grid-cols-4 gap-1.5">
                {WEATHER_SCENARIOS.map(w => {
                  const c = SEASON_COLORS[w.season];
                  const sel = w.id === weatherId;
                  return (
                    <button key={w.id} onClick={() => setWeatherId(w.id)}
                      className="p-2 rounded-lg text-left text-[11px] transition-all"
                      style={{ background: sel ? c.bg : "var(--background)", border: `1.5px solid ${sel ? c.border : "var(--border)"}` }}>
                      <div className="font-semibold" style={{ color: sel ? c.text : "var(--foreground)" }}>{w.label}</div>
                      <div style={{ color: "var(--muted-foreground)" }}>{w.outdoor_temp}&deg;C &middot; {w.humidity}% &middot; {w.wind_speed}m/s</div>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Time + Occupancy row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: "var(--muted-foreground)" }}>Time of Day</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {TIME_SLOTS.map(t => {
                    const sel = t.id === timeSlotId;
                    return (
                      <button key={t.id} onClick={() => setTimeSlotId(t.id)}
                        className="p-2 rounded-lg text-center text-xs font-medium transition-all"
                        style={{ background: sel ? "var(--foreground)" : "var(--background)", color: sel ? "var(--background)" : "var(--foreground)", border: `1.5px solid ${sel ? "var(--foreground)" : "var(--border)"}` }}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: "var(--muted-foreground)" }}>Occupancy</label>
                <div className="flex gap-1.5">
                  {(["empty", "normal", "crowded"] as OccupancyLevel[]).map(o => {
                    const sel = o === occupancy;
                    return (
                      <button key={o} onClick={() => setOccupancy(o)}
                        className="flex-1 p-2 rounded-lg text-center text-xs font-medium capitalize transition-all"
                        style={{ background: sel ? "var(--foreground)" : "var(--background)", color: sel ? "var(--background)" : "var(--foreground)", border: `1.5px solid ${sel ? "var(--foreground)" : "var(--border)"}` }}>
                        {o}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SECTION 2: Multi-Agent Configuration */}
        {/* ================================================================ */}
        <SectionHeader title={`Agents (${agents.length})`} tag="2" collapsed={collapsed["agents"]} onToggle={() => toggle("agents")} />
        {!collapsed["agents"] && (
          <div className="sa-card space-y-3">
            {/* Agent tabs */}
            <div className="flex items-center gap-1 flex-wrap">
              {agents.map((a, i) => {
                const color = getPersonaColor(i);
                const sel = i === activeAgentIdx;
                return (
                  <button key={a.id} onClick={() => setActiveAgentIdx(i)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: sel ? color.primary : "var(--background)", color: sel ? "#fff" : "var(--foreground)", border: `1.5px solid ${sel ? color.primary : "var(--border)"}` }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: sel ? "#fff" : color.primary }} />
                    {a.role} ({a.mbti})
                    {agents.length > 1 && (
                      <span onClick={e => { e.stopPropagation(); removeAgent(i); }}
                        className="ml-1 opacity-60 hover:opacity-100 cursor-pointer">&times;</span>
                    )}
                  </button>
                );
              })}
              <button onClick={addAgent} className="sa-btn text-xs px-3 py-1.5">+ Add Agent</button>
            </div>

            {/* Active agent config */}
            <div className="grid grid-cols-5 gap-3">
              <div>
                <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--muted-foreground)" }}>Role</label>
                <select value={activeAgent.role}
                  onChange={e => updateAgent(activeAgentIdx, { role: e.target.value as AgentRole, stream: e.target.value === "student" ? activeAgent.stream || "arts" : undefined })}
                  className="w-full p-1.5 rounded text-xs"
                  style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="staff">Staff</option>
                  <option value="visitor">Visitor</option>
                </select>
              </div>
              {activeAgent.role === "student" && (
                <div>
                  <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--muted-foreground)" }}>Stream</label>
                  <select value={activeAgent.stream || "arts"}
                    onChange={e => updateAgent(activeAgentIdx, { stream: e.target.value as StudentStream })}
                    className="w-full p-1.5 rounded text-xs"
                    style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                    <option value="sports">Sports</option>
                    <option value="arts">Arts</option>
                  </select>
                </div>
              )}
              <div>
                <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--muted-foreground)" }}>Gender</label>
                <div className="flex gap-1">
                  {(["male", "female"] as const).map(g => (
                    <button key={g} onClick={() => updateAgent(activeAgentIdx, { gender: g })}
                      className="flex-1 p-1.5 rounded text-xs font-medium capitalize"
                      style={{ background: activeAgent.gender === g ? "var(--foreground)" : "var(--background)", color: activeAgent.gender === g ? "var(--background)" : "var(--foreground)", border: `1px solid ${activeAgent.gender === g ? "var(--foreground)" : "var(--border)"}` }}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--muted-foreground)" }}>Age</label>
                <input type="number" min={1} max={100} value={activeAgent.age}
                  onChange={e => updateAgent(activeAgentIdx, { age: Math.max(1, Math.min(100, parseInt(e.target.value) || 16)) })}
                  className="w-full p-1.5 rounded text-xs"
                  style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }} />
              </div>
              <div>
                <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--muted-foreground)" }}>MBTI</label>
                <select value={activeAgent.mbti}
                  onChange={e => updateAgent(activeAgentIdx, { mbti: e.target.value as MBTIType })}
                  className="w-full p-1.5 rounded text-xs"
                  style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {MBTI_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {/* Derived params */}
            <div className="flex gap-4 text-[11px] p-2 rounded" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted-foreground)" }}>Preferred: <b style={{ color: "var(--foreground)" }}>{derivePreferredTemp(activeAgent)}&deg;C</b></span>
              <span style={{ color: "var(--muted-foreground)" }}>Clothing: <b style={{ color: "var(--foreground)" }}>{weather ? deriveClothingInsulation(activeAgent.role, weather.season) : "—"} clo</b></span>
              <span style={{ color: "var(--muted-foreground)" }}>Tone: <b style={{ color: "var(--foreground)" }}>{getNarrativeTone(activeAgent.mbti)}</b></span>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SECTION 3: Spatial Map + Waypoints (unified) */}
        {/* ================================================================ */}
        <SectionHeader title="Spatial Map &amp; Waypoints" tag="3" collapsed={collapsed["spatial"]} onToggle={() => toggle("spatial")} />
        {!collapsed["spatial"] && (
          <div className="space-y-3">
            {/* Map canvas */}
            <div className="sa-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>Canvas</span>
                  <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                    Draw boundaries → auto-zone &middot; Place agent &middot; Set waypoints &middot; All on one canvas
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setShowHeatmap(h => !h)} className="sa-btn text-[10px] px-2 py-1"
                    style={{ background: showHeatmap ? "#D94F4F" : "var(--card)", color: showHeatmap ? "#fff" : "var(--foreground)" }}>
                    {showHeatmap ? "Hide Heatmap" : "Heatmap"}
                  </button>
                  <button onClick={clearAll} className="sa-btn text-[10px] px-2 py-1"
                    style={{ background: "#FFEBEE", color: "#C62828" }}>Clear</button>
                </div>
              </div>
              <SpatialMap
                shapes={shapes}
                zones={zones}
                agentPositions={agentPositions}
                activeAgentIdx={activeAgentIdx}
                onAgentPlace={placeAgent}
                onAddShape={addShape}
                onAddZone={addZone}
                onUpdateShapes={updateShapes}
                onDeleteShape={deleteShape}
                allWaypoints={allWaypoints}
                onAddWaypoint={addWaypoint}
                onRemoveWaypoint={removeWaypoint}
                heatmapPoints={heatmapPoints}
                showHeatmap={showHeatmap}
              />
            </div>

            {/* Zone list with space tags */}
            {zones.length > 0 && (
              <div className="sa-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>Zones ({zones.length})</span>
                  <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                    Environment auto-derived from weather + space tag
                  </span>
                </div>
                <div className="space-y-1.5">
                  {zones.map(z => {
                    const tag = zoneSpaceTags[z.id] || inferSpaceTag(z.label || z.id);
                    return (
                      <div key={z.id} className="flex items-center gap-2 p-2 rounded" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
                        <span className="text-xs font-medium" style={{ color: "var(--foreground)", minWidth: "80px" }}>{z.label || z.id}</span>
                        <select value={tag}
                          onChange={e => setZoneSpaceTags(prev => ({ ...prev, [z.id]: e.target.value as SpaceTag }))}
                          className="p-1 rounded text-[10px]"
                          style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                          {SPACE_TAGS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                        <span className="text-[10px] flex-1 text-right" style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
                          {z.env.temperature}&deg;C &middot; {z.env.humidity}% &middot; {z.env.light}lux &middot; {z.env.noise}dB &middot; {z.env.air_velocity}m/s
                        </span>
                        <button onClick={() => removeZone(z.id)} className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: "#FFEBEE", color: "#C62828" }}>&times;</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Waypoint list for active agent */}
            <div className="sa-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                  Waypoints — Agent {activeAgentIdx + 1} ({activeWaypoints.length} points)
                </span>
                <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                  Use waypoint tool on canvas to add &middot; Auto-generates path nodes below
                </span>
              </div>
              {activeWaypoints.length > 0 ? (
                <div className="space-y-1">
                  {activeWaypoints.map((wp, i) => (
                    <div key={wp.id} className="flex items-center gap-2 p-1.5 rounded text-[11px]"
                      style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
                      <span className="font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--foreground)", color: "var(--background)", fontFamily: "'JetBrains Mono', monospace" }}>{i + 1}</span>
                      <span className="font-medium" style={{ color: "var(--foreground)" }}>{wp.label}</span>
                      <span style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
                        ({wp.position.x}, {wp.position.y}) &middot; {wp.dwell_minutes}min
                      </span>
                      <div className="flex-1" />
                      <button onClick={() => removeWaypoint(activeAgentIdx, wp.id)}
                        className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#FFEBEE", color: "#C62828" }}>&times;</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                  No waypoints yet. Select the waypoint tool on the canvas toolbar and click to place waypoints.
                </p>
              )}
            </div>

            {/* Coordinate Input */}
            <div className="sa-card">
              <details>
                <summary className="text-xs font-semibold cursor-pointer" style={{ color: "var(--foreground)" }}>
                  Coordinate Input &amp; Manual Zone Editor
                </summary>
                <div className="mt-3">
                  <CoordinateInput
                    onAddShape={addShape}
                    onClearAll={clearAll}
                    zones={zones}
                    onAddZone={addZone}
                    onUpdateZone={updateZone}
                    onRemoveZone={removeZone}
                  />
                </div>
              </details>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SECTION 4: Path Nodes (auto from waypoints or manual) */}
        {/* ================================================================ */}
        <SectionHeader title={`Path (${pathNodes.length} nodes)`} tag="4" collapsed={collapsed["path"]} onToggle={() => toggle("path")} />
        {!collapsed["path"] && (
          <div className="sa-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                  <input type="checkbox" checked={pathManualOverride}
                    onChange={e => setPathManualOverride(e.target.checked)} />
                  <span style={{ color: "var(--muted-foreground)" }}>Manual override (detach from waypoints)</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                {pathManualOverride && (
                  <button className="sa-btn text-[10px]" onClick={() => setPathNodes(prev => [...prev, createDefaultNode(prev.length)])}>
                    + Add Node
                  </button>
                )}
                <button className="sa-btn sa-btn-primary text-xs" onClick={handleRunSimulation}
                  disabled={isSimulating || pathNodes.length === 0}
                  style={{ opacity: (isSimulating || pathNodes.length === 0) ? 0.5 : 1 }}>
                  {isSimulating ? "Simulating..." : `Run Simulation (${agents.length} agents)`}
                </button>
              </div>
            </div>

            {pathNodes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      <th className="text-left p-1.5" style={{ color: "var(--muted-foreground)" }}>#</th>
                      <th className="text-left p-1.5" style={{ color: "var(--muted-foreground)" }}>Program</th>
                      <th className="text-left p-1.5" style={{ color: "var(--muted-foreground)" }}>Space Tag</th>
                      <th className="text-left p-1.5" style={{ color: "var(--muted-foreground)" }}>Mode</th>
                      <th className="text-left p-1.5" style={{ color: "var(--muted-foreground)" }}>Activity</th>
                      <th className="text-right p-1.5" style={{ color: "var(--muted-foreground)" }}>Duration</th>
                      {pathManualOverride && <th className="p-1.5"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pathNodes.map((node, i) => (
                      <tr key={node.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="p-1.5 font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{i + 1}</td>
                        <td className="p-1.5">
                          {pathManualOverride ? (
                            <input value={node.program} onChange={e => setPathNodes(prev => prev.map((n, j) => j === i ? { ...n, program: e.target.value } : n))}
                              className="p-1 rounded text-[11px] w-full" style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }} />
                          ) : node.program}
                        </td>
                        <td className="p-1.5">
                          {pathManualOverride ? (
                            <select value={node.spaceTag} onChange={e => setPathNodes(prev => prev.map((n, j) => j === i ? { ...n, spaceTag: e.target.value as SpaceTag } : n))}
                              className="p-1 rounded text-[10px]" style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                              {SPACE_TAGS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded" style={{ background: "var(--background)", fontSize: "10px" }}>{node.spaceTag}</span>
                          )}
                        </td>
                        <td className="p-1.5 capitalize">{node.mode.replace("_", " ")}</td>
                        <td className="p-1.5">
                          {node.mode === "dwelling" ? (
                            pathManualOverride ? (
                              <select value={node.activityId || "attending_class"}
                                onChange={e => setPathNodes(prev => prev.map((n, j) => j === i ? { ...n, activityId: e.target.value } : n))}
                                className="p-1 rounded text-[10px]" style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                                {ACTIVITIES.map(a => <option key={a.id} value={a.id}>{a.label} (MET {a.met})</option>)}
                              </select>
                            ) : (ACTIVITIES.find(a => a.id === node.activityId)?.label || node.activityId)
                          ) : "—"}
                        </td>
                        <td className="p-1.5 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {node.mode === "dwelling" ? (
                            pathManualOverride ? (
                              <input type="number" min={1} max={240} value={node.duration_minutes || 30}
                                onChange={e => setPathNodes(prev => prev.map((n, j) => j === i ? { ...n, duration_minutes: parseInt(e.target.value) || 30 } : n))}
                                className="p-1 rounded text-[10px] w-16 text-right" style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }} />
                            ) : `${node.duration_minutes}min`
                          ) : "—"}
                        </td>
                        {pathManualOverride && (
                          <td className="p-1.5">
                            <button onClick={() => setPathNodes(prev => prev.filter((_, j) => j !== i))}
                              className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#FFEBEE", color: "#C62828" }}>&times;</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                No path nodes. Place waypoints on the spatial map, or enable manual override to add nodes directly.
              </p>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* SECTION 5: Results */}
        {/* ================================================================ */}
        {simResults.length > 0 && (
          <>
            <SectionHeader title="Simulation Results" tag="5" collapsed={collapsed["results"]} onToggle={() => toggle("results")} />
            {!collapsed["results"] && (
              <div className="space-y-3">
                {simResults.map(({ agent, result }, ri) => {
                  const color = getPersonaColor(agents.indexOf(agent));
                  const tes = computeTES(result);
                  const tesColor = tes >= 70 ? "#2E7D32" : tes >= 40 ? "#F57F17" : "#C62828";
                  return (
                    <div key={agent.id + ri} className="sa-card">
                      {/* Agent header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ background: color.primary }} />
                          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                            {agent.role} ({agent.mbti}, {agent.gender}, age {agent.age})
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{
                            color: RATING_COLORS[result.overallRating],
                            background: RATING_COLORS[result.overallRating] + "15",
                          }}>{result.overallRating}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold" style={{ color: tesColor, fontFamily: "'JetBrains Mono', monospace" }}>
                            TES: {tes}/100
                          </span>
                        </div>
                      </div>

                      {/* Summary metrics */}
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {[
                          { label: "Avg PMV", value: result.avgPMV.toFixed(2), color: "var(--foreground)" },
                          { label: "Avg PPD", value: `${result.avgPPD.toFixed(1)}%`, color: "var(--foreground)" },
                          { label: "WARN", value: String(result.warnCount), color: result.warnCount > 0 ? "#F57F17" : "var(--muted-foreground)" },
                          { label: "CRITICAL", value: String(result.criticalCount), color: result.criticalCount > 0 ? "#C62828" : "var(--muted-foreground)" },
                        ].map(m => (
                          <div key={m.label} className="text-center p-2 rounded" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
                            <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{m.label}</div>
                            <div className="text-sm font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: m.color }}>{m.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* PMV bar chart */}
                      <div className="flex items-end gap-0.5 mb-2" style={{ height: "80px" }}>
                        {result.nodeResults.map((r, i) => {
                          const sev = getSeverityFromPMV(r.pmv);
                          const sc = SEVERITY_COLORS[sev];
                          const h = Math.min(100, Math.max(8, Math.abs(r.pmv) * 30 + 8));
                          return (
                            <div key={r.nodeId} className="flex-1 flex flex-col items-center gap-0.5">
                              <span className="text-[8px]" style={{ color: sc.text, fontFamily: "'JetBrains Mono', monospace" }}>{r.pmv.toFixed(1)}</span>
                              <div className="w-full rounded-t" style={{ height: `${h}%`, background: sc.text + "40", border: `1px solid ${sc.border}60`, minWidth: "8px" }} />
                              <span className="text-[7px]" style={{ color: "var(--muted-foreground)" }}>{i + 1}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Per-node table */}
                      <details>
                        <summary className="text-[11px] cursor-pointer mb-2" style={{ color: "var(--muted-foreground)" }}>
                          Show per-node details ({result.nodeResults.length} nodes)
                        </summary>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[10px]" style={{ borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ borderBottom: "1.5px solid var(--border)" }}>
                                {["#", "Space", "Tag", "Mode", "Temp", "MRT", "PMV", "PPD", "Flag"].map(h => (
                                  <th key={h} className="p-1 text-left" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {result.nodeResults.map((r, i) => {
                                const sev = getSeverityFromPMV(r.pmv);
                                const sc = SEVERITY_COLORS[sev];
                                return (
                                  <tr key={r.nodeId} style={{ borderBottom: "1px solid var(--border)" }}>
                                    <td className="p-1 font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{i + 1}</td>
                                    <td className="p-1">{r.nodeAddress}</td>
                                    <td className="p-1"><span className="px-1 py-0.5 rounded" style={{ background: "var(--background)", fontSize: "9px" }}>{r.spaceTag}</span></td>
                                    <td className="p-1 capitalize">{r.mode.replace("_", " ")}</td>
                                    <td className="p-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{r.resolvedEnv.air_temp}&deg;C</td>
                                    <td className="p-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{r.resolvedEnv.mean_radiant_temp}&deg;C</td>
                                    <td className="p-1 font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: sc.text }}>{r.pmv.toFixed(2)}</td>
                                    <td className="p-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{r.ppd.toFixed(1)}%</td>
                                    <td className="p-1"><span className="px-1 py-0.5 rounded text-[9px] font-bold" style={{ background: sc.bg, color: sc.text }}>{sev}</span></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </div>
                  );
                })}

                {/* Narrative generation */}
                <div className="sa-card">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>LLM Narratives</span>
                    {narrativeResults.length === 0 && (
                      <button className="sa-btn sa-btn-primary text-[11px]" onClick={handleGenerateNarratives}
                        disabled={isGeneratingNarrative} style={{ opacity: isGeneratingNarrative ? 0.5 : 1 }}>
                        {isGeneratingNarrative ? "Generating..." : "Generate Narratives (DeepSeek)"}
                      </button>
                    )}
                  </div>
                  {narrativeResults.length > 0 ? (
                    <div className="space-y-2">
                      {narrativeResults.map(({ agentId, result: nr }) => (
                        <details key={agentId}>
                          <summary className="text-[11px] font-medium cursor-pointer" style={{ color: "var(--foreground)" }}>
                            Agent {agentId} — {nr.nodeNarratives.length} narratives, {nr.designFlagSummary.length} flags
                          </summary>
                          <div className="mt-2 space-y-2">
                            {nr.nodeNarratives.map((nn, i) => {
                              const sc = nn.severity ? SEVERITY_COLORS[nn.severity] : null;
                              return (
                                <div key={nn.nodeId} className="p-2 rounded text-[11px]" style={{
                                  background: sc ? sc.bg + "40" : "var(--background)",
                                  border: `1px solid ${sc ? sc.border + "40" : "var(--border)"}`,
                                }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Node {i + 1}</span>
                                    <span style={{ color: "var(--muted-foreground)" }}>{nn.nodeAddress}</span>
                                    {nn.severity && <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: SEVERITY_COLORS[nn.severity].bg, color: SEVERITY_COLORS[nn.severity].text }}>{nn.severity}</span>}
                                  </div>
                                  <p className="leading-relaxed" style={{ color: "var(--foreground)" }}>{nn.narrative}</p>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                      Click &quot;Generate Narratives&quot; to create first-person experience descriptions.
                    </p>
                  )}
                </div>

                {/* Save + Compare actions */}
                <div className="flex items-center justify-between">
                  <button className="sa-btn text-xs" onClick={handleSaveRun}>
                    Save This Run ({savedRuns.length} saved)
                  </button>
                  {savedRuns.length >= 2 && (
                    <button className="sa-btn sa-btn-primary text-xs" onClick={handleCompare}>
                      Compare {savedRuns.length} Runs
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ================================================================ */}
        {/* SECTION 6: Cross-Option Comparison */}
        {/* ================================================================ */}
        {(savedRuns.length > 0 || comparisonResult) && (
          <>
            <SectionHeader title={`Comparison (${savedRuns.length} runs)`} tag="6" collapsed={collapsed["compare"]} onToggle={() => toggle("compare")} />
            {!collapsed["compare"] && (
              <div className="space-y-3">
                {/* Saved runs list */}
                <div className="sa-card">
                  <span className="text-xs font-semibold block mb-2" style={{ color: "var(--foreground)" }}>Saved Runs</span>
                  {savedRuns.length > 0 ? (
                    <div className="space-y-1">
                      {savedRuns.map((run, i) => (
                        <div key={run.id} className="flex items-center gap-2 p-2 rounded text-[11px]"
                          style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
                          <span className="font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{i + 1}</span>
                          <span className="flex-1" style={{ color: "var(--foreground)" }}>{run.label}</span>
                          <span style={{ color: "var(--muted-foreground)" }}>{run.simResults.length} agent(s)</span>
                          <button onClick={() => setSavedRuns(prev => prev.filter(r => r.id !== run.id))}
                            className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#FFEBEE", color: "#C62828" }}>&times;</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>No saved runs yet.</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    {savedRuns.length >= 2 && (
                      <button className="sa-btn sa-btn-primary text-[11px]" onClick={handleCompare}>
                        Generate Comparison
                      </button>
                    )}
                    {savedRuns.length > 0 && (
                      <button className="sa-btn text-[10px]" onClick={() => { setSavedRuns([]); setComparisonResult(null); }}
                        style={{ background: "#FFEBEE", color: "#C62828" }}>Clear All Runs</button>
                    )}
                  </div>
                </div>

                {/* Comparison table */}
                {comparisonResult && (
                  <div className="sa-card">
                    <span className="text-xs font-semibold block mb-3" style={{ color: "var(--foreground)" }}>Cross-Option Comparison</span>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid var(--border)" }}>
                            {["Option", "Avg PMV", "Avg PPD", "WARN", "CRITICAL", "Rating"].map(h => (
                              <th key={h} className={`p-2 ${h === "Option" ? "text-left" : "text-right"}`} style={{ color: "var(--muted-foreground)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonResult.rows.map(row => {
                            const isBest = row.optionId === comparisonResult.bestOptionId;
                            const isWorst = row.optionId === comparisonResult.worstOptionId;
                            return (
                              <tr key={row.optionId} style={{
                                borderBottom: "1px solid var(--border)",
                                background: isBest ? "#E8F5E920" : isWorst ? "#FFEBEE20" : "transparent",
                              }}>
                                <td className="p-2">
                                  {row.optionLabel}
                                  {isBest && <span className="ml-1 text-[9px] font-bold" style={{ color: "#2E7D32" }}>(Best)</span>}
                                  {isWorst && comparisonResult.rows.length > 1 && <span className="ml-1 text-[9px] font-bold" style={{ color: "#C62828" }}>(Worst)</span>}
                                </td>
                                <td className="p-2 text-right font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{row.avgPMV.toFixed(2)}</td>
                                <td className="p-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{row.avgPPD.toFixed(1)}%</td>
                                <td className="p-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace", color: row.warnCount > 0 ? "#F57F17" : "var(--muted-foreground)" }}>{row.warnCount}</td>
                                <td className="p-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace", color: row.criticalCount > 0 ? "#C62828" : "var(--muted-foreground)" }}>{row.criticalCount}</td>
                                <td className="p-2 text-right">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{
                                    color: RATING_COLORS[row.overallRating], background: RATING_COLORS[row.overallRating] + "15",
                                  }}>{row.overallRating}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Design flags */}
                    {comparisonResult.allFlags.some(f => f.flags.length > 0) && (
                      <div className="mt-3 p-3 rounded" style={{ background: "#FFF8E1", border: "1px solid #FFB30040" }}>
                        <span className="text-[11px] font-bold block mb-2" style={{ color: "#F57F17" }}>Design Flags</span>
                        {comparisonResult.allFlags.filter(f => f.flags.length > 0).map((group, gi) => (
                          <div key={gi} className="mb-2">
                            <span className="text-[10px] font-bold" style={{ color: "var(--foreground)" }}>{group.optionLabel}</span>
                            {group.flags.map((flag, fi) => {
                              const fc = SEVERITY_COLORS[flag.severity];
                              return (
                                <div key={fi} className="flex items-start gap-1.5 text-[10px] pl-2 mt-0.5">
                                  <span className="px-1 py-0.5 rounded font-bold shrink-0" style={{ background: fc.bg, color: fc.text }}>{flag.severity}</span>
                                  <span style={{ color: "var(--muted-foreground)" }}>{flag.nodeAddress}:</span>
                                  <span style={{ color: "var(--foreground)" }}>{flag.description}</span>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---- Helper: Thermal Equity Score ----
function computeTES(result: SimulationRunResult): number {
  const dwelling = result.nodeResults.filter(r => r.mode === "dwelling");
  if (dwelling.length === 0) return 100;
  const absPMVs = dwelling.map(r => Math.abs(r.pmv));
  const mean = absPMVs.reduce((s, v) => s + v, 0) / absPMVs.length;
  const variance = absPMVs.reduce((s, v) => s + (v - mean) ** 2, 0) / absPMVs.length;
  const stdDev = Math.sqrt(variance);
  return Math.round(Math.max(0, Math.min(100, 100 - mean * 20 - stdDev * 10 - result.criticalCount * 15)));
}

// ---- Section Header ----
function SectionHeader({ title, tag, collapsed, onToggle }: { title: string; tag: string; collapsed?: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center gap-2 py-2 group">
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--foreground)", color: "var(--background)" }}>{tag}</span>
      <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{title}</span>
      <div className="flex-1 border-b" style={{ borderColor: "var(--border)" }} />
      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{collapsed ? "▸" : "▾"}</span>
    </button>
  );
}
