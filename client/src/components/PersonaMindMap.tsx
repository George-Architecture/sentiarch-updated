// ============================================================
// PersonaMindMap Component
// Design: Academic Instrument Dashboard (Neumorphism)
// ============================================================

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import type {
  PersonaData,
  ExperienceData,
  AccumulatedState,
  ComputedOutputs,
} from "@/lib/store";
import SliderField from "@/components/SliderField";

// ---- Inline Editable Field ----
function EditableField({
  value,
  onChange,
  type = "text",
  suffix,
  options,
  highlight,
}: {
  value: string | number;
  onChange: (val: string) => void;
  type?: "text" | "number" | "time" | "select";
  suffix?: string;
  options?: { value: string; label: string }[];
  highlight?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      if (ref.current instanceof HTMLInputElement) ref.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== String(value)) onChange(draft);
  };

  if (editing) {
    if (type === "select" && options) {
      return (
        <select
          ref={ref as React.RefObject<HTMLSelectElement>}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}
          className="sa-input"
          style={{ minWidth: 80, fontSize: "13px" }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type={type === "time" ? "time" : type === "number" ? "number" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        step={type === "number" ? "any" : undefined}
        className="sa-input text-right"
        style={{
          width: type === "time" ? 90 : Math.max(60, String(value).length * 10 + 30),
          fontSize: "13px",
        }}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="cursor-pointer px-2 py-0.5 rounded-md transition-all"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "13px",
        fontWeight: 600,
        color: highlight ? "var(--destructive)" : "var(--foreground)",
      }}
      title="Click to edit"
    >
      {value}
      {suffix && <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 3 }}>{suffix}</span>}
    </span>
  );
}

// ---- Row Components ----
function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sa-data-row">
      <span className="sa-data-row-label">{label}</span>
      {children}
    </div>
  );
}

function StaticRow({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="sa-data-row">
      <span className="sa-data-row-label">{label}</span>
      <span className="sa-data-row-value">
        {value}
        {unit && <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  );
}

// ---- Perceptual Load Bar ----
function LoadBar({ label, value, prevValue }: { label: string; value: number; prevValue?: number }) {
  const getColor = (v: number) => {
    if (v <= 0.3) return "#2E8B6A";
    if (v <= 0.6) return "#D4A017";
    return "#C44040";
  };
  const color = getColor(value);
  const hasPrev = prevValue != null && prevValue !== 0;
  const delta = hasPrev ? value - (prevValue ?? 0) : 0;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs font-medium w-16 shrink-0" style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <div className="flex-1 sa-slider-track" style={{ height: 6 }}>
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          width: `${value * 100}%`, background: color,
          borderRadius: 4, transition: "width 0.5s ease",
        }} />
      </div>
      <span className="text-xs w-7 text-right shrink-0" style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 600,
        color: "var(--foreground)",
      }}>
        {value.toFixed(1)}
      </span>
      {hasPrev && Math.abs(delta) >= 0.01 && (
        <span className="text-xs w-10 text-right shrink-0" style={{
          fontWeight: 600,
          color: delta > 0 ? "#C44040" : "#2E8B6A",
        }}>
          {delta > 0 ? "+" : ""}{delta.toFixed(1)}
        </span>
      )}
    </div>
  );
}

// ---- Section Tag ----
function SectionTag({ label, icon, color }: { label: string; icon: string; color?: string }) {
  const c = color || "var(--primary)";
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 mb-3 rounded-md"
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "1.2px",
        textTransform: "uppercase" as const,
        color: c,
        border: `1.5px solid ${c}`,
        background: `${c}10`,
        boxShadow: `1px 1px 3px ${c}15`,
      }}
    >
      <span style={{ fontSize: "12px" }}>{icon}</span> {label}
    </div>
  );
}

// ---- Panel Box ----
function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`sa-panel ${className}`}>
      {children}
    </div>
  );
}

