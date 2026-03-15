// ============================================================
// PersonaMindMap Component
// Design: Pixel Architecture Art
// Feedback addressed:
//   #1: "design intervention leading to change" arrow mock-up in Experience
//   #3: Perceptual load with computed defaults (not all zeros)
//   #4: Tab names (AGENT, POSITION, ENVIRONMENT) larger font
//   #5: "EXPERIENCE" renamed to "ENV. SATISFACTION" (short for Built Environment Satisfaction)
//   #6: Cleaned duplicate content (ESFP, PERSONA, STABLE removed from redundant places)
//   #7: "RUN LLM" renamed to "Calculate Current Respond"
//   #8: Font sizes increased, grey text changed to black, ENV. SATISFACTION high-contrast colours
//   #9: thermBAL-aligned PMV validity warnings
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
          className="font-pixel-data text-lg px-1 py-0 outline-none"
          style={{ background: "#F5ECD8", color: "#3A2A1A", border: "2px solid #3D6B4F", minWidth: 60 }}
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
        className="font-pixel-data text-lg px-1 py-0 outline-none"
        style={{
          background: "#F5ECD8",
          color: "#3A2A1A",
          border: "2px solid #3D6B4F",
          width: type === "time" ? 80 : Math.max(40, String(value).length * 10 + 20),
        }}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="font-pixel-data text-lg cursor-pointer px-1 py-0 inline-block hover:outline hover:outline-2 hover:outline-dashed"
      style={{ color: highlight ? "#B85C38" : "#3A2A1A", fontWeight: "bold", outlineColor: "#3D6B4F" }}
      title="Click to edit"
    >
      {value}
      {suffix && <span style={{ color: "#5A4A3A", fontWeight: "normal" }}> {suffix}</span>}
    </span>
  );
}

// ---- Row Components ----
function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between items-center py-0.5 px-1">
      <span className="font-pixel-data text-lg" style={{ color: "#3A2A1A" }}>{label}</span>
      {children}
    </div>
  );
}

function StaticRow({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex justify-between items-center py-0.5 px-1">
      <span className="font-pixel-data text-lg" style={{ color: "#3A2A1A" }}>{label}</span>
      <span className="font-pixel-data text-lg" style={{ color: "#3A2A1A", fontWeight: "bold" }}>
        {value}
        {unit && <span style={{ color: "#5A4A3A", fontWeight: "normal" }}> {unit}</span>}
      </span>
    </div>
  );
}

// ---- Perceptual Load Bar ----
function LoadBar({ label, value, prevValue }: { label: string; value: number; prevValue?: number }) {
  const color = value <= 0.3 ? "#6B8E5A" : value <= 0.6 ? "#C4956A" : "#B85C38";
  const hasPrev = prevValue != null && prevValue !== 0;
  const delta = hasPrev ? value - (prevValue ?? 0) : 0;

  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="font-pixel-data text-lg w-20 shrink-0" style={{ color: "#3A2A1A" }}>{label}</span>
      <div className="flex-1 h-4 relative" style={{ background: "#F2E8D5", border: "2px solid #6B4C3B" }}>
        <div className="h-full" style={{ width: `${value * 100}%`, background: color, transition: "width 0.6s ease" }} />
      </div>
      <span className="font-pixel-data text-lg w-8 text-right shrink-0" style={{ color: "#3A2A1A" }}>
        {value.toFixed(1)}
      </span>
      {hasPrev && Math.abs(delta) >= 0.01 && (
        <span className="font-pixel text-[9px] w-10 text-right shrink-0" style={{ color: delta > 0 ? "#B85C38" : "#6B8E5A" }}>
          {delta > 0 ? "+" : ""}{delta.toFixed(1)}
        </span>
      )}
    </div>
  );
}

// ---- Section Tag (Feedback #4: larger font) ----
function SectionTag({ label, icon, color }: { label: string; icon: string; color?: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 px-4 py-1.5 mb-2"
      style={{
        fontFamily: "var(--font-pixel)",
        fontSize: "13px",  // Feedback #4: increased from 9px
        letterSpacing: "1.5px",
        color: color || "#6B4C3B",
        border: `2px solid ${color || "#6B4C3B"}`,
        background: "#F2E8D5",
        boxShadow: `2px 2px 0px ${color || "#6B4C3B"}40`,
      }}
    >
      <span>{icon}</span> {label}
    </div>
  );
}

// ---- Panel Box ----
function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`p-3 ${className}`} style={{
      background: "#EDE3D0",
      border: "3px solid #6B4C3B",
      boxShadow: "3px 3px 0px #A0845C, inset 0 0 0 1px #D4C4A8",
    }}>
      {children}
    </div>
  );
}

