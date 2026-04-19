/**
 * SentiArch — Route Simulation Tab
 *
 * Provides an interactive UI for simulating a single agent's route
 * from origin to destination, with:
 * - Cohort selector (reuses existing AgentCohort definitions)
 * - Origin / Destination space pickers
 * - 2D floor plan with route overlay (SVG)
 * - Comfort timeline chart (PMV, PPD, Perceptual Load along route)
 * - Waypoint detail table
 * - LLM experience narrative generation
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type {
  AgentCohort,
  RoomEnvironment,
  RouteSimulationResult,
  RouteWaypoint,
} from "../../types/simulation";
import { DEFAULT_COHORTS } from "../../types/simulation";
import {
  runRouteSimulation,
  type LayoutRoomInfo,
} from "../../engines/simulation";

// ---------------------------------------------------------------------------
// Category colours (same as other steps)
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  academic: "#3b82f6",
  art: "#8b5cf6",
  science: "#10b981",
  public: "#f59e0b",
  sport: "#ef4444",
  residential: "#ec4899",
  support: "#6b7280",
  circulation: "#9ca3af",
  corridor: "#9ca3af",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RouteSimulationTabProps {
  rooms: LayoutRoomInfo[];
  corridors: { id: string; x: number; y: number; areaM2: number; floorIndex: number }[];
  maxFloors: number;
  envOverrides: Map<string, RoomEnvironment>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RouteSimulationTab({
  rooms,
  corridors,
  maxFloors,
  envOverrides,
}: RouteSimulationTabProps) {
  // ---- State ----
  const [selectedCohort, setSelectedCohort] = useState<AgentCohort>(DEFAULT_COHORTS[0]);
  const [originId, setOriginId] = useState("");
  const [destId, setDestId] = useState("");
  const [result, setResult] = useState<RouteSimulationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [hoveredWaypoint, setHoveredWaypoint] = useState<number | null>(null);
  const narrativeRef = useRef<HTMLDivElement>(null);

  // ---- Derived data ----
  const roomList = useMemo(
    () => rooms.filter((r) => !r.spaceId.startsWith("__")).sort((a, b) => a.name.localeCompare(b.name)),
    [rooms],
  );

  const floorGroups = useMemo(() => {
    const groups = new Map<number, LayoutRoomInfo[]>();
    for (const r of roomList) {
      if (!groups.has(r.floorIndex)) groups.set(r.floorIndex, []);
      groups.get(r.floorIndex)!.push(r);
    }
    return groups;
  }, [roomList]);

  // Auto-select first rooms
  useEffect(() => {
    if (roomList.length > 0 && !originId) {
      setOriginId(roomList[0].spaceId);
      if (roomList.length > 1) setDestId(roomList[1].spaceId);
    }
  }, [roomList, originId]);

  // ---- Run simulation ----
  const handleRun = useCallback(() => {
    if (!originId || !destId || originId === destId) return;
    setIsRunning(true);
    setNarrative(null);
    setNarrativeError(null);

    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
        const res = runRouteSimulation({
          cohort: selectedCohort,
          originSpaceId: originId,
          destinationSpaceId: destId,
          rooms,
          corridors,
          maxFloors,
          envOverrides,
        });
        setResult(res);
      } catch (err) {
        console.error("Route simulation error:", err);
      } finally {
        setIsRunning(false);
      }
    }, 50);
  }, [originId, destId, selectedCohort, rooms, corridors, maxFloors, envOverrides]);

  // ---- Generate LLM narrative ----
  const handleGenerateNarrative = useCallback(async () => {
    if (!result) return;
    setIsGeneratingNarrative(true);
    setNarrativeError(null);

    try {
      const roomSequence = result.waypoints.map((wp) => wp.roomName).join(" → ");

      // Determine discomfort reason
      const worst = result.worstPoint;
      const reasons: string[] = [];
      if (Math.abs(worst.pmv) > 0.5) reasons.push(worst.pmv > 0 ? "偏熱" : "偏冷");
      if (worst.perceptualLoad.noise_stress > 0.5) reasons.push("噪音偏高");
      if (worst.perceptualLoad.visual_strain > 0.5) reasons.push("光線不足");
      if (worst.perceptualLoad.social_overload > 0.5) reasons.push("人流密集");
      if (worst.perceptualLoad.wayfinding_anxiety > 0.3) reasons.push("路徑不清晰");
      const discomfortReason = reasons.length > 0 ? reasons.join("、") : "環境壓力累積";

      const prompt = `你係一位 ${result.mbtiType} 性格、${selectedCohort.profile.age} 歲、${selectedCohort.label} 嘅人。
你剛剛完成咗一段由「${result.originName}」去「${result.destinationName}」嘅路程。

路徑摘要：
- 經過空間：${roomSequence}
- 最舒適位置：${result.bestPoint.roomName}（PMV ${result.bestPoint.pmv}）
- 最不舒適位置：${result.worstPoint.roomName}（PMV ${result.worstPoint.pmv}，原因：${discomfortReason}）
- 整體舒適度評分：${Math.round(result.totalComfortScore * 100)}%

以第一人稱、100-150字，用建築師能理解嘅語言，描述你對呢段路程嘅感受，
特別係空間過渡、光線變化、人流密度對你情緒嘅影響。
唔好重複數字，用感性語言表達定量數據背後嘅體驗。`;

      const response = await fetch("/api/llm/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        // Fallback: call OpenAI-compatible API directly via fetch
        // Using fetch instead of openai SDK to avoid CORS issues with extra headers
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
        const baseURL = import.meta.env.VITE_OPENAI_BASE_URL || "https://api.openai.com/v1";

        if (!apiKey) {
          throw new Error("OpenAI API key not configured. Set VITE_OPENAI_API_KEY in .env");
        }

        const llmResponse = await fetch(`${baseURL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            messages: [
              {
                role: "system",
                content:
                  "你是一個建築空間體驗模擬系統的敘事生成器。用第一人稱、感性但專業的語言描述空間體驗。回應必須是繁體中文（香港用語）。",
              },
              { role: "user", content: prompt },
            ],
            max_tokens: 300,
            temperature: 0.8,
          }),
        });

        if (!llmResponse.ok) {
          const errBody = await llmResponse.text();
          throw new Error(`LLM API error (${llmResponse.status}): ${errBody.slice(0, 200)}`);
        }

        const completion = await llmResponse.json();
        const text = completion.choices?.[0]?.message?.content ?? "";
        setNarrative(text);
        setResult((prev) => (prev ? { ...prev, narrative: text } : prev));
      } else {
        const data = await response.json();
        setNarrative(data.narrative);
        setResult((prev) => (prev ? { ...prev, narrative: data.narrative } : prev));
      }
    } catch (err) {
      console.error("Narrative generation error:", err);
      setNarrativeError(
        err instanceof Error ? err.message : "Failed to generate narrative",
      );
    } finally {
      setIsGeneratingNarrative(false);
    }
  }, [result, selectedCohort]);

  // ---- Copy narrative ----
  const handleCopyNarrative = useCallback(() => {
    if (narrative) {
      navigator.clipboard.writeText(narrative).catch(() => {});
    }
  }, [narrative]);

  // ---- Render helpers ----

  // SVG floor plan with route overlay
  const renderFloorPlan = () => {
    if (!result || result.waypoints.length === 0) return null;

    // Determine bounds from all rooms
    const allX = rooms.flatMap((r) => [r.centroidX ?? 0]);
    const allY = rooms.flatMap((r) => [r.centroidY ?? 0]);
    const minX = Math.min(...allX, ...result.waypoints.map((w) => w.position.x)) - 5;
    const maxX = Math.max(...allX, ...result.waypoints.map((w) => w.position.x)) + 5;
    const minY = Math.min(...allY, ...result.waypoints.map((w) => w.position.y)) - 5;
    const maxY = Math.max(...allY, ...result.waypoints.map((w) => w.position.y)) + 5;
    const width = maxX - minX || 50;
    const height = maxY - minY || 35;

    // Get floors involved in route
    const routeFloors = new Set(result.waypoints.map((w) => w.floorIndex));

    return (
      <svg
        viewBox={`${minX - 2} ${minY - 2} ${width + 4} ${height + 4}`}
        className="w-full border border-gray-700 rounded-lg bg-gray-900"
        style={{ maxHeight: 400 }}
      >
        {/* Room rectangles */}
        {rooms
          .filter((r) => routeFloors.has(r.floorIndex))
          .map((room) => {
            const cx = room.centroidX ?? 0;
            const cy = room.centroidY ?? 0;
            const size = Math.sqrt(room.areaM2) * 0.8;
            const isOnRoute = result.waypoints.some((w) => w.roomId === room.spaceId);
            const color = CATEGORY_COLORS[room.category] ?? "#6b7280";

            return (
              <g key={room.spaceId}>
                <rect
                  x={cx - size / 2}
                  y={cy - size / 2}
                  width={size}
                  height={size}
                  fill={color}
                  fillOpacity={isOnRoute ? 0.4 : 0.15}
                  stroke={isOnRoute ? color : "#555"}
                  strokeWidth={isOnRoute ? 0.4 : 0.2}
                  rx={0.3}
                />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#ccc"
                  fontSize={1.2}
                  fontFamily="sans-serif"
                >
                  {room.name.length > 10 ? room.name.slice(0, 10) + "…" : room.name}
                </text>
              </g>
            );
          })}

        {/* Route path line */}
        {result.waypoints.length > 1 && (
          <polyline
            points={result.waypoints.map((w) => `${w.position.x},${w.position.y}`).join(" ")}
            fill="none"
            stroke="#fbbf24"
            strokeWidth={0.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1,0.5"
          />
        )}

        {/* Waypoint dots */}
        {result.waypoints.map((wp, i) => {
          const isFirst = i === 0;
          const isLast = i === result.waypoints.length - 1;
          const isWorst = wp.roomId === result.worstPoint.roomId && wp.index === result.worstPoint.index;
          const isBest = wp.roomId === result.bestPoint.roomId && wp.index === result.bestPoint.index;
          const isHovered = hoveredWaypoint === i;

          let fill = "#fbbf24";
          let r = 0.6;
          if (isFirst) { fill = "#22c55e"; r = 0.9; }
          else if (isLast) { fill = "#3b82f6"; r = 0.9; }
          else if (isWorst) { fill = "#ef4444"; r = 0.8; }
          else if (isBest) { fill = "#10b981"; r = 0.8; }
          if (isHovered) r += 0.3;

          return (
            <g key={`wp-${i}`}>
              <circle
                cx={wp.position.x}
                cy={wp.position.y}
                r={r}
                fill={fill}
                stroke="#fff"
                strokeWidth={0.15}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredWaypoint(i)}
                onMouseLeave={() => setHoveredWaypoint(null)}
              />
              {(isFirst || isLast) && (
                <text
                  x={wp.position.x}
                  y={wp.position.y - 1.3}
                  textAnchor="middle"
                  fill={isFirst ? "#22c55e" : "#3b82f6"}
                  fontSize={1.1}
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  {isFirst ? "START" : "END"}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  // Comfort timeline chart (SVG)
  const renderComfortTimeline = () => {
    if (!result || result.waypoints.length < 2) return null;

    const chartW = 600;
    const chartH = 200;
    const padL = 50;
    const padR = 20;
    const padT = 20;
    const padB = 40;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;

    const maxDist = result.waypoints[result.waypoints.length - 1].cumulativeDistanceM || 1;

    const toX = (d: number) => padL + (d / maxDist) * plotW;
    const toY = (v: number, min: number, max: number) =>
      padT + plotH - ((v - min) / (max - min || 1)) * plotH;

    // PMV line (-3 to +3)
    const pmvLine = result.waypoints
      .map((wp) => `${toX(wp.cumulativeDistanceM)},${toY(wp.pmv, -3, 3)}`)
      .join(" ");

    // Load line (0 to 1)
    const loadLine = result.waypoints
      .map((wp) => `${toX(wp.cumulativeDistanceM)},${toY(wp.aggregateLoad, 0, 1)}`)
      .join(" ");

    // PPD line (0 to 100)
    const ppdLine = result.waypoints
      .map((wp) => `${toX(wp.cumulativeDistanceM)},${toY(wp.ppd, 0, 100)}`)
      .join(" ");

    return (
      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full">
        {/* Grid */}
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#555" strokeWidth={1} />
        <line
          x1={padL}
          y1={padT + plotH}
          x2={padL + plotW}
          y2={padT + plotH}
          stroke="#555"
          strokeWidth={1}
        />

        {/* PMV comfort zone (-0.5 to +0.5) */}
        <rect
          x={padL}
          y={toY(0.5, -3, 3)}
          width={plotW}
          height={toY(-0.5, -3, 3) - toY(0.5, -3, 3)}
          fill="#22c55e"
          fillOpacity={0.08}
        />

        {/* PMV line */}
        <polyline points={pmvLine} fill="none" stroke="#f59e0b" strokeWidth={2} />
        {/* Load line */}
        <polyline points={loadLine} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="4,2" />
        {/* PPD line (scaled to same visual range) */}
        <polyline points={ppdLine} fill="none" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="2,2" />

        {/* Waypoint markers */}
        {result.waypoints.map((wp, i) => (
          <circle
            key={i}
            cx={toX(wp.cumulativeDistanceM)}
            cy={toY(wp.pmv, -3, 3)}
            r={hoveredWaypoint === i ? 5 : 3}
            fill={wp.isAlert ? "#ef4444" : "#f59e0b"}
            stroke="#fff"
            strokeWidth={1}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoveredWaypoint(i)}
            onMouseLeave={() => setHoveredWaypoint(null)}
          />
        ))}

        {/* X axis label */}
        <text x={padL + plotW / 2} y={chartH - 5} textAnchor="middle" fill="#999" fontSize={11}>
          Distance (m)
        </text>

        {/* Y axis labels */}
        <text x={5} y={padT + plotH / 2} textAnchor="start" fill="#999" fontSize={10} transform={`rotate(-90, 12, ${padT + plotH / 2})`}>
          PMV / Load
        </text>

        {/* Legend */}
        <g transform={`translate(${padL + 10}, ${padT + 5})`}>
          <line x1={0} y1={0} x2={15} y2={0} stroke="#f59e0b" strokeWidth={2} />
          <text x={20} y={4} fill="#f59e0b" fontSize={10}>PMV</text>
          <line x1={70} y1={0} x2={85} y2={0} stroke="#ef4444" strokeWidth={2} strokeDasharray="4,2" />
          <text x={90} y={4} fill="#ef4444" fontSize={10}>Load</text>
          <line x1={130} y1={0} x2={145} y2={0} stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="2,2" />
          <text x={150} y={4} fill="#8b5cf6" fontSize={10}>PPD%</text>
        </g>
      </svg>
    );
  };

  // ---- Main render ----
  return (
    <div className="space-y-6">
      {/* Configuration panel */}
      <div className="sa-card p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Route Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Cohort selector */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Agent Cohort</label>
            <select
              className="sa-input w-full"
              value={selectedCohort.id}
              onChange={(e) => {
                const c = DEFAULT_COHORTS.find((c) => c.id === e.target.value);
                if (c) setSelectedCohort(c);
              }}
            >
              {DEFAULT_COHORTS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.profile.mbti})
                </option>
              ))}
            </select>
          </div>

          {/* Origin selector */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Origin Space</label>
            <select
              className="sa-input w-full"
              value={originId}
              onChange={(e) => setOriginId(e.target.value)}
            >
              <option value="">Select origin...</option>
              {Array.from(floorGroups.entries())
                .sort(([a], [b]) => a - b)
                .map(([floor, floorRooms]) => (
                  <optgroup key={floor} label={`${floor === 0 ? "G" : floor}/F`}>
                    {floorRooms.map((r) => (
                      <option key={r.spaceId} value={r.spaceId}>
                        {r.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </div>

          {/* Destination selector */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Destination Space</label>
            <select
              className="sa-input w-full"
              value={destId}
              onChange={(e) => setDestId(e.target.value)}
            >
              <option value="">Select destination...</option>
              {Array.from(floorGroups.entries())
                .sort(([a], [b]) => a - b)
                .map(([floor, floorRooms]) => (
                  <optgroup key={floor} label={`${floor === 0 ? "G" : floor}/F`}>
                    {floorRooms.map((r) => (
                      <option key={r.spaceId} value={r.spaceId} disabled={r.spaceId === originId}>
                        {r.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </div>
        </div>

        {/* MBTI info */}
        <div className="mt-3 flex items-center gap-4 text-sm text-gray-400">
          <span>
            MBTI: <strong className="text-white">{selectedCohort.profile.mbti}</strong>
          </span>
          <span>
            {selectedCohort.profile.mbti.startsWith("I") ? (
              <span className="text-blue-400">Introvert — avoids crowded routes</span>
            ) : (
              <span className="text-yellow-400">Extravert — prefers lively routes</span>
            )}
          </span>
          {selectedCohort.profile.mbti.length >= 3 && selectedCohort.profile.mbti[2] === "F" && (
            <span className="text-red-400">Feeling type — sensitive to environmental stress</span>
          )}
        </div>

        {/* Run button */}
        <div className="mt-4">
          <button
            className="sa-btn sa-btn-primary"
            onClick={handleRun}
            disabled={isRunning || !originId || !destId || originId === destId}
          >
            {isRunning ? "Simulating..." : "Run Route Simulation"}
          </button>
          {originId === destId && originId && (
            <span className="ml-3 text-sm text-red-400">Origin and destination must be different</span>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="sa-card p-3 text-center">
              <div className="text-2xl font-bold text-white">
                {Math.round(result.totalComfortScore * 100)}%
              </div>
              <div className="text-xs text-gray-400">Comfort Score</div>
            </div>
            <div className="sa-card p-3 text-center">
              <div className="text-2xl font-bold text-white">{result.totalDistanceM}m</div>
              <div className="text-xs text-gray-400">Distance</div>
            </div>
            <div className="sa-card p-3 text-center">
              <div className="text-2xl font-bold text-white">{result.estimatedTimeSec}s</div>
              <div className="text-xs text-gray-400">Est. Time</div>
            </div>
            <div className="sa-card p-3 text-center">
              <div className="text-2xl font-bold text-white">{result.waypoints.length}</div>
              <div className="text-xs text-gray-400">Waypoints</div>
            </div>
            <div className="sa-card p-3 text-center">
              <div className="text-2xl font-bold text-white">{result.computeTimeMs}ms</div>
              <div className="text-xs text-gray-400">Compute Time</div>
            </div>
          </div>

          {/* Best / Worst points */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="sa-card p-3 border-l-4 border-green-500">
              <div className="text-sm text-green-400 font-semibold mb-1">Best Point</div>
              <div className="text-white font-medium">{result.bestPoint.roomName}</div>
              <div className="text-sm text-gray-400">
                PMV {result.bestPoint.pmv} | PPD {result.bestPoint.ppd}% | Load{" "}
                {result.bestPoint.aggregateLoad}
              </div>
            </div>
            <div className="sa-card p-3 border-l-4 border-red-500">
              <div className="text-sm text-red-400 font-semibold mb-1">Worst Point</div>
              <div className="text-white font-medium">{result.worstPoint.roomName}</div>
              <div className="text-sm text-gray-400">
                PMV {result.worstPoint.pmv} | PPD {result.worstPoint.ppd}% | Load{" "}
                {result.worstPoint.aggregateLoad}
              </div>
            </div>
          </div>

          {/* Floor plan with route */}
          <div className="sa-card p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Route Visualization</h3>
            <div className="flex gap-2 mb-2 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500" /> Start
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500" /> End
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full bg-yellow-500" /> Waypoint
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full bg-red-500" /> Alert
              </span>
            </div>
            {renderFloorPlan()}
            {hoveredWaypoint !== null && result.waypoints[hoveredWaypoint] && (
              <div className="mt-2 p-2 bg-gray-800 rounded text-sm">
                <strong className="text-white">
                  #{hoveredWaypoint}: {result.waypoints[hoveredWaypoint].roomName}
                </strong>
                <span className="text-gray-400 ml-2">
                  PMV {result.waypoints[hoveredWaypoint].pmv} | PPD{" "}
                  {result.waypoints[hoveredWaypoint].ppd}% | Load{" "}
                  {result.waypoints[hoveredWaypoint].aggregateLoad} |{" "}
                  {result.waypoints[hoveredWaypoint].cumulativeDistanceM}m
                </span>
              </div>
            )}
          </div>

          {/* Comfort timeline */}
          <div className="sa-card p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Comfort Timeline</h3>
            <p className="text-sm text-gray-400 mb-2">
              PMV, Perceptual Load, and PPD along the route. Green zone = PMV comfort range [-0.5, +0.5].
            </p>
            {renderComfortTimeline()}
          </div>

          {/* Waypoint detail table */}
          <div className="sa-card p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Waypoint Details</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left py-2 px-2">#</th>
                    <th className="text-left py-2 px-2">Space</th>
                    <th className="text-left py-2 px-2">Floor</th>
                    <th className="text-right py-2 px-2">Dist (m)</th>
                    <th className="text-right py-2 px-2">PMV</th>
                    <th className="text-right py-2 px-2">PPD%</th>
                    <th className="text-right py-2 px-2">Load</th>
                    <th className="text-left py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.waypoints.map((wp, i) => (
                    <tr
                      key={i}
                      className={`border-b border-gray-800 ${
                        hoveredWaypoint === i ? "bg-gray-800" : ""
                      } ${wp.isAlert ? "bg-red-900/20" : ""}`}
                      onMouseEnter={() => setHoveredWaypoint(i)}
                      onMouseLeave={() => setHoveredWaypoint(null)}
                    >
                      <td className="py-1.5 px-2 text-gray-500">{i}</td>
                      <td className="py-1.5 px-2">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: CATEGORY_COLORS[wp.category] ?? "#6b7280" }}
                          />
                          <span className="text-white">{wp.roomName}</span>
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-gray-400">
                        {wp.floorIndex === 0 ? "G" : wp.floorIndex}/F
                      </td>
                      <td className="py-1.5 px-2 text-right text-gray-400">
                        {wp.cumulativeDistanceM}
                      </td>
                      <td
                        className={`py-1.5 px-2 text-right ${
                          Math.abs(wp.pmv) > 0.5 ? "text-red-400" : "text-green-400"
                        }`}
                      >
                        {wp.pmv > 0 ? "+" : ""}
                        {wp.pmv}
                      </td>
                      <td
                        className={`py-1.5 px-2 text-right ${
                          wp.ppd > 10 ? "text-red-400" : "text-gray-300"
                        }`}
                      >
                        {wp.ppd}
                      </td>
                      <td
                        className={`py-1.5 px-2 text-right ${
                          wp.aggregateLoad > 0.7
                            ? "text-red-400"
                            : wp.aggregateLoad > 0.5
                              ? "text-yellow-400"
                              : "text-green-400"
                        }`}
                      >
                        {wp.aggregateLoad}
                      </td>
                      <td className="py-1.5 px-2">
                        {wp.isAlert ? (
                          <span className="text-red-400 text-xs">ALERT</span>
                        ) : (
                          <span className="text-green-400 text-xs">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* LLM Narrative */}
          <div className="sa-card p-4" ref={narrativeRef}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Experience Narrative</h3>
              <div className="flex gap-2">
                {narrative && (
                  <button className="sa-btn sa-btn-ghost text-sm" onClick={handleCopyNarrative}>
                    Copy
                  </button>
                )}
                <button
                  className="sa-btn sa-btn-primary text-sm"
                  onClick={handleGenerateNarrative}
                  disabled={isGeneratingNarrative}
                >
                  {isGeneratingNarrative
                    ? "Generating..."
                    : narrative
                      ? "Regenerate"
                      : "Generate with AI"}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              AI-generated first-person narrative based on the route simulation results.
              Uses {selectedCohort.label}'s MBTI ({selectedCohort.profile.mbti}) personality for perspective.
            </p>
            {narrative && (
              <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">{narrative}</p>
              </div>
            )}
            {narrativeError && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">
                Error: {narrativeError}
              </div>
            )}
            {!narrative && !narrativeError && !isGeneratingNarrative && (
              <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 border-dashed text-center text-gray-500">
                Click "Generate with AI" to create an experience narrative
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