// ---- Intervention Arrow Mock-up ----
function InterventionArrow() {
  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px dashed var(--border)" }}>
      <div className="text-xs font-semibold tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>
        DESIGN INTERVENTION
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 p-3 text-center rounded-lg" style={{
          background: "var(--muted)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-inset)",
        }}>
          <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>BEFORE</div>
          <div className="text-xl font-bold" style={{ color: "#C44040", fontFamily: "'JetBrains Mono', monospace" }}>4</div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Comfort</div>
        </div>

        <div className="flex flex-col items-center gap-1.5 px-1">
          <span className="text-xs font-semibold px-2 py-1 rounded" style={{
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            fontSize: "9px",
            letterSpacing: "0.5px",
          }}>+WINDOW</span>
          <svg width="40" height="12" viewBox="0 0 40 12">
            <defs>
              <marker id="arrowhead2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--primary)" />
              </marker>
            </defs>
            <line x1="2" y1="6" x2="32" y2="6" stroke="var(--primary)" strokeWidth="2" markerEnd="url(#arrowhead2)" />
          </svg>
          <span className="text-xs font-semibold px-2 py-1 rounded" style={{
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            fontSize: "9px",
            letterSpacing: "0.5px",
          }}>+LIGHT</span>
        </div>

        <div className="flex-1 p-3 text-center rounded-lg" style={{
          background: "var(--muted)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-inset)",
        }}>
          <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>AFTER</div>
          <div className="text-xl font-bold" style={{ color: "#2E8B6A", fontFamily: "'JetBrains Mono', monospace" }}>7</div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Comfort</div>
        </div>
      </div>
      <div className="text-xs mt-2 text-center" style={{ color: "var(--muted-foreground)", letterSpacing: "0.5px" }}>
        Mock-up: Intervention Feedback Loop
      </div>
    </div>
  );
}

// ---- PMV Validity Warnings ----
function PMVWarnings({ computedOutputs }: { computedOutputs: ComputedOutputs }) {
  const warnings = computedOutputs.pmv_warnings || [];
  if (warnings.length === 0) return null;

  return (
    <div className="mt-3 px-3 py-2.5 rounded-lg" style={{
      background: "#FFF8E1",
      border: "1px solid #E8D48A",
      boxShadow: "inset 1px 1px 3px rgba(0,0,0,0.03)",
    }}>
      <div className="text-xs font-semibold mb-1" style={{ color: "#8A6D00", letterSpacing: "0.5px" }}>
        PMV Validity Notes
      </div>
      {warnings.map((w, i) => (
        <div key={i} className="text-xs" style={{ color: "#6B5500", lineHeight: 1.6 }}>
          {w}
        </div>
      ))}
    </div>
  );
}