// ---- SVG Connection Lines ----
function ConnectionLines({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);

  useEffect(() => {
    const calc = () => {
      const el = containerRef.current;
      if (!el) return;
      const persona = el.querySelector("[data-node='persona']");
      if (!persona) return;
      const nodes = el.querySelectorAll("[data-node]:not([data-node='persona'])");
      const rect = el.getBoundingClientRect();
      const pRect = persona.getBoundingClientRect();
      const cx = pRect.left + pRect.width / 2 - rect.left;
      const cy = pRect.top + pRect.height / 2 - rect.top;
      const newLines: typeof lines = [];
      nodes.forEach((node) => {
        const nRect = node.getBoundingClientRect();
        const nx = nRect.left + nRect.width / 2 - rect.left;
        const ny = nRect.top + nRect.height / 2 - rect.top;
        newLines.push({ x1: cx, y1: cy, x2: nx, y2: ny });
      });
      setLines(newLines);
    };
    calc();
    window.addEventListener("resize", calc);
    const t = setTimeout(calc, 300);
    return () => { window.removeEventListener("resize", calc); clearTimeout(t); };
  }, [containerRef]);

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
      <defs>
        <marker id="dot" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4">
          <circle cx="3" cy="3" r="3" fill="#B85C38" opacity="0.5" />
        </marker>
      </defs>
      {lines.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="#B85C38" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.4" markerEnd="url(#dot)" />
      ))}
    </svg>
  );
}

// ---- Intervention Arrow Mock-up (Feedback #1) ----
function InterventionArrow() {
  return (
    <div className="mt-3 pt-3" style={{ borderTop: "2px dashed #D4C4A8" }}>
      <div className="font-pixel text-[9px] tracking-wider mb-2" style={{ color: "#3A2A1A" }}>
        DESIGN INTERVENTION → CHANGE
      </div>
      <div className="flex items-center gap-2">
        {/* Before state */}
        <div className="flex-1 p-2 text-center" style={{ background: "#F2E8D5", border: "2px solid #B85C38" }}>
          <div className="font-pixel text-[8px]" style={{ color: "#3A2A1A" }}>BEFORE</div>
          <div className="font-pixel-data text-lg" style={{ color: "#B85C38" }}>4</div>
          <div className="font-pixel text-[8px]" style={{ color: "#3A2A1A" }}>COMFORT</div>
        </div>

        {/* Arrow with intervention label */}
        <div className="flex flex-col items-center gap-1 px-1">
          <div className="font-pixel text-[7px] text-center leading-tight px-1 py-0.5"
            style={{ background: "#3D6B4F", color: "#F2E8D5", border: "1px solid #6B4C3B", whiteSpace: "nowrap" }}>
            +WINDOW
          </div>
          <svg width="40" height="16" viewBox="0 0 40 16">
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#3D6B4F" />
              </marker>
            </defs>
            <line x1="2" y1="8" x2="32" y2="8" stroke="#3D6B4F" strokeWidth="2" markerEnd="url(#arrowhead)" />
          </svg>
          <div className="font-pixel text-[7px] text-center leading-tight px-1 py-0.5"
            style={{ background: "#3D6B4F", color: "#F2E8D5", border: "1px solid #6B4C3B", whiteSpace: "nowrap" }}>
            +LIGHT
          </div>
        </div>

        {/* After state */}
        <div className="flex-1 p-2 text-center" style={{ background: "#F2E8D5", border: "2px solid #6B8E5A" }}>
          <div className="font-pixel text-[8px]" style={{ color: "#3A2A1A" }}>AFTER</div>
          <div className="font-pixel-data text-lg" style={{ color: "#6B8E5A" }}>7</div>
          <div className="font-pixel text-[8px]" style={{ color: "#3A2A1A" }}>COMFORT</div>
        </div>
      </div>
      <div className="font-pixel text-[7px] mt-2 text-center" style={{ color: "#3A2A1A", letterSpacing: "1px" }}>
        MOCK-UP: INTERVENTION FEEDBACK LOOP
      </div>
    </div>
  );
}

