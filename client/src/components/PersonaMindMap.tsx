// ============================================================
// PersonaMindMap — Three-Layer Radial Mind Map
//
// Layer 1 (center): Persona node
// Layer 2 (ring):   Category label nodes with SVG lines to center
// Layer 3 (outer):  Data leaf nodes with SVG lines to category
//
// Features: floating idle animation, drag-to-move + spring-back,
//           SVG connector lines, clean white/earth-tone style
// ============================================================

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
  type PointerEvent as RPointerEvent,
  type CSSProperties,
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
   Constants & Styles
   ================================================================ */

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontWeight: 700 };
const COLORS = {
  agent: "#8B5E3C",
  position: "#D4A017",
  environment: "#1D6B5E",
  spatial: "#4A7B9D",
  computed: "#6B5B95",
  experience: "#C44040",
  perceptual: "#B8860B",
};

/* ================================================================
   CSS Keyframes (injected once)
   ================================================================ */

const FLOAT_CSS = `
@keyframes mm-float {
  0%, 100% { transform: translate(0px, 0px); }
  25% { transform: translate(1.5px, -2.5px); }
  50% { transform: translate(-1px, 1.5px); }
  75% { transform: translate(0.5px, -1px); }
}
`;

let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const s = document.createElement("style");
  s.textContent = FLOAT_CSS;
  document.head.appendChild(s);
}

/* ================================================================
   FloatingBlock — idle float + drag + spring-back
   ================================================================ */

function FloatingBlock({
  children, floatDelay = 0, style = {}, className = "",
}: {
  children: ReactNode;
  floatDelay?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ active: boolean; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [returning, setReturning] = useState(false);

  const onDown = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (["INPUT", "SELECT", "BUTTON", "TEXTAREA", "A"].includes(tag)) return;
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a, .no-drag")) return;
    e.preventDefault();
    elRef.current?.setPointerCapture(e.pointerId);
    drag.current = { active: true, sx: e.clientX, sy: e.clientY, ox: off.x, oy: off.y };
    setDragging(true);
    setReturning(false);
  }, [off]);

  const onMove = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    if (!drag.current?.active) return;
    setOff({ x: drag.current.ox + e.clientX - drag.current.sx, y: drag.current.oy + e.clientY - drag.current.sy });
  }, []);

  const onUp = useCallback(() => {
    if (!drag.current?.active) return;
    drag.current.active = false;
    drag.current = null;
    setDragging(false);
    setReturning(true);
    setOff({ x: 0, y: 0 });
    setTimeout(() => setReturning(false), 600);
  }, []);

  return (
    <div
      ref={elRef}
      className={className}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        ...style,
        transform: `translate(${off.x}px, ${off.y}px)`,
        transition: dragging ? "none" : returning ? "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
        animation: dragging || returning ? "none" : `mm-float ${3 + (floatDelay % 3)}s ease-in-out ${floatDelay * 0.4}s infinite`,
        cursor: dragging ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
        willChange: "transform",
        zIndex: dragging ? 100 : style.zIndex ?? 2,
      }}
    >
      {children}
    </div>
  );
}

/* ================================================================
   Inline Editable Field
   ================================================================ */

function EditableField({
  value, onChange, type = "text", suffix, options, highlight,
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

  const commit = () => { setEditing(false); if (draft !== String(value)) onChange(draft); };

  if (editing) {
    if (type === "select" && options) {
      return (
        <select ref={ref as any} value={draft}
          onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)} className="sa-input"
          style={{ minWidth: 70, fontSize: "11px", padding: "2px 4px" }}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <input ref={ref as any}
        type={type === "time" ? "time" : type === "number" ? "number" : "text"}
        value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        step={type === "number" ? "any" : undefined} className="sa-input text-right"
        style={{ width: type === "time" ? 80 : Math.max(50, String(value).length * 9 + 20), fontSize: "11px", padding: "2px 4px" }} />
    );
  }

  return (
    <span onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="cursor-pointer px-0.5 rounded transition-all hover:bg-[var(--muted)]"
      style={{ ...MONO, fontSize: "11px", color: highlight ? "#C44040" : "var(--foreground)" }}
      title="Click to edit">
      {value}{suffix && <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 2, fontSize: "10px" }}>{suffix}</span>}
    </span>
  );
}

