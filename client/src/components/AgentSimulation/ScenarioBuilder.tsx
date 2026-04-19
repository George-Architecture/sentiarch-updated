/**
 * SentiArch — Scenario Builder
 *
 * Allows the architect to define agent cohorts, tasks, and room environment
 * overrides for the batch simulation.
 */
import { useState } from "react";
import type {
  AgentCohort,
  SimulationTask,
  RoomEnvironment,
  SimulationConfig,
} from "../../types/simulation";
import {
  DEFAULT_COHORTS,
  DEFAULT_TASKS,
  DEFAULT_ROOM_ENVIRONMENTS,
  ROOM_SPECIFIC_ENVIRONMENTS,
} from "../../types/simulation";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScenarioBuilderProps {
  /** Available room IDs from the layout */
  availableRooms: { spaceId: string; name: string; category: string }[];
  /** Callback when user starts simulation */
  onRunSimulation: (config: SimulationConfig) => void;
  /** Whether simulation is currently running */
  isRunning: boolean;
}

// ---------------------------------------------------------------------------
// Cohort Editor Row
// ---------------------------------------------------------------------------

function CohortRow({
  cohort,
  onUpdate,
  onRemove,
}: {
  cohort: AgentCohort;
  onUpdate: (c: AgentCohort) => void;
  onRemove: () => void;
}) {
  return (
    <tr>
      <td style={{ padding: "4px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: cohort.colorHex,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <input
            className="sa-input"
            value={cohort.label}
            onChange={(e) => onUpdate({ ...cohort, label: e.target.value })}
            style={{ width: 140, fontSize: 12, padding: "2px 6px" }}
          />
        </div>
      </td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>
        <input
          className="sa-input"
          type="number"
          value={cohort.profile.age}
          onChange={(e) =>
            onUpdate({
              ...cohort,
              profile: { ...cohort.profile, age: parseInt(e.target.value) || 20 },
            })
          }
          style={{ width: 50, fontSize: 12, padding: "2px 4px", textAlign: "center" }}
        />
      </td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>
        <select
          className="sa-input"
          value={cohort.profile.gender}
          onChange={(e) =>
            onUpdate({
              ...cohort,
              profile: { ...cohort.profile, gender: e.target.value as "male" | "female" },
            })
          }
          style={{ fontSize: 12, padding: "2px 4px" }}
        >
          <option value="male">M</option>
          <option value="female">F</option>
        </select>
      </td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>
        <select
          className="sa-input"
          value={cohort.profile.mobility}
          onChange={(e) =>
            onUpdate({
              ...cohort,
              profile: {
                ...cohort.profile,
                mobility: e.target.value as AgentCohort["profile"]["mobility"],
              },
            })
          }
          style={{ fontSize: 12, padding: "2px 4px" }}
        >
          <option value="normal">Normal</option>
          <option value="walker">Walker</option>
          <option value="wheelchair">Wheelchair</option>
          <option value="cane">Cane</option>
        </select>
      </td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>
        <input
          className="sa-input"
          type="number"
          value={cohort.count}
          min={1}
          onChange={(e) => onUpdate({ ...cohort, count: parseInt(e.target.value) || 1 })}
          style={{ width: 40, fontSize: 12, padding: "2px 4px", textAlign: "center" }}
        />
      </td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>
        <input
          className="sa-input"
          type="number"
          step={0.1}
          value={cohort.profile.metabolic_rate}
          onChange={(e) =>
            onUpdate({
              ...cohort,
              profile: { ...cohort.profile, metabolic_rate: parseFloat(e.target.value) || 1.0 },
            })
          }
          style={{ width: 50, fontSize: 12, padding: "2px 4px", textAlign: "center" }}
        />
      </td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>
        <button className="sa-btn sa-btn-sm" onClick={onRemove} style={{ fontSize: 11, padding: "2px 8px" }}>
          Remove
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Task Editor Row
// ---------------------------------------------------------------------------

function TaskRow({
  task,
  rooms,
  onUpdate,
  onRemove,
}: {
  task: SimulationTask;
  rooms: { spaceId: string; name: string }[];
  onUpdate: (t: SimulationTask) => void;
  onRemove: () => void;
}) {
  return (
    <tr>
      <td style={{ padding: "4px 8px" }}>
        <input
          className="sa-input"
          value={task.label}
          onChange={(e) => onUpdate({ ...task, label: e.target.value })}
          style={{ width: 180, fontSize: 12, padding: "2px 6px" }}
        />
      </td>
      <td style={{ padding: "4px 8px" }}>
        <select
          className="sa-input"
          value={task.originSpaceId}
          onChange={(e) => onUpdate({ ...task, originSpaceId: e.target.value })}
          style={{ fontSize: 12, padding: "2px 4px", maxWidth: 140 }}
        >
          {rooms.map((r) => (
            <option key={r.spaceId} value={r.spaceId}>
              {r.name}
            </option>
          ))}
        </select>
      </td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>→</td>
      <td style={{ padding: "4px 8px" }}>
        <select
          className="sa-input"
          value={task.destinationSpaceId}
          onChange={(e) => onUpdate({ ...task, destinationSpaceId: e.target.value })}
          style={{ fontSize: 12, padding: "2px 4px", maxWidth: 140 }}
        >
          {rooms.map((r) => (
            <option key={r.spaceId} value={r.spaceId}>
              {r.name}
            </option>
          ))}
        </select>
      </td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>
        <input
          className="sa-input"
          type="number"
          value={task.dwellMinutes}
          min={1}
          onChange={(e) => onUpdate({ ...task, dwellMinutes: parseInt(e.target.value) || 10 })}
          style={{ width: 50, fontSize: 12, padding: "2px 4px", textAlign: "center" }}
        />
      </td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>
        <button className="sa-btn sa-btn-sm" onClick={onRemove} style={{ fontSize: 11, padding: "2px 8px" }}>
          Remove
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ScenarioBuilder({ availableRooms, onRunSimulation, isRunning }: ScenarioBuilderProps) {
  const [cohorts, setCohorts] = useState<AgentCohort[]>(DEFAULT_COHORTS);
  const [tasks, setTasks] = useState<SimulationTask[]>(() => {
    // Filter default tasks to only include rooms that exist in the layout
    const roomIds = new Set(availableRooms.map((r) => r.spaceId));
    return DEFAULT_TASKS.filter(
      (t) => roomIds.has(t.originSpaceId) || roomIds.has(t.destinationSpaceId),
    );
  });
  const [showEnvOverrides, setShowEnvOverrides] = useState(false);
  const [envOverrides, setEnvOverrides] = useState<RoomEnvironment[]>([]);

  const totalScenarios = cohorts.length * tasks.length;

  // Add cohort
  const addCohort = () => {
    const idx = cohorts.length + 1;
    const hue = (idx * 137.508) % 360;
    const newCohort: AgentCohort = {
      id: `cohort-${idx}`,
      label: `New Cohort ${idx}`,
      count: 5,
      profile: {
        age: 30,
        gender: "male",
        mbti: "INTJ",
        mobility: "normal",
        hearing: "normal",
        vision: "normal",
        metabolic_rate: 1.2,
        clothing_insulation: 0.7,
      },
      colorHex: `hsl(${hue}, 50%, 45%)`.replace(/hsl\((\d+\.?\d*),\s*(\d+)%,\s*(\d+)%\)/, (_, h, s, l) => {
        // Convert HSL to hex
        const hVal = parseFloat(h);
        const sVal = parseInt(s) / 100;
        const lVal = parseInt(l) / 100;
        const a = sVal * Math.min(lVal, 1 - lVal);
        const f = (n: number) => {
          const k = (n + hVal / 30) % 12;
          const color = lVal - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
          return Math.round(255 * color)
            .toString(16)
            .padStart(2, "0");
        };
        return `#${f(0)}${f(8)}${f(4)}`;
      }),
    };
    setCohorts([...cohorts, newCohort]);
  };

  // Add task
  const addTask = () => {
    const idx = tasks.length + 1;
    const firstRoom = availableRooms[0]?.spaceId ?? "unknown";
    const lastRoom = availableRooms[availableRooms.length - 1]?.spaceId ?? "unknown";
    const newTask: SimulationTask = {
      id: `task-${idx}`,
      label: `New Task ${idx}`,
      originSpaceId: firstRoom,
      destinationSpaceId: lastRoom,
      dwellMinutes: 30,
      walkingSpeedFactor: 1.0,
    };
    setTasks([...tasks, newTask]);
  };

  // Initialize environment overrides from defaults
  const initEnvOverrides = () => {
    const overrides: RoomEnvironment[] = availableRooms.map((room) => {
      const catDefaults = DEFAULT_ROOM_ENVIRONMENTS[room.category] ?? DEFAULT_ROOM_ENVIRONMENTS["support"];
      const specific = ROOM_SPECIFIC_ENVIRONMENTS[room.spaceId] ?? {};
      return {
        spaceId: room.spaceId,
        airTemp: specific.airTemp ?? catDefaults.airTemp,
        humidity: catDefaults.humidity,
        airVelocity: catDefaults.airVelocity,
        lux: specific.lux ?? catDefaults.lux,
        noiseDb: specific.noiseDb ?? catDefaults.noiseDb,
        ceilingHeight: 3.6,
      };
    });
    setEnvOverrides(overrides);
    setShowEnvOverrides(true);
  };

  // Run simulation
  const handleRun = () => {
    onRunSimulation({
      cohorts,
      tasks,
      roomEnvironments: envOverrides,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Cohorts Section */}
      <div className="sa-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Agent Cohorts ({cohorts.length})</h3>
          <button className="sa-btn sa-btn-sm" onClick={addCohort}>
            + Add Cohort
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--sa-border)" }}>
                <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600 }}>Label</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600 }}>Age</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600 }}>Gender</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600 }}>Mobility</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600 }}>Count</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600 }}>Met</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort, i) => (
                <CohortRow
                  key={cohort.id}
                  cohort={cohort}
                  onUpdate={(updated) => {
                    const next = [...cohorts];
                    next[i] = updated;
                    setCohorts(next);
                  }}
                  onRemove={() => setCohorts(cohorts.filter((_, j) => j !== i))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tasks Section */}
      <div className="sa-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Tasks / Routes ({tasks.length})</h3>
          <button className="sa-btn sa-btn-sm" onClick={addTask}>
            + Add Task
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--sa-border)" }}>
                <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600 }}>Label</th>
                <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600 }}>Origin</th>
                <th style={{ padding: "4px 8px" }}></th>
                <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600 }}>Destination</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600 }}>Dwell (min)</th>
                <th style={{ padding: "4px 8px" }}></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  rooms={availableRooms}
                  onUpdate={(updated) => {
                    const next = [...tasks];
                    next[i] = updated;
                    setTasks(next);
                  }}
                  onRemove={() => setTasks(tasks.filter((_, j) => j !== i))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Environment Overrides */}
      <div className="sa-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Room Environments</h3>
          {!showEnvOverrides ? (
            <button className="sa-btn sa-btn-sm" onClick={initEnvOverrides}>
              Customize
            </button>
          ) : (
            <button className="sa-btn sa-btn-sm" onClick={() => setShowEnvOverrides(false)}>
              Hide
            </button>
          )}
        </div>
        {!showEnvOverrides && (
          <p style={{ fontSize: 12, color: "var(--sa-text-secondary)", margin: 0 }}>
            Using category defaults. Click Customize to override per-room.
          </p>
        )}
        {showEnvOverrides && (
          <div style={{ overflowX: "auto", maxHeight: 300, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--sa-border)", position: "sticky", top: 0, background: "var(--sa-bg)" }}>
                  <th style={{ padding: "4px 6px", textAlign: "left" }}>Room</th>
                  <th style={{ padding: "4px 6px", textAlign: "center" }}>Temp (°C)</th>
                  <th style={{ padding: "4px 6px", textAlign: "center" }}>RH (%)</th>
                  <th style={{ padding: "4px 6px", textAlign: "center" }}>Air (m/s)</th>
                  <th style={{ padding: "4px 6px", textAlign: "center" }}>Lux</th>
                  <th style={{ padding: "4px 6px", textAlign: "center" }}>Noise (dB)</th>
                </tr>
              </thead>
              <tbody>
                {envOverrides.map((env, i) => {
                  const room = availableRooms.find((r) => r.spaceId === env.spaceId);
                  return (
                    <tr key={env.spaceId} style={{ borderBottom: "1px solid var(--sa-border-light, #eee)" }}>
                      <td style={{ padding: "3px 6px", fontSize: 11 }}>{room?.name ?? env.spaceId}</td>
                      <td style={{ padding: "3px 6px", textAlign: "center" }}>
                        <input
                          className="sa-input"
                          type="number"
                          step={0.5}
                          value={env.airTemp}
                          onChange={(e) => {
                            const next = [...envOverrides];
                            next[i] = { ...env, airTemp: parseFloat(e.target.value) || 24 };
                            setEnvOverrides(next);
                          }}
                          style={{ width: 45, fontSize: 11, padding: "1px 3px", textAlign: "center" }}
                        />
                      </td>
                      <td style={{ padding: "3px 6px", textAlign: "center" }}>
                        <input
                          className="sa-input"
                          type="number"
                          value={env.humidity}
                          onChange={(e) => {
                            const next = [...envOverrides];
                            next[i] = { ...env, humidity: parseFloat(e.target.value) || 55 };
                            setEnvOverrides(next);
                          }}
                          style={{ width: 40, fontSize: 11, padding: "1px 3px", textAlign: "center" }}
                        />
                      </td>
                      <td style={{ padding: "3px 6px", textAlign: "center" }}>
                        <input
                          className="sa-input"
                          type="number"
                          step={0.05}
                          value={env.airVelocity}
                          onChange={(e) => {
                            const next = [...envOverrides];
                            next[i] = { ...env, airVelocity: parseFloat(e.target.value) || 0.1 };
                            setEnvOverrides(next);
                          }}
                          style={{ width: 45, fontSize: 11, padding: "1px 3px", textAlign: "center" }}
                        />
                      </td>
                      <td style={{ padding: "3px 6px", textAlign: "center" }}>
                        <input
                          className="sa-input"
                          type="number"
                          value={env.lux}
                          onChange={(e) => {
                            const next = [...envOverrides];
                            next[i] = { ...env, lux: parseInt(e.target.value) || 300 };
                            setEnvOverrides(next);
                          }}
                          style={{ width: 45, fontSize: 11, padding: "1px 3px", textAlign: "center" }}
                        />
                      </td>
                      <td style={{ padding: "3px 6px", textAlign: "center" }}>
                        <input
                          className="sa-input"
                          type="number"
                          value={env.noiseDb}
                          onChange={(e) => {
                            const next = [...envOverrides];
                            next[i] = { ...env, noiseDb: parseInt(e.target.value) || 55 };
                            setEnvOverrides(next);
                          }}
                          style={{ width: 40, fontSize: 11, padding: "1px 3px", textAlign: "center" }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scenario Matrix Summary + Run Button */}
      <div className="sa-card" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Scenario Matrix: </span>
          <span style={{ fontSize: 13 }}>
            {cohorts.length} cohorts × {tasks.length} tasks ={" "}
            <strong>{totalScenarios} scenarios</strong>
          </span>
        </div>
        <button
          className="sa-btn sa-btn-primary"
          onClick={handleRun}
          disabled={isRunning || cohorts.length === 0 || tasks.length === 0}
          style={{ minWidth: 160 }}
        >
          {isRunning ? "Running..." : `Run ${totalScenarios} Scenarios`}
        </button>
      </div>
    </div>
  );
}
