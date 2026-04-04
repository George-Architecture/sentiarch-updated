// ============================================================
// Occupant Perception Map — Radial Mind-Map Layout
// Pure CSS positioning · Floating idle animation · Drag-to-move with spring-back
// MBTI-derived preferences · No react-grid-layout
// ============================================================

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type PointerEvent as RPointerEvent,
} from "react";
import type {
  PersonaData,
  ExperienceData,
  AccumulatedState,
  ComputedOutputs,
} from "@/lib/store";
import SliderField from "@/components/SliderField";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/* ================================================================
   MBTI → Environmental Preferences
   ================================================================ */

interface MBTIPreferences {
  noiseTolerance: number;   // dB threshold
  lightPref: string;        // "bright" | "dim" | "moderate"
  socialPref: string;       // "low_den" | "high_den" | "moderate"
  enclosurePref: string;    // "enclosed" | "open" | "moderate"
}

function deriveMBTIPreferences(mbti: string): MBTIPreferences {
  const m = mbti.toUpperCase();
  const isI = m[0] === "I";
  const isS = m[1] === "S";
  const isT = m[2] === "T";
  const isJ = m[3] === "J";

  // Noise tolerance: I/F → lower, E/T → higher
  let noiseTolerance = 55;
  if (isI) noiseTolerance -= 8;
  else noiseTolerance += 5;
  if (isT) noiseTolerance += 5;
  else noiseTolerance -= 5;

  // Light: S → bright, N → dim
  const lightPref = isS ? "bright" : "dim";

  // Social density: I → low, E → high
  const socialPref = isI ? "low_den" : "high_den";

  // Enclosure: J → enclosed, P → open
  const enclosurePref = isJ ? "enclosed" : "open";

  return { noiseTolerance, lightPref, socialPref, enclosurePref };
}

/* ================================================================
   Inline Editable Field
   ================================================================ */

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
          style={{ minWidth: 80, fontSize: "12px" }}
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        style={{ width: type === "time" ? 90 : Math.max(60, String(value).length * 10 + 30), fontSize: "12px" }}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="cursor-pointer px-1 py-0.5 rounded transition-all hover:bg-[var(--muted)]"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "12px",
        fontWeight: 700,
        color: highlight ? "#C44040" : "var(--foreground)",
      }}
      title="Click to edit"
    >
      {value}
      {suffix && <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 2 }}>{suffix}</span>}
    </span>
  );
}

/* ================================================================
   Reusable Sub-Components
   ================================================================ */

function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 px-0.5" style={{ borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--muted-foreground)", fontSize: "11px", fontWeight: 500, letterSpacing: "0.2px" }}>{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

function StaticRow({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-1 px-0.5" style={{ borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--muted-foreground)", fontSize: "11px", fontWeight: 500 }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 700 }}>
        {value}
        {unit && <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 2 }}>{unit}</span>}
      </span>
    </div>
  );
}