// ---- PMV Validity Warnings (thermBAL-aligned) ----
function PMVWarnings({ computedOutputs }: { computedOutputs: ComputedOutputs }) {
  const warnings = computedOutputs.pmv_warnings || [];
  if (warnings.length === 0) return null;

  return (
    <div className="mt-2 px-3 py-2" style={{
      background: "#FFF4D6",
      border: "2px solid #D4A017",
      borderRadius: 0,
    }}>
      <div className="font-pixel text-[8px] mb-1" style={{ color: "#7A5A00", letterSpacing: "0.5px" }}>
        ⚠ PMV VALIDITY NOTES
      </div>
      {warnings.map((w, i) => (
        <div key={i} className="font-body text-xs" style={{ color: "#5A4000", lineHeight: 1.5 }}>
          · {w}
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

  // Baseline reset: only show delta if this persona has been simulated AND has prev results
  const comfortDelta = hasSimulated && prevExperience && prevExperience.comfort_score > 0
    ? experience.comfort_score - prevExperience.comfort_score : null;

  const mbtiOptions = [
    "ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP",
    "ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ",
  ].map((m) => ({ value: m, label: m }));

  // ---- ENV. SATISFACTION high-contrast colour mapping ----
  const getComfortBg = (score: number) => {
    if (score === 0) return "#6B4C3B";
    if (score <= 3) return "#8B1A1A";   // deep red — very uncomfortable
    if (score <= 5) return "#B85C38";   // orange-red — below average
    if (score <= 7) return "#C4956A";   // amber — moderate
    return "#2E6B3A";                   // deep green — comfortable
  };
  const getComfortTextColor = () => "#FFFFFF";
  const getTrendBg = (trend: string) => {
    if (trend === "declining") return "#8B1A1A";
    if (trend === "rising") return "#1A5C2A";
    return "#4A3A00";
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <ConnectionLines containerRef={containerRef} />

      <div className="relative grid grid-cols-12 gap-3 md:gap-4" style={{ zIndex: 1 }}>
        {/* ---- AGENT (Feedback #4: larger tag, #6: no duplicate MBTI/personality info) ---- */}
        <div className="col-span-12 md:col-span-5" data-node="agent">
          <SectionTag label="AGENT" icon="☺" color="#3D6B4F" />
          <Panel>
            <DataRow label="ID">
              <EditableField value={agent.id} onChange={(v) => updateAgent("id", v)} type="text" />
            </DataRow>
            <DataRow label="Age">
              <EditableField value={agent.age} onChange={(v) => updateAgent("age", v)} />
            </DataRow>
            <DataRow label="Gender">
              <EditableField value={agent.gender} onChange={(v) => updateAgent("gender", v)} type="select"
                options={[{ value: "female", label: "female" }, { value: "male", label: "male" }]} />
            </DataRow>
            <DataRow label="MBTI">
              <EditableField value={agent.mbti} onChange={(v) => updateAgent("mbti", v)} type="select" options={mbtiOptions} />
            </DataRow>
            <DataRow label="Mobility">
              <EditableField value={agent.mobility} onChange={(v) => updateAgent("mobility", v)} type="select"
                options={[
                  { value: "normal", label: "normal" }, { value: "walker", label: "walker" },
                  { value: "wheelchair", label: "wheelchair" }, { value: "cane", label: "cane" },
                ]} />
            </DataRow>
            <DataRow label="Hearing">
              <EditableField value={agent.hearing} onChange={(v) => updateAgent("hearing", v)} type="select"
                options={[
                  { value: "normal", label: "normal" }, { value: "impaired", label: "impaired" },
                  { value: "deaf", label: "deaf" },
                ]} />
            </DataRow>
            <DataRow label="Vision">
              <EditableField value={agent.vision} onChange={(v) => updateAgent("vision", v)} type="select"
                options={[
                  { value: "normal", label: "normal" },
                  { value: "mild_impairment", label: "mild impairment" },
                  { value: "severe_impairment", label: "severe impairment" },
                ]} />
            </DataRow>
            <div className="mt-1 pt-1" style={{ borderTop: "1px dashed #D4C4A8" }}>
              {/* Feature #3: Slider bars for Met and Clo */}
              <SliderField label="Met" value={agent.metabolic_rate} min={0.8} max={4} step={0.05}
                onChange={(v) => updateAgent("metabolic_rate", String(v))} color="#B85C38" />
              <SliderField label="Clo" value={agent.clothing_insulation} min={0} max={2} step={0.05}
                onChange={(v) => updateAgent("clothing_insulation", String(v))} color="#C67B4B" />
            </div>
          </Panel>
        </div>

        {/* ---- POSITION ---- */}
        <div className="col-span-12 md:col-span-3" data-node="position">
          <SectionTag label="POSITION" icon="◇" color="#C67B4B" />
          <Panel>
            <StaticRow label="Cell" value={`[${position.cell[0]}, ${position.cell[1]}]`} />
            <DataRow label="Time">
              <EditableField value={position.timestamp} onChange={(v) => updatePosition("timestamp", v)} type="time" />
            </DataRow>
            <DataRow label="Dur.">
              <EditableField value={position.duration_in_cell} onChange={(v) => updatePosition("duration_in_cell", v)} suffix="min" />
            </DataRow>
          </Panel>
        </div>

        {/* ---- ENVIRONMENT (thermBAL-aligned limits) ---- */}
        <div className="col-span-12 md:col-span-4" data-node="environment">
          <SectionTag label="ENVIRONMENT" icon="●" color="#3D6B4F" />
          <Panel>
            <SliderField label="Lux" value={environment.lux} min={0} max={2000} step={10}
              onChange={(v) => updateEnv("lux", String(v))} color="#C4956A" />
            <SliderField label="Noise" value={environment.dB} min={0} max={120} step={1} suffix="dB"
              onChange={(v) => updateEnv("dB", String(v))} color="#B85C38" />
            <SliderField label="Temp" value={environment.air_temp} min={10} max={35} step={0.5} suffix="°C"
              onChange={(v) => updateEnv("air_temp", String(v))} color="#3D6B4F" />
            <SliderField label="RH" value={environment.humidity} min={0} max={100} step={1} suffix="%"
              onChange={(v) => updateEnv("humidity", String(v))} color="#4A90B8" />
            <SliderField label="Air V." value={environment.air_velocity} min={0} max={2} step={0.01} suffix="m/s"
              onChange={(v) => updateEnv("air_velocity", String(v))} color="#6B8E5A" />
          </Panel>
        </div>

        {/* ---- PERSONA Card ---- */}
        <div className="col-span-12 flex justify-center my-4 md:my-6">
          <div data-node="persona" className="px-10 py-5 text-center relative"
            style={{
              background: "#B85C38",
              border: "4px solid #6B4C3B",
              boxShadow: "4px 4px 0px #6B4C3B, inset 0 0 0 2px #D4856A",
            }}>
            <div className="absolute -top-1 -left-1 w-2 h-2" style={{ background: "#FFD700" }} />
            <div className="absolute -top-1 -right-1 w-2 h-2" style={{ background: "#FFD700" }} />
            <div className="absolute -bottom-1 -left-1 w-2 h-2" style={{ background: "#FFD700" }} />
            <div className="absolute -bottom-1 -right-1 w-2 h-2" style={{ background: "#FFD700" }} />
            <div className="font-pixel text-lg" style={{ color: "#F2E8D5" }}>{agent.id}</div>
            <div className="font-pixel-data text-lg mt-1" style={{ color: "#EDE3D0" }}>
              {agent.age}{agent.gender === "female" ? "F" : "M"} · {agent.mobility} · {agent.mbti}
            </div>
          </div>
        </div>

        {/* ---- ENV. SATISFACTION (high-contrast colours) ---- */}
        <div className="col-span-12 md:col-span-5" data-node="experience">
          <SectionTag label="ENV. SATISFACTION" icon="◌" color="#6B4C3B" />
          <Panel>
            <p className="font-body text-sm italic mb-3" style={{ color: "#3A2A1A", lineHeight: 1.6 }}>
              "{experience.summary}"
            </p>
            <div className="flex items-center gap-3 mb-2">
              {/* High-contrast comfort score badge */}
              <span className="font-pixel text-[10px] px-4 py-2" style={{
                background: getComfortBg(experience.comfort_score),
                color: getComfortTextColor(),
                border: "3px solid #3A2A1A",
                boxShadow: "2px 2px 0px #3A2A1A",
                letterSpacing: "1px",
              }}>
                COMFORT {experience.comfort_score}/10
              </span>
              {comfortDelta !== null && Math.abs(comfortDelta) >= 0.1 && (
                <span className="font-pixel text-[10px] px-3 py-2" style={{
                  background: comfortDelta > 0 ? "#1A5C2A" : "#8B1A1A",
                  color: "#FFFFFF",
                  border: "3px solid #3A2A1A",
                  boxShadow: "2px 2px 0px #3A2A1A",
                }}>
                  {comfortDelta > 0 ? "+" : ""}{comfortDelta.toFixed(1)} vs prev
                </span>
              )}
              {/* High-contrast trend badge */}
              <span className="font-pixel text-[10px] px-3 py-2" style={{
                background: getTrendBg(experience.trend),
                color: "#FFFFFF",
                border: "3px solid #3A2A1A",
                boxShadow: "2px 2px 0px #3A2A1A",
              }}>
                {experience.trend === "declining" ? "▼ DECLINING" : experience.trend === "rising" ? "▲ IMPROVING" : "— STABLE"}
              </span>
            </div>

            {prevExperience && prevExperience.comfort_score > 0 && (
              <div className="mt-1 mb-2">
                <span className="font-pixel text-[9px]" style={{ color: "#3A2A1A" }}>
                  PREV: Comfort {prevExperience.comfort_score} · {prevExperience.trend.toUpperCase()}
                </span>
              </div>
            )}

            {ruleTriggers.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {ruleTriggers.map((t) => (
                  <span key={t} className="font-pixel-data text-sm px-2 py-0.5"
                    style={{ background: "#F2E8D5", border: "1px solid #6B4C3B", color: "#3A2A1A" }}>
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Feedback #1: Intervention Arrow Mock-up */}
            <InterventionArrow />
          </Panel>
        </div>

        {/* ---- SPATIAL ---- */}
        <div className="col-span-12 md:col-span-3" data-node="spatial">
          <SectionTag label="SPATIAL" icon="□" color="#C67B4B" />
          <Panel>
            {/* Wall: show — if agent not placed OR no room drawn */}
            <StaticRow
              label="→ Wall"
              value={!agentPlaced || spatial.dist_to_wall < 0 ? "—" : spatial.dist_to_wall}
              unit={!agentPlaced || spatial.dist_to_wall < 0 ? undefined : "m"}
            />
            {/* Win.: show — if agent not placed OR no window drawn */}
            <StaticRow
              label="→ Win."
              value={!agentPlaced || spatial.dist_to_window < 0 ? "—" : spatial.dist_to_window}
              unit={!agentPlaced || spatial.dist_to_window < 0 ? undefined : "m"}
            />
            {/* Exit: show — if agent not placed OR no door/room drawn */}
            <StaticRow
              label="→ Exit"
              value={!agentPlaced || spatial.dist_to_exit < 0 ? "—" : spatial.dist_to_exit}
              unit={!agentPlaced || spatial.dist_to_exit < 0 ? undefined : "m"}
            />
            <DataRow label="Ceil.">
              <EditableField value={spatial.ceiling_h} onChange={(v) => updateSpatial("ceiling_h", v)} suffix="m" />
            </DataRow>
            <StaticRow label="Encl." value={!agentPlaced ? "—" : spatial.enclosure_ratio} />
            <StaticRow label="Vis.Ag" value={!agentPlaced ? "—" : spatial.visible_agents} />
            <div className="mt-1 font-pixel text-[8px]" style={{ color: "#3A2A1A" }}>auto-calculated from map</div>
          </Panel>
        </div>

        {/* ---- COMPUTED (PMV via pythermalcomfort-inspired Fanger model) ---- */}
        <div className="col-span-12 md:col-span-4" data-node="outputs">
          <SectionTag label="COMPUTED" icon="⊕" color="#3D6B4F" />
          <Panel>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "PMV", value: computedOutputs.PMV, tooltip: "Predicted Mean Vote (Fanger/ISO 7730)" },
                { label: "PPD", value: `${computedOutputs.PPD}%`, tooltip: "Predicted Percentage Dissatisfied" },
                { label: "Eff.Lx", value: computedOutputs.effective_lux, tooltip: "Effective Lux (vision-adjusted)" },
                { label: "Pr.dB", value: computedOutputs.perceived_dB, tooltip: "Perceived dB (hearing-adjusted)" },
              ].map((item) => (
                <div key={item.label} className="p-2 text-center" title={item.tooltip}
                  style={{ background: "#F2E8D5", border: "2px solid #6B4C3B" }}>
                  <div className="font-pixel text-[9px]" style={{ color: "#3A2A1A" }}>{item.label}</div>
                  <div className="font-pixel-data text-2xl" style={{ color: "#3A2A1A" }}>{item.value}</div>
                </div>
              ))}
            </div>
            {/* PMV Validity Warnings (thermBAL-aligned) */}
            <PMVWarnings computedOutputs={computedOutputs} />
            <div className="mt-2 font-pixel text-[7px] text-center" style={{ color: "#3A2A1A", letterSpacing: "0.5px" }}>
              PMV/PPD: ISO 7730 Fanger Model (pythermalcomfort)
            </div>
          </Panel>
        </div>

        {/* ---- PERCEPTUAL LOAD (Feedback #3: computed defaults) ---- */}
        <div className="col-span-12" data-node="perceptual">
          <SectionTag label="PERCEPTUAL LOAD" icon="▐" color="#B85C38" />
          <Panel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
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