// ---- Main Component ----
export default function PersonaMindMap({
  persona,
  experience,
  accumulatedState,
  computedOutputs,
  ruleTriggers,
  prevExperience,
  prevAccumulatedState,
  onPersonaChange,
  hasSimulated = true,
  personaColor,
  agentPlaced = false,
}: {
  persona: PersonaData;
  experience: ExperienceData;
  accumulatedState: AccumulatedState;
  computedOutputs: ComputedOutputs;
  ruleTriggers: string[];
  prevExperience: ExperienceData | null;
  prevAccumulatedState: AccumulatedState | null;
  onPersonaChange: (p: PersonaData) => void;
  hasSimulated?: boolean;
  personaColor?: { primary: string; secondary: string; bg: string; label: string };
  agentPlaced?: boolean;
}) {
  const { agent, position, environment, spatial } = persona;
  const containerRef = useRef<HTMLDivElement>(null);

  const updateAgent = useCallback((key: string, val: string) => {
    const parsed = ["age", "metabolic_rate", "clothing_insulation"].includes(key) ? parseFloat(val) || 0 : val;
    onPersonaChange({ ...persona, agent: { ...persona.agent, [key]: parsed } });
  }, [persona, onPersonaChange]);

  const updatePosition = useCallback((key: string, val: string) => {
    const parsed = ["duration_in_cell"].includes(key) ? parseInt(val) || 0 : val;
    onPersonaChange({ ...persona, position: { ...persona.position, [key]: parsed } });
  }, [persona, onPersonaChange]);

  const updateEnv = useCallback((key: string, val: string) => {
    onPersonaChange({ ...persona, environment: { ...persona.environment, [key]: parseFloat(val) || 0 } });
  }, [persona, onPersonaChange]);

  const updateSpatial = useCallback((key: string, val: string) => {
    onPersonaChange({ ...persona, spatial: { ...persona.spatial, [key]: parseFloat(val) || 0 } });
  }, [persona, onPersonaChange]);

  const comfortDelta = hasSimulated && prevExperience && prevExperience.comfort_score > 0
    ? experience.comfort_score - prevExperience.comfort_score : null;

  const mbtiOptions = [
    "ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP",
    "ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ",
  ].map((m) => ({ value: m, label: m }));

  const getComfortColor = (score: number) => {
    if (score === 0) return { bg: "var(--muted)", text: "var(--muted-foreground)" };
    if (score <= 3) return { bg: "#C44040", text: "#FFFFFF" };
    if (score <= 5) return { bg: "#D4A017", text: "#FFFFFF" };
    if (score <= 7) return { bg: "#2A8F7E", text: "#FFFFFF" };
    return { bg: "#1D6B5E", text: "#FFFFFF" };
  };

  const getTrendInfo = (trend: string) => {
    if (trend === "declining") return { icon: "▼", label: "Declining", color: "#C44040" };
    if (trend === "rising") return { icon: "▲", label: "Improving", color: "#1D6B5E" };
    return { icon: "—", label: "Stable", color: "var(--muted-foreground)" };
  };

  const accentColor = personaColor?.primary || "var(--primary)";

  return (
    <div ref={containerRef} className="w-full">
      <div className="grid grid-cols-12 gap-4">

        {/* ---- AGENT ---- */}
        <div className="col-span-12 md:col-span-5">
          <SectionTag label="AGENT" icon="●" color={accentColor} />
          <Panel>
            <DataRow label="ID">
              <EditableField value={agent.id} onChange={(v) => updateAgent("id", v)} type="text" />
            </DataRow>
            <DataRow label="Age">
              <EditableField value={agent.age} onChange={(v) => updateAgent("age", v)} />
            </DataRow>
            <DataRow label="Gender">
              <EditableField value={agent.gender} onChange={(v) => updateAgent("gender", v)} type="select"
                options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }]} />
            </DataRow>
            <DataRow label="MBTI">
              <EditableField value={agent.mbti} onChange={(v) => updateAgent("mbti", v)} type="select" options={mbtiOptions} />
            </DataRow>
            <DataRow label="Mobility">
              <EditableField value={agent.mobility} onChange={(v) => updateAgent("mobility", v)} type="select"
                options={[
                  { value: "normal", label: "Normal" }, { value: "walker", label: "Walker" },
                  { value: "wheelchair", label: "Wheelchair" }, { value: "cane", label: "Cane" },
                ]} />
            </DataRow>
            <DataRow label="Hearing">
              <EditableField value={agent.hearing} onChange={(v) => updateAgent("hearing", v)} type="select"
                options={[
                  { value: "normal", label: "Normal" }, { value: "impaired", label: "Impaired" },
                  { value: "deaf", label: "Deaf" },
                ]} />
            </DataRow>
            <DataRow label="Vision">
              <EditableField value={agent.vision} onChange={(v) => updateAgent("vision", v)} type="select"
                options={[
                  { value: "normal", label: "Normal" },
                  { value: "mild_impairment", label: "Mild Impairment" },
                  { value: "severe_impairment", label: "Severe Impairment" },
                ]} />
            </DataRow>
            <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <SliderField label="Metabolic Rate (Met)" value={agent.metabolic_rate} min={0.8} max={4} step={0.05}
                onChange={(v) => updateAgent("metabolic_rate", String(v))} color={accentColor} />
              <SliderField label="Clothing (Clo)" value={agent.clothing_insulation} min={0} max={2} step={0.05}
                onChange={(v) => updateAgent("clothing_insulation", String(v))} color={accentColor} />
            </div>
          </Panel>
        </div>

        {/* ---- POSITION ---- */}
        <div className="col-span-12 md:col-span-3">
          <SectionTag label="POSITION" icon="◇" color="#D4A017" />
          <Panel>
            <StaticRow label="Cell" value={`[${position.cell[0]}, ${position.cell[1]}]`} />
            <DataRow label="Time">
              <EditableField value={position.timestamp} onChange={(v) => updatePosition("timestamp", v)} type="time" />
            </DataRow>
            <DataRow label="Duration">
              <EditableField value={position.duration_in_cell} onChange={(v) => updatePosition("duration_in_cell", v)} suffix="min" />
            </DataRow>
          </Panel>
        </div>

        {/* ---- ENVIRONMENT ---- */}
        <div className="col-span-12 md:col-span-4">
          <SectionTag label="ENVIRONMENT" icon="◉" color="#1D6B5E" />
          <Panel>
            <SliderField label="Light (Lux)" value={environment.lux} min={0} max={2000} step={10}
              onChange={(v) => updateEnv("lux", String(v))} color="#D4A017" />
            <SliderField label="Noise (dB)" value={environment.dB} min={0} max={120} step={1} suffix="dB"
              onChange={(v) => updateEnv("dB", String(v))} color="#C44040" />
            <SliderField label="Temperature" value={environment.air_temp} min={10} max={35} step={0.5} suffix="°C"
              onChange={(v) => updateEnv("air_temp", String(v))} color="#1D6B5E" />
            <SliderField label="Humidity" value={environment.humidity} min={0} max={100} step={1} suffix="%"
              onChange={(v) => updateEnv("humidity", String(v))} color="#4A90B8" />
            <SliderField label="Air Velocity" value={environment.air_velocity} min={0} max={2} step={0.01} suffix="m/s"
              onChange={(v) => updateEnv("air_velocity", String(v))} color="#2E8B6A" />
          </Panel>
        </div>

        {/* ---- PERSONA CARD ---- */}
        <div className="col-span-12 flex justify-center my-4">
          <div className="px-8 py-4 text-center rounded-xl" style={{
            background: accentColor,
            color: "#FFFFFF",
            border: `2px solid ${accentColor}`,
            boxShadow: `4px 4px 16px ${accentColor}30, 0 2px 8px rgba(0,0,0,0.1)`,
          }}>
            <div className="text-base font-bold">{agent.id}</div>
            <div className="text-sm mt-1" style={{ opacity: 0.85, fontFamily: "'JetBrains Mono', monospace" }}>
              {agent.age}{agent.gender === "female" ? "F" : "M"} · {agent.mobility} · {agent.mbti}
            </div>
          </div>
        </div>

        {/* ---- ENV. SATISFACTION ---- */}
        <div className="col-span-12 md:col-span-5">
          <SectionTag label="ENV. SATISFACTION" icon="◌" color="#1D6B5E" />
          <Panel>
            <p className="text-sm italic mb-3" style={{ color: "var(--foreground)", lineHeight: 1.7 }}>
              "{experience.summary}"
            </p>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {/* Comfort score badge */}
              <span className="text-xs font-bold px-4 py-2 rounded-lg" style={{
                background: getComfortColor(experience.comfort_score).bg,
                color: getComfortColor(experience.comfort_score).text,
                boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                letterSpacing: "0.5px",
              }}>
                COMFORT {experience.comfort_score}/10
              </span>
              {comfortDelta !== null && Math.abs(comfortDelta) >= 0.1 && (
                <span className="text-xs font-bold px-3 py-2 rounded-lg" style={{
                  background: comfortDelta > 0 ? "#1D6B5E" : "#C44040",
                  color: "#FFFFFF",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                }}>
                  {comfortDelta > 0 ? "+" : ""}{comfortDelta.toFixed(1)} vs prev
                </span>
              )}
              {/* Trend badge */}
              <span className="text-xs font-semibold px-3 py-2 rounded-lg" style={{
                background: "var(--muted)",
                color: getTrendInfo(experience.trend).color,
                border: "1px solid var(--border)",
              }}>
                {getTrendInfo(experience.trend).icon} {getTrendInfo(experience.trend).label}
              </span>
            </div>

            {prevExperience && prevExperience.comfort_score > 0 && (
              <div className="mb-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                Previous: Comfort {prevExperience.comfort_score} · {prevExperience.trend}
              </div>
            )}

            {ruleTriggers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {ruleTriggers.map((t) => (
                  <span key={t} className="sa-tag text-xs">
                    {t}
                  </span>
                ))}
              </div>
            )}

            <InterventionArrow />
          </Panel>
        </div>

        {/* ---- SPATIAL ---- */}
        <div className="col-span-12 md:col-span-3">
          <SectionTag label="SPATIAL" icon="□" color="#D4A017" />
          <Panel>
            <StaticRow
              label="→ Wall"
              value={!agentPlaced || spatial.dist_to_wall < 0 ? "—" : spatial.dist_to_wall}
              unit={!agentPlaced || spatial.dist_to_wall < 0 ? undefined : "m"}
            />
            <StaticRow
              label="→ Window"
              value={!agentPlaced || spatial.dist_to_window < 0 ? "—" : spatial.dist_to_window}
              unit={!agentPlaced || spatial.dist_to_window < 0 ? undefined : "m"}
            />
            <StaticRow
              label="→ Exit"
              value={!agentPlaced || spatial.dist_to_exit < 0 ? "—" : spatial.dist_to_exit}
              unit={!agentPlaced || spatial.dist_to_exit < 0 ? undefined : "m"}
            />
            <DataRow label="Ceiling">
              <EditableField value={spatial.ceiling_h} onChange={(v) => updateSpatial("ceiling_h", v)} suffix="m" />
            </DataRow>
            <StaticRow label="Enclosure" value={!agentPlaced ? "—" : spatial.enclosure_ratio} />
            <StaticRow label="Vis. Agents" value={!agentPlaced ? "—" : spatial.visible_agents} />
            <div className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>Auto-calculated from map</div>
          </Panel>
        </div>

        {/* ---- COMPUTED ---- */}
        <div className="col-span-12 md:col-span-4">
          <SectionTag label="COMPUTED" icon="⊕" color="#1D6B5E" />
          <Panel>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "PMV", value: computedOutputs.PMV, tooltip: "Predicted Mean Vote (Fanger/ISO 7730)" },
                { label: "PPD", value: `${computedOutputs.PPD}%`, tooltip: "Predicted Percentage Dissatisfied" },
                { label: "Eff. Lux", value: computedOutputs.effective_lux, tooltip: "Effective Lux (vision-adjusted)" },
                { label: "Pr. dB", value: computedOutputs.perceived_dB, tooltip: "Perceived dB (hearing-adjusted)" },
              ].map((item) => (
                <div key={item.label} className="p-3 text-center rounded-lg" title={item.tooltip}
                  style={{
                    background: "var(--muted)",
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow-inset)",
                  }}>
                  <div className="text-xs font-semibold" style={{ color: "var(--muted-foreground)", letterSpacing: "0.5px" }}>{item.label}</div>
                  <div className="text-xl font-bold mt-1" style={{ color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</div>
                </div>
              ))}
            </div>
            <PMVWarnings computedOutputs={computedOutputs} />
            <div className="mt-3 text-xs text-center" style={{ color: "var(--muted-foreground)", letterSpacing: "0.3px" }}>
              PMV/PPD: ISO 7730 Fanger Model
            </div>
          </Panel>
        </div>

        {/* ---- PERCEPTUAL LOAD ---- */}
        <div className="col-span-12">
          <SectionTag label="PERCEPTUAL LOAD" icon="▐" color="#C44040" />
          <Panel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <LoadBar label="Thermal" value={accumulatedState.thermal_discomfort} prevValue={prevAccumulatedState?.thermal_discomfort} />
              <LoadBar label="Visual" value={accumulatedState.visual_strain} prevValue={prevAccumulatedState?.visual_strain} />
              <LoadBar label="Noise" value={accumulatedState.noise_stress} prevValue={prevAccumulatedState?.noise_stress} />
              <LoadBar label="Social" value={accumulatedState.social_overload} prevValue={prevAccumulatedState?.social_overload} />
              <LoadBar label="Fatigue" value={accumulatedState.fatigue} prevValue={prevAccumulatedState?.fatigue} />
              <LoadBar label="Wayfind." value={accumulatedState.wayfinding_anxiety} prevValue={prevAccumulatedState?.wayfinding_anxiety} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