function LoadBar({ label, value, prevValue, note }: { label: string; value: number; prevValue?: number | null; note?: string }) {
  const getColor = (v: number) => v <= 0.3 ? "#2E8B6A" : v <= 0.6 ? "#D4A017" : "#C44040";
  const color = getColor(value);
  const hasPrev = prevValue != null && prevValue !== 0;
  const delta = hasPrev ? value - (prevValue ?? 0) : 0;
  const improved = hasPrev && delta < -0.05;

  return (
    <div className="flex items-center gap-2 py-1">
      <span style={{ color: "var(--muted-foreground)", fontSize: "11px", fontWeight: 500, width: 56, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "var(--muted)", borderRadius: 3, position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${value * 100}%`, background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "11px", width: 28, textAlign: "right", flexShrink: 0 }}>
        {value.toFixed(1)}
      </span>
      {improved && (
        <>
          <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>→</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "11px", color: "#2E8B6A" }}>
            {(prevValue! + delta).toFixed(1)}
          </span>
        </>
      )}
      {note && <span style={{ fontSize: "9px", color: "#D4A017", fontStyle: "italic", marginLeft: 4 }}>{note}</span>}
    </div>
  );
}

function SectionTag({ label, icon, color }: { label: string; icon: string; color?: string }) {
  const c = color || "var(--primary)";
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "1.2px",
        textTransform: "uppercase" as const,
        color: c,
        border: `1.5px solid ${c}`,
        background: `${c}10`,
      }}
    >
      <span style={{ fontSize: "10px" }}>{icon}</span> {label}
    </div>
  );
}

/* ================================================================
   Formula Modal
   ================================================================ */

function FormulaModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="sa-btn w-full mt-2" style={{
          fontSize: "11px", padding: "6px 10px",
          background: "var(--primary)", color: "var(--primary-foreground)", border: "none",
        }}>
          Show Formulas
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl" style={{
        background: "var(--card)", border: "1px solid var(--border)",
        maxHeight: "80vh", overflowY: "auto",
      }}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Inter', sans-serif", color: "var(--foreground)" }}>
            Computation Formulas
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          {[
            {
              title: "PMV — Predicted Mean Vote (ISO 7730 Fanger)",
              color: "var(--primary)",
              lines: [
                "PMV = [0.303 × exp(-0.036 × M) + 0.028] × L",
                "where L = internal heat production − heat loss",
              ],
              notes: "M = metabolic rate (W/m²) | W = external work (≈0)\nI_cl = clothing insulation (clo) | f_cl = clothing area factor\nt_a = air temperature (°C) | t_r = mean radiant temp (°C)\nv_ar = relative air velocity (m/s) | p_a = water vapour pressure (Pa)",
            },
            {
              title: "PPD — Predicted Percentage Dissatisfied",
              color: "var(--primary)",
              lines: ["PPD = 100 − 95 × exp(−0.03353 × PMV⁴ − 0.2179 × PMV²)"],
              notes: "Range: 5% (PMV=0, neutral) → 100% (extreme discomfort)",
            },
            {
              title: "Effective Lux — Vision-Adjusted Illuminance",
              color: "#D4A017",
              lines: [
                "Eff.Lux = base_lux + Σ(window_influence × distance_decay)",
                "Vision adjustment: normal ×1.0 | mild ×0.5 | severe ×0.15",
              ],
              notes: "Window influence: max +400 lux, quadratic decay over 5000mm",
            },
            {
              title: "Perceived dB — Hearing-Adjusted Noise",
              color: "#C44040",
              lines: ["Pr.dB = base_dB × hearing_factor"],
              notes: "Hearing factor: normal ×1.0 | impaired ×0.6 | deaf ×0.1",
            },
          ].map((f) => (
            <div key={f.title}>
              <h4 className="text-sm font-bold mb-2" style={{ color: f.color }}>{f.title}</h4>
              <div className="p-3 rounded-lg" style={{
                background: "var(--muted)", border: "1px solid var(--border)",
                fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: 1.8,
              }}>
                {f.lines.map((l, i) => <div key={i}>{l}</div>)}
                {f.notes && (
                  <div className="mt-2" style={{ fontSize: "10px", color: "var(--muted-foreground)", whiteSpace: "pre-line" }}>
                    {f.notes}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================
   FloatingBlock — idle float animation + drag-to-move + spring-back
   ================================================================ */

function FloatingBlock({
  children,
  floatDelay = 0,
  floatRange = 4,
  className = "",
  style = {},
}: {
  children: ReactNode;
  floatDelay?: number;
  floatRange?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    pointerId: number;
  } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isReturning, setIsReturning] = useState(false);

  const onPointerDown = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    // Don't drag if clicking on interactive elements
    const tag = (e.target as HTMLElement).tagName;
    if (["INPUT", "SELECT", "BUTTON", "TEXTAREA", "A"].includes(tag)) return;
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a, .no-drag")) return;

    e.preventDefault();
    const el = elRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
      pointerId: e.pointerId,
    };
    setIsDragging(true);
    setIsReturning(false);
  }, [offset]);

  const onPointerMove = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    if (!dragState.current?.active) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset({
      x: dragState.current.offsetX + dx,
      y: dragState.current.offsetY + dy,
    });
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragState.current?.active) return;
    dragState.current.active = false;
    dragState.current = null;
    setIsDragging(false);
    setIsReturning(true);
    // Spring back to origin
    setOffset({ x: 0, y: 0 });
    // Clear returning flag after animation
    setTimeout(() => setIsReturning(false), 600);
  }, []);

  const animName = `opm-float-${floatDelay}`;

  return (
    <div
      ref={elRef}
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        ...style,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: isDragging
          ? "none"
          : isReturning
            ? "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)"
            : "none",
        animation: isDragging || isReturning
          ? "none"
          : `opm-float ${3 + (floatDelay % 2)}s ease-in-out ${floatDelay * 0.3}s infinite`,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
        willChange: "transform",
        zIndex: isDragging ? 50 : 1,
      }}
    >
      {children}
    </div>
  );
}

/* ================================================================
   CSS Keyframes (injected once)
   ================================================================ */

const FLOAT_CSS = `
@keyframes opm-float {
  0%, 100% { transform: translate(0px, 0px); }
  25% { transform: translate(2px, -3px); }
  50% { transform: translate(-1px, 2px); }
  75% { transform: translate(1px, -1px); }
}
`;

let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = FLOAT_CSS;
  document.head.appendChild(style);
}

/* ================================================================
   Main Component
   ================================================================ */

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
  const accentColor = personaColor?.primary || "#8B5E3C";

  useEffect(() => { injectCSS(); }, []);

  // ── Updaters ──
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

  // ── Derived data ──
  const prefs = deriveMBTIPreferences(agent.mbti);

  const comfortDelta = hasSimulated && prevExperience && prevExperience.comfort_score > 0
    ? experience.comfort_score - prevExperience.comfort_score : null;

  const getTrendInfo = (trend: string) => {
    if (trend === "declining") return { icon: "▽", label: "DECLINING", color: "#C44040" };
    if (trend === "rising") return { icon: "△", label: "ESTIMATED", color: "#2E8B6A" };
    return { icon: "—", label: "STABLE", color: "var(--muted-foreground)" };
  };

  const getComfortColor = (score: number) => {
    if (score === 0) return "var(--muted-foreground)";
    if (score <= 3) return "#C44040";
    if (score <= 5) return "#D4A017";
    return "#2E8B6A";
  };

  const mbtiOptions = [
    "ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP",
    "ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ",
  ].map((m) => ({ value: m, label: m }));

  const trendInfo = getTrendInfo(experience.trend);

  // ── Shared styles ──
  const cardStyle: React.CSSProperties = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    padding: "12px 14px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  };

  const monoStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    fontSize: "12px",
  };

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div style={{ width: "100%", position: "relative", fontFamily: "'Inter', sans-serif" }}>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px", color: "var(--foreground)", margin: 0, lineHeight: 1.2 }}>
            Occupant Perception Map
          </h1>
          <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "1.5px", color: "var(--muted-foreground)", textTransform: "uppercase", marginTop: 2 }}>
            AGENT-BASED ENVIRONMENTAL EXPERIENCE MODEL
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ ...monoStyle, fontSize: "11px", color: "var(--muted-foreground)" }}>
            CELL [{position.cell[0]}, {position.cell[1]}] · {position.timestamp} · {position.duration_in_cell} min
          </div>
          <div style={{ ...monoStyle, fontSize: "12px", color: getComfortColor(experience.comfort_score), marginTop: 2 }}>
            COMFORT {experience.comfort_score}/10 {trendInfo.icon} {trendInfo.label}
          </div>
        </div>
      </div>

      {/* ── Subtitle ── */}
      <div style={{ fontSize: "11px", fontStyle: "italic", color: "var(--muted-foreground)", textAlign: "center", margin: "8px 0 16px", lineHeight: 1.5 }}>
        Perceptual loads are computed from environmental and spatial conditions and translated into ranked spatial interventions.
      </div>

      {/* ── PREFERENCES (MBTI-derived) ── */}
      <FloatingBlock floatDelay={0} style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
        <SectionTag label="PREFERENCES" icon="♥" color={accentColor} />
        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { label: "Noise Tol.", value: `${prefs.noiseTolerance} dB` },
            { label: "Light", value: prefs.lightPref },
            { label: "Social", value: prefs.socialPref },
            { label: "Enclosure", value: prefs.enclosurePref },
          ].map((p) => (
            <div key={p.label} style={{
              ...cardStyle,
              padding: "6px 14px",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}>
              <span style={{ fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 500 }}>{p.label}</span>
              <span style={{ ...monoStyle, fontSize: "12px" }}>{p.value}</span>
            </div>
          ))}
        </div>
      </FloatingBlock>

      {/* ── MAIN RADIAL LAYOUT ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateRows: "auto auto auto auto auto",
        gap: "16px 20px",
        alignItems: "start",
      }}>

        {/* ── Row 1: AGENT (left) + gap (center) + POSITION (right) ── */}
        <FloatingBlock floatDelay={1} style={{ gridColumn: 1, gridRow: 1 }}>
          <div style={cardStyle}>
            <div style={{ ...monoStyle, fontSize: "11px", marginBottom: 6, lineHeight: 1.5 }}>
              {agent.age} · {agent.gender} · {agent.mobility}
            </div>
            <DataRow label="Hear.">
              <EditableField value={agent.hearing} onChange={(v) => updateAgent("hearing", v)} type="select"
                options={[{ value: "normal", label: "normal" }, { value: "impaired", label: "impaired" }, { value: "deaf", label: "deaf" }]}
                highlight={agent.hearing !== "normal"} />
            </DataRow>
            <DataRow label="Vis.">
              <EditableField value={agent.vision === "normal" ? "normal" : agent.vision === "mild_impairment" ? "mild imp." : "severe imp."} onChange={(v) => {
                const map: Record<string, string> = { "normal": "normal", "mild imp.": "mild_impairment", "severe imp.": "severe_impairment" };
                updateAgent("vision", map[v] || v);
              }} type="select"
                options={[{ value: "normal", label: "normal" }, { value: "mild imp.", label: "mild imp." }, { value: "severe imp.", label: "severe imp." }]}
                highlight={agent.vision !== "normal"} />
            </DataRow>
            <div className="flex items-center gap-3 mt-2 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>Met</span>
              <span style={monoStyle}>{agent.metabolic_rate.toFixed(1)}</span>
              <span style={{ fontSize: "11px", color: "var(--muted-foreground)", marginLeft: 8 }}>Clo</span>
              <span style={monoStyle}>{agent.clothing_insulation.toFixed(1)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
              <SectionTag label="AGENT" icon="◎" color={accentColor} />
            </div>
          </div>
        </FloatingBlock>

        {/* Center gap row 1 — empty */}
        <div style={{ gridColumn: 2, gridRow: 1 }} />

        <FloatingBlock floatDelay={2} style={{ gridColumn: 3, gridRow: 1 }}>
          <div style={cardStyle}>
            <DataRow label="Cell">
              <span style={monoStyle}>[{position.cell[0]}, {position.cell[1]}]</span>
            </DataRow>
            <DataRow label="Time">
              <EditableField value={position.timestamp} onChange={(v) => updatePosition("timestamp", v)} type="time" />
            </DataRow>
            <DataRow label="Dur.">
              <EditableField value={position.duration_in_cell} onChange={(v) => updatePosition("duration_in_cell", v)} suffix="min" />
            </DataRow>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
              <SectionTag label="POSITION" icon="◇" color="#D4A017" />
            </div>
          </div>
        </FloatingBlock>

        {/* ── Row 2: (empty) + PERSONA CIRCLE (center) + ENVIRONMENT (right) ── */}
        <div style={{ gridColumn: 1, gridRow: 2 }} />

        {/* PERSONA CIRCLE */}
        <FloatingBlock floatDelay={3} floatRange={2} style={{
          gridColumn: 2, gridRow: "2 / 4",
          display: "flex", justifyContent: "center", alignItems: "center",
        }}>
          <div style={{
            width: 180, height: 180,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${accentColor}18, ${accentColor}30)`,
            border: `2px solid ${accentColor}50`,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 40px ${accentColor}15, 0 4px 20px rgba(0,0,0,0.06)`,
            position: "relative",
          }}>
            <div style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "2px", color: accentColor, textTransform: "uppercase", marginBottom: 4 }}>
              PERSONA
            </div>
            <div style={{ ...monoStyle, fontSize: "16px", color: "var(--foreground)" }}>
              {agent.id}
            </div>
            <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: 4 }}>
              {agent.age}{agent.gender === "female" ? "F" : "M"} · {agent.mobility === "normal" ? "Normal" : agent.mobility.charAt(0).toUpperCase() + agent.mobility.slice(1)}
            </div>
          </div>
        </FloatingBlock>

        <FloatingBlock floatDelay={4} style={{ gridColumn: 3, gridRow: 2 }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <SectionTag label="ENVIRONMENT" icon="◉" color="#1D6B5E" />
            </div>
            <StaticRow label="Lux" value={environment.lux} />
            <StaticRow label="Noise" value={`${environment.dB}`} unit="dB" />
            <StaticRow label="Temp" value={`${environment.air_temp}`} unit="°C" />
            <StaticRow label="RH" value={`${environment.humidity}`} unit="%" />
            <StaticRow label="Air V." value={`${environment.air_velocity}`} unit="m/s" />
          </div>
        </FloatingBlock>

        {/* ── Row 3: EXPERIENCE (left) + (persona continues) + SPATIAL (right) ── */}
        <FloatingBlock floatDelay={5} style={{ gridColumn: 1, gridRow: "3 / 5" }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <SectionTag label="EXPERIENCE" icon="◌" color="var(--muted-foreground)" />
            </div>
            <p style={{
              fontSize: "12px", fontStyle: "italic", color: "var(--foreground)",
              lineHeight: 1.6, margin: "0 0 10px", borderLeft: "2px solid var(--border)", paddingLeft: 10,
            }}>
              "{experience.summary}"
            </p>

            {/* Current comfort */}
            <div className="flex items-center gap-2 mb-1">
              <span style={{
                ...monoStyle, fontSize: "11px",
                border: `1.5px solid ${getComfortColor(experience.comfort_score)}`,
                color: getComfortColor(experience.comfort_score),
                padding: "3px 10px", borderRadius: 6,
              }}>
                Comfort {experience.comfort_score}
              </span>
              <span style={{ fontSize: "11px", fontWeight: 700, color: trendInfo.color }}>
                {trendInfo.icon} {trendInfo.label}
              </span>
            </div>

            {/* Rule triggers */}
            {ruleTriggers.length > 0 && (
              <div style={{ marginTop: 8, borderTop: "1px dashed var(--border)", paddingTop: 8 }}>
                {ruleTriggers.map((t) => (
                  <div key={t} style={{
                    ...monoStyle, fontSize: "10px", fontWeight: 500,
                    padding: "3px 8px", marginBottom: 3,
                    background: "var(--muted)", border: "1px solid var(--border)",
                    borderRadius: 4, color: "var(--foreground)",
                  }}>
                    {t}
                  </div>
                ))}
              </div>
            )}

            {/* Estimated comfort (if previous exists) */}
            {comfortDelta !== null && (
              <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: "1px dashed var(--border)" }}>
                <span style={{
                  ...monoStyle, fontSize: "11px",
                  border: `1.5px solid #2E8B6A`,
                  color: "#2E8B6A",
                  padding: "3px 10px", borderRadius: 6,
                }}>
                  Comfort {(experience.comfort_score + comfortDelta).toFixed(1)}
                </span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#2E8B6A" }}>
                  △ ESTIMATED
                </span>
              </div>
            )}
          </div>
        </FloatingBlock>

        <FloatingBlock floatDelay={6} style={{ gridColumn: 3, gridRow: "3 / 5" }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <SectionTag label="SPATIAL" icon="□" color="#D4A017" />
            </div>
            <StaticRow label="→ Wall" value={!agentPlaced || spatial.dist_to_wall < 0 ? "—" : `${spatial.dist_to_wall}`} unit={agentPlaced && spatial.dist_to_wall >= 0 ? "m" : undefined} />
            <StaticRow label="→ Win." value={!agentPlaced || spatial.dist_to_window < 0 ? "—" : `${spatial.dist_to_window}`} unit={agentPlaced && spatial.dist_to_window >= 0 ? "m" : undefined} />
            <StaticRow label="→ Exit" value={!agentPlaced || spatial.dist_to_exit < 0 ? "—" : `${spatial.dist_to_exit}`} unit={agentPlaced && spatial.dist_to_exit >= 0 ? "m" : undefined} />
            <DataRow label="Ceil.">
              <EditableField value={spatial.ceiling_h} onChange={(v) => updateSpatial("ceiling_h", v)} suffix="m" />
            </DataRow>
            <StaticRow label="Encl." value={!agentPlaced ? "—" : spatial.enclosure_ratio} />
            <div style={{ fontSize: "9px", color: "var(--muted-foreground)", fontStyle: "italic", marginTop: 2 }}>
              Corridor section ↑
            </div>
            <StaticRow label="Vis.Ag" value={!agentPlaced ? "—" : spatial.visible_agents} />
          </div>
        </FloatingBlock>

        {/* ── Row 4-5: PERCEPTUAL LOAD (left) + MODEL OUTPUTS (right) ── */}
        <FloatingBlock floatDelay={7} style={{ gridColumn: 1, gridRow: 5 }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <SectionTag label="PERCEPTUAL LOAD" icon="▐" color="#C44040" />
            </div>
            <LoadBar label="Thermal" value={accumulatedState.thermal_discomfort} prevValue={prevAccumulatedState?.thermal_discomfort} />
            <LoadBar label="Visual" value={accumulatedState.visual_strain} prevValue={prevAccumulatedState?.visual_strain} note={accumulatedState.visual_strain > 0.4 ? "Signage contrast ↑" : undefined} />
            <LoadBar label="Noise" value={accumulatedState.noise_stress} prevValue={prevAccumulatedState?.noise_stress} note={accumulatedState.noise_stress > 0.5 ? "Acoustic absorption ↑" : undefined} />
            <LoadBar label="Social" value={accumulatedState.social_overload} prevValue={prevAccumulatedState?.social_overload} />
            <LoadBar label="Fatigue" value={accumulatedState.fatigue} prevValue={prevAccumulatedState?.fatigue} />
            <LoadBar label="Wayfind." value={accumulatedState.wayfinding_anxiety} prevValue={prevAccumulatedState?.wayfinding_anxiety} note={accumulatedState.wayfinding_anxiety > 0.4 ? "Sightline to egress ↑" : undefined} />
          </div>
        </FloatingBlock>

        <FloatingBlock floatDelay={8} style={{ gridColumn: "2 / 4", gridRow: 5 }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <SectionTag label="MODEL OUTPUTS" icon="⊕" color="#1D6B5E" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "PMV", value: computedOutputs.PMV },
                { label: "PPD", value: computedOutputs.PPD },
                { label: "Eff.Lx", value: computedOutputs.effective_lux },
                { label: "Pr.dB", value: computedOutputs.perceived_dB },
              ].map((item) => (
                <div key={item.label} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "6px 12px",
                  background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6,
                }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted-foreground)" }}>{item.label}</span>
                  <span style={{ ...monoStyle, fontSize: "16px" }}>{item.value}</span>
                </div>
              ))}
            </div>
            {computedOutputs.pmv_warnings && computedOutputs.pmv_warnings.length > 0 && (
              <div style={{ marginTop: 8, padding: "6px 10px", background: "#FFF8E1", border: "1px solid #E8D48A", borderRadius: 6, fontSize: "10px", color: "#6B5500" }}>
                {computedOutputs.pmv_warnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            )}
            <div className="no-drag">
              <FormulaModal />
            </div>
          </div>
        </FloatingBlock>

        {/* ── Row 4 center: Environment Sliders (hidden detail, expandable) ── */}
        <FloatingBlock floatDelay={9} style={{ gridColumn: 2, gridRow: 4 }}>
          <div style={{ ...cardStyle, padding: "10px 12px" }} className="no-drag">
            {!agentPlaced && (
              <div style={{
                fontSize: "10px", textAlign: "center", padding: "6px", marginBottom: 6,
                background: "#FFF8E1", border: "1px solid #E8D48A", borderRadius: 6, color: "#8A6D00",
              }}>
                Agent not placed — default values
              </div>
            )}
            <SliderField label="Light (Lux)" value={environment.lux} min={0} max={2000} step={10}
              onChange={(v) => updateEnv("lux", String(v))} color="#D4A017" />
            <SliderField label="Noise (dB)" value={environment.dB} min={0} max={120} step={1} suffix="dB"
              onChange={(v) => updateEnv("dB", String(v))} color="#C44040" />
            <SliderField label="Temp (°C)" value={environment.air_temp} min={10} max={35} step={0.5} suffix="°C"
              onChange={(v) => updateEnv("air_temp", String(v))} color="#1D6B5E" />
            <SliderField label="RH (%)" value={environment.humidity} min={0} max={100} step={1} suffix="%"
              onChange={(v) => updateEnv("humidity", String(v))} color="#4A90B8" />
            <SliderField label="Air Vel." value={environment.air_velocity} min={0} max={2} step={0.01} suffix="m/s"
              onChange={(v) => updateEnv("air_velocity", String(v))} color="#2E8B6A" />
          </div>
        </FloatingBlock>

        {/* ── Row 4 left: Agent detail (MBTI, sliders) ── */}
        <FloatingBlock floatDelay={10} style={{ gridColumn: 1, gridRow: 4 }}>
          <div style={{ ...cardStyle, padding: "10px 12px" }} className="no-drag">
            <DataRow label="Name">
              <EditableField value={agent.id} onChange={(v) => updateAgent("id", v)} type="text" />
            </DataRow>
            <DataRow label="Age">
              <EditableField value={agent.age} onChange={(v) => updateAgent("age", v)} type="number" />
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
            <div style={{ marginTop: 6 }}>
              <SliderField label="Met Rate" value={agent.metabolic_rate} min={0.8} max={4} step={0.05}
                onChange={(v) => updateAgent("metabolic_rate", String(v))} color={accentColor} />
              <SliderField label="Clo" value={agent.clothing_insulation} min={0} max={2} step={0.05}
                onChange={(v) => updateAgent("clothing_insulation", String(v))} color={accentColor} />
            </div>
          </div>
        </FloatingBlock>

      </div>

      {/* ── FOOTER ── */}
      <div style={{
        marginTop: 28,
        paddingTop: 12,
        borderTop: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        flexWrap: "wrap",
        gap: 8,
      }}>
        <div>
          <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "1px", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
            HKU DEPT. OF ARCHITECTURE · BUILDING INFORMATICS LAB
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4, alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "9px", color: "var(--muted-foreground)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2E8B6A", display: "inline-block" }} /> Normal
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "9px", color: "var(--muted-foreground)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#D4A017", display: "inline-block" }} /> Moderate
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "9px", color: "var(--muted-foreground)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C44040", display: "inline-block" }} /> Alert
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "1px", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
            AGENT-BASED ENVIRONMENTAL EXPERIENCE MODEL v0.1
          </div>
          <div style={{ fontSize: "9px", color: "var(--muted-foreground)", marginTop: 2 }}>
            → 0.x Δ = predicted reduction in perceptual load <span style={{ fontStyle: "italic" }}>(design intent)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