/* ================================================================
   Small Sub-Components
   ================================================================ */

function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--muted-foreground)", fontSize: "10px", fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center" }}>{children}</div>
    </div>
  );
}

function StaticRow({ label, value, unit, highlight }: { label: string; value: string | number; unit?: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--muted-foreground)", fontSize: "10px", fontWeight: 500 }}>{label}</span>
      <span style={{ ...MONO, fontSize: "11px", color: highlight ? "#C44040" : "var(--foreground)" }}>
        {value}{unit && <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 2, fontSize: "10px" }}>{unit}</span>}
      </span>
    </div>
  );
}

function LoadBar({ label, value, prevValue, note }: { label: string; value: number; prevValue?: number | null; note?: string }) {
  const color = value <= 0.3 ? "#2E8B6A" : value <= 0.6 ? "#D4A017" : "#C44040";
  const hasPrev = prevValue != null && prevValue !== 0;
  const delta = hasPrev ? value - (prevValue ?? 0) : 0;
  const improved = hasPrev && delta < -0.05;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
      <span style={{ color: "var(--muted-foreground)", fontSize: "10px", fontWeight: 500, width: 48, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: "var(--muted)", borderRadius: 3, position: "relative", minWidth: 60 }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(value * 100, 100)}%`, background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ ...MONO, fontSize: "10px", width: 24, textAlign: "right", flexShrink: 0 }}>{value.toFixed(1)}</span>
      {improved && (
        <>
          <span style={{ fontSize: "9px", color: "var(--muted-foreground)" }}>→</span>
          <span style={{ ...MONO, fontSize: "10px", color: "#2E8B6A" }}>{(value + delta).toFixed(1)}</span>
        </>
      )}
      {note && <span style={{ fontSize: "8px", color: "#D4A017", fontStyle: "italic" }}>{note}</span>}
    </div>
  );
}

function SectionTag({ label, icon, color }: { label: string; icon: string; color: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 20,
      fontSize: "9px", fontWeight: 700, letterSpacing: "1.2px",
      textTransform: "uppercase" as const,
      color, border: `1.5px solid ${color}`, background: `${color}0D`,
      whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: "9px" }}>{icon}</span> {label}
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
        <button className="sa-btn" style={{
          fontSize: "10px", padding: "4px 10px", width: "100%", marginTop: 6,
          background: "var(--primary)", color: "var(--primary-foreground)", border: "none",
        }}>
          Show Formulas
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl" style={{ background: "var(--card)", border: "1px solid var(--border)", maxHeight: "80vh", overflowY: "auto" }}>
        <DialogHeader><DialogTitle>Computation Formulas</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          {[
            { title: "PMV (ISO 7730 Fanger)", color: "var(--primary)", lines: ["PMV = [0.303 × exp(-0.036 × M) + 0.028] × L"] },
            { title: "PPD", color: "var(--primary)", lines: ["PPD = 100 − 95 × exp(−0.03353 × PMV⁴ − 0.2179 × PMV²)"] },
            { title: "Effective Lux", color: "#D4A017", lines: ["Eff.Lux = base_lux + Σ(window × decay)", "Vision: normal ×1.0 | mild ×0.5 | severe ×0.15"] },
            { title: "Perceived dB", color: "#C44040", lines: ["Pr.dB = base_dB × hearing_factor", "normal ×1.0 | impaired ×0.6 | deaf ×0.1"] },
          ].map((f) => (
            <div key={f.title}>
              <h4 style={{ fontSize: "13px", fontWeight: 700, color: f.color, marginBottom: 4 }}>{f.title}</h4>
              <div style={{ padding: 8, background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6, ...MONO, fontSize: "11px", lineHeight: 1.8 }}>
                {f.lines.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================
   SVG Connector Lines
   ================================================================ */

interface NodePos { id: string; x: number; y: number; w: number; h: number }

function ConnectorLines({ nodes, links }: { nodes: Map<string, NodePos>; links: [string, string][] }) {
  return (
    <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}>
      {links.map(([from, to], i) => {
        const a = nodes.get(from);
        const b = nodes.get(to);
        if (!a || !b) return null;
        const x1 = a.x + a.w / 2;
        const y1 = a.y + a.h / 2;
        const x2 = b.x + b.w / 2;
        const y2 = b.y + b.h / 2;
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="var(--border)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.6} />
        );
      })}
    </svg>
  );
}

/* ================================================================
   useNodeRef — track node position for SVG lines
   ================================================================ */

function useNodeTracker() {
  const nodesRef = useRef<Map<string, NodePos>>(new Map());
  const [nodes, setNodes] = useState<Map<string, NodePos>>(new Map());

  const registerRef = useCallback((id: string) => {
    return (el: HTMLDivElement | null) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const parent = el.offsetParent as HTMLElement;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      const pos = {
        id,
        x: rect.left - parentRect.left,
        y: rect.top - parentRect.top,
        w: rect.width,
        h: rect.height,
      };
      nodesRef.current.set(id, pos);
    };
  }, []);

  const refresh = useCallback(() => {
    setNodes(new Map(nodesRef.current));
  }, []);

  return { nodes, registerRef, refresh };
}

/* ================================================================
   Main Component
   ================================================================ */

export default function PersonaMindMap({
  persona, experience, accumulatedState, computedOutputs, ruleTriggers,
  prevExperience, prevAccumulatedState, onPersonaChange,
  hasSimulated = true, personaColor, agentPlaced = false,
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
  const accent = personaColor?.primary || "#8B5E3C";

  useEffect(() => { injectCSS(); }, []);

  // Node tracking for SVG lines
  const { nodes, registerRef, refresh } = useNodeTracker();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(refresh, 100);
    return () => clearTimeout(timer);
  });

  // Update helpers
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

  // Derived
  const comfortDelta = hasSimulated && prevExperience && prevExperience.comfort_score > 0
    ? experience.comfort_score - prevExperience.comfort_score : null;
  const trendInfo = experience.trend === "declining" ? { icon: "▽", label: "DECLINING", color: "#C44040" }
    : experience.trend === "rising" ? { icon: "△", label: "IMPROVING", color: "#2E8B6A" }
    : { icon: "—", label: "STABLE", color: "var(--muted-foreground)" };
  const comfortColor = experience.comfort_score === 0 ? "var(--muted-foreground)" : experience.comfort_score <= 3 ? "#C44040" : experience.comfort_score <= 5 ? "#D4A017" : "#2E8B6A";

  const mbtiOptions = useMemo(() =>
    ["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"].map((m) => ({ value: m, label: m })),
  []);

  const visionLabel = agent.vision === "normal" ? "normal" : agent.vision === "mild_impairment" ? "mild imp." : "severe imp.";

  // SVG links: center → categories, categories → leaves (simplified: we draw center→category lines)
  const links: [string, string][] = [
    ["persona", "cat-agent"],
    ["persona", "cat-position"],
    ["persona", "cat-environment"],
    ["persona", "cat-spatial"],
    ["persona", "cat-computed"],
    ["persona", "cat-experience"],
    ["persona", "cat-perceptual"],
  ];

  // Card style
  const cardS: CSSProperties = {
    background: "var(--card)", border: "1px solid var(--border)",
    borderRadius: 8, padding: "8px 10px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  };

  /* ── Layout: 7 columns grid ──
     The mind map is laid out as a CSS grid with 7 columns.
     Center persona spans the middle.
     Categories + leaves are placed around it.

     Col:  1       2       3     4(center)  5       6       7
     Row1:        [AGENT leaves]           [POSITION leaves]
     Row2:  [AGENT tag]                    [POSITION tag]
     Row3:                    [PERSONA]
     Row4:  [EXPERIENCE tag]               [ENVIRONMENT tag]
     Row5:  [EXPERIENCE leaves]            [ENV leaves]
     Row6:        [PERCEPT tag]            [SPATIAL tag]
     Row7:  [PERCEPT leaves]               [SPATIAL leaves]
     Row8:              [COMPUTED tag]
     Row9:              [COMPUTED leaves]
  */

  return (
    <div style={{ width: "100%", position: "relative", fontFamily: "'Inter', sans-serif" }}>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.5px", margin: 0, color: "var(--foreground)" }}>
            Occupant Perception Map
          </h1>
          <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "1.5px", color: "var(--muted-foreground)", textTransform: "uppercase", marginTop: 2 }}>
            AGENT-BASED ENVIRONMENTAL EXPERIENCE MODEL
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ ...MONO, fontSize: "10px", color: "var(--muted-foreground)" }}>
            CELL [{position.cell[0]}, {position.cell[1]}] · {position.timestamp} · {position.duration_in_cell} min
          </div>
          <div style={{ ...MONO, fontSize: "11px", color: comfortColor, marginTop: 2 }}>
            COMFORT {experience.comfort_score}/10 {trendInfo.icon} {trendInfo.label}
          </div>
        </div>
      </div>

      {/* ── MIND MAP CONTAINER ── */}
      <div ref={containerRef} style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr 0.6fr 1.2fr 0.6fr 1fr 1fr", gridTemplateRows: "auto auto auto auto auto auto auto auto auto", gap: "8px 10px", alignItems: "start", minHeight: 600 }}>

        {/* SVG connector lines */}
        <ConnectorLines nodes={nodes} links={links} />

        {/* ════════════════════════════════════════════
            ROW 1-2: AGENT (top-left)
            ════════════════════════════════════════════ */}

        {/* Agent leaves — row 1, col 1-3 */}
        <FloatingBlock floatDelay={1} style={{ gridColumn: "1 / 4", gridRow: "1" }}>
          <div style={cardS}>
            <DataRow label="ID"><EditableField value={agent.id} onChange={(v) => updateAgent("id", v)} type="text" /></DataRow>
            <DataRow label="Age"><EditableField value={agent.age} onChange={(v) => updateAgent("age", v)} type="number" /></DataRow>
            <DataRow label="Gender">
              <EditableField value={agent.gender} onChange={(v) => updateAgent("gender", v)} type="select"
                options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }]} />
            </DataRow>
            <DataRow label="MBTI">
              <EditableField value={agent.mbti} onChange={(v) => updateAgent("mbti", v)} type="select" options={mbtiOptions} />
            </DataRow>
            <DataRow label="Mobility">
              <EditableField value={agent.mobility} onChange={(v) => updateAgent("mobility", v)} type="select"
                options={[{ value: "normal", label: "Normal" }, { value: "walker", label: "Walker" }, { value: "wheelchair", label: "Wheelchair" }, { value: "cane", label: "Cane" }]} />
            </DataRow>
            <DataRow label="Hearing">
              <EditableField value={agent.hearing} onChange={(v) => updateAgent("hearing", v)} type="select"
                options={[{ value: "normal", label: "normal" }, { value: "impaired", label: "impaired" }, { value: "deaf", label: "deaf" }]}
                highlight={agent.hearing !== "normal"} />
            </DataRow>
            <DataRow label="Vision">
              <EditableField value={visionLabel} onChange={(v) => {
                const map: Record<string, string> = { "normal": "normal", "mild imp.": "mild_impairment", "severe imp.": "severe_impairment" };
                updateAgent("vision", map[v] || v);
              }} type="select"
                options={[{ value: "normal", label: "normal" }, { value: "mild imp.", label: "mild imp." }, { value: "severe imp.", label: "severe imp." }]}
                highlight={agent.vision !== "normal"} />
            </DataRow>
            <div className="no-drag" style={{ marginTop: 4 }}>
              <SliderField label="Met" value={agent.metabolic_rate} min={0.8} max={4} step={0.05}
                onChange={(v) => updateAgent("metabolic_rate", String(v))} color={COLORS.agent} />
              <SliderField label="Clo" value={agent.clothing_insulation} min={0} max={2} step={0.05}
                onChange={(v) => updateAgent("clothing_insulation", String(v))} color={COLORS.agent} />
            </div>
          </div>
        </FloatingBlock>

        {/* Agent tag — row 2, col 2 */}
        <div ref={registerRef("cat-agent")} style={{ gridColumn: "2", gridRow: "2", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <FloatingBlock floatDelay={1.5}>
            <SectionTag label="AGENT" icon="◎" color={COLORS.agent} />
          </FloatingBlock>
        </div>

        {/* ════════════════════════════════════════════
            ROW 1-2: POSITION (top-right)
            ════════════════════════════════════════════ */}

        {/* Position leaves — row 1, col 5-7 */}
        <FloatingBlock floatDelay={2} style={{ gridColumn: "5 / 8", gridRow: "1" }}>
          <div style={cardS}>
            <DataRow label="Cell"><span style={MONO}>[{position.cell[0]}, {position.cell[1]}]</span></DataRow>
            <DataRow label="Time"><EditableField value={position.timestamp} onChange={(v) => updatePosition("timestamp", v)} type="time" /></DataRow>
            <DataRow label="Dur."><EditableField value={position.duration_in_cell} onChange={(v) => updatePosition("duration_in_cell", v)} suffix="min" /></DataRow>
          </div>
        </FloatingBlock>

        {/* Position tag — row 2, col 6 */}
        <div ref={registerRef("cat-position")} style={{ gridColumn: "6", gridRow: "2", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <FloatingBlock floatDelay={2.5}>
            <SectionTag label="POSITION" icon="◇" color={COLORS.position} />
          </FloatingBlock>
        </div>

        {/* ════════════════════════════════════════════
            ROW 3: PERSONA (center)
            ════════════════════════════════════════════ */}

        <div ref={registerRef("persona")} style={{ gridColumn: "3 / 6", gridRow: "3", display: "flex", justifyContent: "center", padding: "16px 0" }}>
          <FloatingBlock floatDelay={0} style={{ zIndex: 10 }}>
            <div style={{
              width: 180, height: 180, borderRadius: "50%",
              background: `linear-gradient(135deg, ${accent}15, ${accent}28)`,
              border: `2.5px solid ${accent}60`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 50px ${accent}12, 0 4px 24px rgba(0,0,0,0.06)`,
            }}>
              <div style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "2.5px", color: accent, textTransform: "uppercase", marginBottom: 6 }}>PERSONA</div>
              <div style={{ ...MONO, fontSize: "18px", color: "var(--foreground)" }}>{agent.id}</div>
              <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: 6 }}>
                {agent.age}{agent.gender === "female" ? "F" : "M"} · {agent.mobility} · {agent.mbti}
              </div>
            </div>
          </FloatingBlock>
        </div>

        {/* ════════════════════════════════════════════
            ROW 4-5: EXPERIENCE (left)
            ════════════════════════════════════════════ */}

        {/* Experience tag — row 4, col 1 */}
        <div ref={registerRef("cat-experience")} style={{ gridColumn: "1 / 3", gridRow: "4", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <FloatingBlock floatDelay={5}>
            <SectionTag label="ENV. SATISFACTION" icon="◌" color={COLORS.experience} />
          </FloatingBlock>
        </div>

        {/* Experience leaves — row 5, col 1-3 */}
        <FloatingBlock floatDelay={5.5} style={{ gridColumn: "1 / 4", gridRow: "5" }}>
          <div style={cardS}>
            <p style={{ fontSize: "11px", fontStyle: "italic", color: "var(--foreground)", lineHeight: 1.6, margin: "0 0 8px", borderLeft: `2px solid ${COLORS.experience}40`, paddingLeft: 8 }}>
              "{experience.summary}"
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ ...MONO, fontSize: "10px", border: `1.5px solid ${comfortColor}`, color: comfortColor, padding: "2px 8px", borderRadius: 4 }}>
                Comfort {experience.comfort_score}
              </span>
              <span style={{ fontSize: "10px", fontWeight: 700, color: trendInfo.color }}>
                {trendInfo.icon} {trendInfo.label}
              </span>
            </div>
            {prevExperience && prevExperience.comfort_score > 0 && (
              <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginBottom: 4 }}>
                PREV: Comfort {prevExperience.comfort_score} · {prevExperience.trend.toUpperCase()}
              </div>
            )}
            {comfortDelta !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, paddingTop: 4, borderTop: "1px dashed var(--border)" }}>
                <span style={{ ...MONO, fontSize: "10px", border: "1.5px solid #2E8B6A", color: "#2E8B6A", padding: "2px 8px", borderRadius: 4 }}>
                  Comfort {(experience.comfort_score + comfortDelta).toFixed(1)}
                </span>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#2E8B6A" }}>△ ESTIMATED</span>
              </div>
            )}
            {ruleTriggers.length > 0 && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--border)", display: "flex", flexWrap: "wrap", gap: 3 }}>
                {ruleTriggers.map((t) => (
                  <span key={t} style={{ ...MONO, fontSize: "9px", fontWeight: 500, padding: "2px 6px", background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 3 }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </FloatingBlock>

        {/* ════════════════════════════════════════════
            ROW 4-5: ENVIRONMENT (right)
            ════════════════════════════════════════════ */}

        {/* Environment tag — row 4, col 6-7 */}
        <div ref={registerRef("cat-environment")} style={{ gridColumn: "6 / 8", gridRow: "4", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <FloatingBlock floatDelay={3}>
            <SectionTag label="ENVIRONMENT" icon="◉" color={COLORS.environment} />
          </FloatingBlock>
        </div>

        {/* Environment leaves — row 5, col 5-7 */}
        <FloatingBlock floatDelay={3.5} style={{ gridColumn: "5 / 8", gridRow: "5" }}>
          <div style={cardS} className="no-drag">
            {!agentPlaced && (
              <div style={{ fontSize: "9px", textAlign: "center", padding: "4px", marginBottom: 4, background: "#FFF8E1", border: "1px solid #E8D48A", borderRadius: 4, color: "#8A6D00" }}>
                Agent not placed — default values
              </div>
            )}
            <SliderField label="Lux" value={environment.lux} min={0} max={2000} step={10}
              onChange={(v) => updateEnv("lux", String(v))} color={COLORS.environment} />
            <SliderField label="Noise" value={environment.dB} min={0} max={120} step={1} suffix="dB"
              onChange={(v) => updateEnv("dB", String(v))} color="#C44040" />
            <SliderField label="Temp" value={environment.air_temp} min={10} max={35} step={0.5} suffix="°C"
              onChange={(v) => updateEnv("air_temp", String(v))} color={COLORS.environment} />
            <SliderField label="RH" value={environment.humidity} min={0} max={100} step={1} suffix="%"
              onChange={(v) => updateEnv("humidity", String(v))} color="#4A90B8" />
            <SliderField label="Air V." value={environment.air_velocity} min={0} max={2} step={0.01} suffix="m/s"
              onChange={(v) => updateEnv("air_velocity", String(v))} color="#2E8B6A" />
          </div>
        </FloatingBlock>

        {/* ════════════════════════════════════════════
            ROW 6-7: PERCEPTUAL LOAD (left)
            ════════════════════════════════════════════ */}

        {/* Perceptual tag — row 6, col 2 */}
        <div ref={registerRef("cat-perceptual")} style={{ gridColumn: "2 / 4", gridRow: "6", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <FloatingBlock floatDelay={7}>
            <SectionTag label="PERCEPTUAL LOAD" icon="▐" color={COLORS.perceptual} />
          </FloatingBlock>
        </div>

        {/* Perceptual leaves — row 7, col 1-3 */}
        <FloatingBlock floatDelay={7.5} style={{ gridColumn: "1 / 4", gridRow: "7" }}>
          <div style={cardS}>
            <LoadBar label="Thermal" value={accumulatedState.thermal_discomfort} prevValue={prevAccumulatedState?.thermal_discomfort} />
            <LoadBar label="Visual" value={accumulatedState.visual_strain} prevValue={prevAccumulatedState?.visual_strain} note={accumulatedState.visual_strain > 0.4 ? "Signage contrast ↑" : undefined} />
            <LoadBar label="Noise" value={accumulatedState.noise_stress} prevValue={prevAccumulatedState?.noise_stress} note={accumulatedState.noise_stress > 0.5 ? "Acoustic absorption ↑" : undefined} />
            <LoadBar label="Social" value={accumulatedState.social_overload} prevValue={prevAccumulatedState?.social_overload} />
            <LoadBar label="Fatigue" value={accumulatedState.fatigue} prevValue={prevAccumulatedState?.fatigue} />
            <LoadBar label="Wayfind." value={accumulatedState.wayfinding_anxiety} prevValue={prevAccumulatedState?.wayfinding_anxiety} note={accumulatedState.wayfinding_anxiety > 0.4 ? "Sightline to egress ↑" : undefined} />
          </div>
        </FloatingBlock>

        {/* ════════════════════════════════════════════
            ROW 6-7: SPATIAL (right)
            ════════════════════════════════════════════ */}

        {/* Spatial tag — row 6, col 5-6 */}
        <div ref={registerRef("cat-spatial")} style={{ gridColumn: "5 / 7", gridRow: "6", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <FloatingBlock floatDelay={6}>
            <SectionTag label="SPATIAL" icon="□" color={COLORS.spatial} />
          </FloatingBlock>
        </div>

        {/* Spatial leaves — row 7, col 5-7 */}
        <FloatingBlock floatDelay={6.5} style={{ gridColumn: "5 / 8", gridRow: "7" }}>
          <div style={cardS}>
            <StaticRow label="→ Wall" value={!agentPlaced || spatial.dist_to_wall < 0 ? "—" : spatial.dist_to_wall} unit={agentPlaced && spatial.dist_to_wall >= 0 ? "m" : undefined} />
            <StaticRow label="→ Win." value={!agentPlaced || spatial.dist_to_window < 0 ? "—" : spatial.dist_to_window} unit={agentPlaced && spatial.dist_to_window >= 0 ? "m" : undefined} />
            <StaticRow label="→ Exit" value={!agentPlaced || spatial.dist_to_exit < 0 ? "—" : spatial.dist_to_exit} unit={agentPlaced && spatial.dist_to_exit >= 0 ? "m" : undefined} highlight={agentPlaced && spatial.dist_to_exit > 10} />
            <DataRow label="Ceil."><EditableField value={spatial.ceiling_h} onChange={(v) => updateSpatial("ceiling_h", v)} suffix="m" /></DataRow>
            <StaticRow label="Encl." value={!agentPlaced ? "—" : spatial.enclosure_ratio} />
            <StaticRow label="Vis.Ag" value={!agentPlaced ? "—" : spatial.visible_agents} />
          </div>
        </FloatingBlock>

        {/* ════════════════════════════════════════════
            ROW 8-9: COMPUTED / MODEL OUTPUTS (center-bottom)
            ════════════════════════════════════════════ */}

        {/* Computed tag — row 8, col 3-5 */}
        <div ref={registerRef("cat-computed")} style={{ gridColumn: "3 / 6", gridRow: "8", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <FloatingBlock floatDelay={8}>
            <SectionTag label="COMPUTED" icon="⊕" color={COLORS.computed} />
          </FloatingBlock>
        </div>

        {/* Computed leaves — row 9, col 2-6 */}
        <FloatingBlock floatDelay={8.5} style={{ gridColumn: "2 / 7", gridRow: "9" }}>
          <div style={cardS}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
              {[
                { label: "PMV", value: computedOutputs.PMV },
                { label: "PPD", value: computedOutputs.PPD },
                { label: "Eff.Lx", value: computedOutputs.effective_lux },
                { label: "Pr.dB", value: computedOutputs.perceived_dB },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 8px", background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6 }}>
                  <span style={{ fontSize: "9px", fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 2 }}>{item.label}</span>
                  <span style={{ ...MONO, fontSize: "14px" }}>{item.value}</span>
                </div>
              ))}
            </div>
            {computedOutputs.pmv_warnings && computedOutputs.pmv_warnings.length > 0 && (
              <div style={{ marginTop: 6, padding: "4px 8px", background: "#FFF8E1", border: "1px solid #E8D48A", borderRadius: 4, fontSize: "9px", color: "#6B5500" }}>
                {computedOutputs.pmv_warnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            )}
            <div className="no-drag">
              <FormulaModal />
            </div>
          </div>
        </FloatingBlock>

      </div>

      {/* ── FOOTER ── */}
      <div style={{ marginTop: 24, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "1px", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
            HKU DEPT. OF ARCHITECTURE · BUILDING INFORMATICS LAB
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4, alignItems: "center" }}>
            {[{ c: "#2E8B6A", l: "Normal" }, { c: "#D4A017", l: "Moderate" }, { c: "#C44040", l: "Alert" }].map((x) => (
              <span key={x.l} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "9px", color: "var(--muted-foreground)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: x.c, display: "inline-block" }} /> {x.l}
              </span>
            ))}
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
