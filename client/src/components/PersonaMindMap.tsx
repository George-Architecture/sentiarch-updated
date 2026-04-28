// ============================================================
// PersonaMindMap Component — Claude Design System
// Numbered sections · JetBrains Mono labels · thin progress bars
// Keeps full editable functionality from the main-branch version
// ============================================================

import { useState, useMemo, type ReactNode, type CSSProperties } from "react";
import type {
  PersonaData,
  ExperienceData,
  AccumulatedState,
  ComputedOutputs,
} from "@/lib/store";
import { buildAnxietyData } from "@/lib/store";

// ---------------------------------------------------------------
// Shared atoms (mirroring Claude app.jsx)
// ---------------------------------------------------------------

function Section({
  num, title, tag, badge, children, style,
}: {
  num: string;
  title: string;
  tag?: "amber" | "red" | "teal" | "green";
  badge?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const tagColors: Record<string, string> = {
    red: "var(--brick)",
    amber: "var(--amber)",
    teal: "var(--teal)",
    green: "var(--calm)",
  };
  const dotColor = tagColors[tag || "amber"];
  return (
    <div className="sa-section" style={style}>
      <div className="sa-section-head">
        <span className="sa-section-title">
          <span className="sa-section-dot" style={{ background: dotColor }} />
          <span>
            <span className="sa-section-title-num">{num}</span> · {title}
          </span>
        </span>
        {badge !== undefined && (
          <span className="sa-section-meta">{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function DataRow({
  label, value, onEdit, type = "text", options,
}: {
  label: string;
  value: string | number;
  onEdit?: (v: string) => void;
  type?: "text" | "number" | "select";
  options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    if (onEdit) onEdit(draft);
    setEditing(false);
  };

  if (editing && onEdit) {
    if (type === "select" && options) {
      return (
        <div className="sa-data-row">
          <span className="sa-data-row-label">{label}</span>
          <select
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 12,
              background: "var(--bg-2)", color: "var(--ink-0)",
              border: "1px solid var(--amber)", padding: "2px 6px",
            }}
          >
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div className="sa-data-row">
        <span className="sa-data-row-label">{label}</span>
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 12,
            background: "var(--bg-2)", color: "var(--ink-0)",
            border: "1px solid var(--amber)", padding: "2px 6px",
            width: 100, textAlign: "right",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="sa-data-row"
      onClick={() => onEdit && setEditing(true)}
      style={{ cursor: onEdit ? "pointer" : "default" }}
      title={onEdit ? "Click to edit" : undefined}
    >
      <span className="sa-data-row-label">{label}</span>
      <span className="sa-data-row-val">{value}</span>
    </div>
  );
}

function EnvBar({
  label, value, min, max, unit, color, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  color?: string;
  onChange?: (v: number) => void;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-0)", fontVariantNumeric: "tabular-nums" }}>
          {typeof value === "number" ? value.toFixed(value % 1 === 0 ? 0 : 1) : value}
          {unit && <span style={{ color: "var(--ink-3)", fontSize: 10 }}>{unit}</span>}
        </span>
      </div>
      <div style={{ position: "relative", height: 3, background: "var(--line-1)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: color || "var(--amber)", transition: "width .3s" }} />
        {onChange && (
          <input
            type="range" min={min} max={max} step={(max - min) / 100} value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            style={{ position: "absolute", inset: -6, width: "100%", height: 15, opacity: 0, cursor: "pointer" }}
          />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)" }}>{min}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)" }}>{max}</span>
      </div>
    </div>
  );
}

function SpatialRow({
  label, value, unit, arrow,
}: {
  label: string;
  value: number | null;
  unit?: string;
  arrow?: boolean;
}) {
  const displayVal = value == null || value < 0 ? "—" : value.toFixed(value % 1 === 0 ? 0 : 2);
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto auto",
      padding: "7px 0", borderBottom: "1px dashed var(--line-1)",
      alignItems: "center", gap: 8,
    }}>
      <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
        {arrow && <span style={{ color: "var(--amber)", marginRight: 4 }}>→</span>}
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: value == null || value < 0 ? "var(--ink-3)" : "var(--ink-0)", fontVariantNumeric: "tabular-nums" }}>
        {displayVal}
      </span>
      {unit && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)" }}>{unit}</span>}
    </div>
  );
}

function ComputedCell({
  label, value, unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--line-1)", padding: "10px 12px", flex: 1, textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, color: "var(--ink-0)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
      {unit && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)", marginTop: 3 }}>{unit}</div>}
    </div>
  );
}

function PLoadBar({
  label, value, color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 32px", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{label}</span>
      <div style={{ position: "relative", height: 4, background: "var(--line-1)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: color || "var(--amber)", transition: "width .4s" }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-2)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value.toFixed(1)}</span>
    </div>
  );
}

function InlineSlider({
  label, value, min, max, step = 0.1, onChange, color,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-0)", fontVariantNumeric: "tabular-nums" }}>{value.toFixed(1)}</span>
      </div>
      <div style={{ position: "relative", height: 28 }}>
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: "var(--line-2)", transform: "translateY(-50%)" }} />
        <div style={{ position: "absolute", top: "50%", left: 0, width: `${pct}%`, height: 2, background: color || "var(--amber)", transform: "translateY(-50%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "50%", left: `${pct}%`, width: 10, height: 10, background: "var(--bg-1)", border: `2px solid ${color || "var(--amber)"}`, borderRadius: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none" }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer", height: "100%" }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)" }}>{min}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)" }}>{max}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Main component
// ---------------------------------------------------------------

const ASI_LEVEL = (v: number) =>
  v <= 16 ? { label: "NORMAL",   color: "var(--calm)" }
  : v <= 23 ? { label: "MODERATE", color: "var(--amber)" }
  : { label: "SEVERE",   color: "var(--brick)" };

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
  const asi = agent.anxiety.asi_score;
  const asiLevel = ASI_LEVEL(asi);

  const [showFormulas, setShowFormulas] = useState(false);

  // ---- mutators ----
  const updateAgent = (key: keyof PersonaData["agent"], val: string | number) => {
    onPersonaChange({ ...persona, agent: { ...persona.agent, [key]: val } as PersonaData["agent"] });
  };

  const updateAsi = (v: number) => {
    onPersonaChange({
      ...persona,
      agent: { ...persona.agent, anxiety: buildAnxietyData(v) },
    });
  };

  const updateEnv = (key: keyof PersonaData["environment"], val: number) => {
    onPersonaChange({
      ...persona,
      environment: { ...persona.environment, [key]: val },
    });
  };

  // Derive comfort color
  const comfort = experience.comfort_score || 0;
  const comfortColor = comfort >= 7 ? "var(--calm)" : comfort >= 4 ? "var(--amber)" : "var(--brick)";

  // Compute trend arrow vs prevExperience
  const trendArrow = !prevExperience ? "—" :
    comfort > prevExperience.comfort_score ? "↑" :
    comfort < prevExperience.comfort_score ? "↓" : "→";
  const trendColor = !prevExperience ? "var(--ink-3)" :
    comfort > prevExperience.comfort_score ? "var(--calm)" :
    comfort < prevExperience.comfort_score ? "var(--brick)" : "var(--ink-2)";

  // Modifier display from anxiety
  const modifiers = useMemo(() => {
    const m = agent.anxiety.modifiers;
    return [
      { k: "Noise sensitivity", v: m.noise_sensitivity },
      { k: "Thermal range", v: 1 / m.thermal_comfort_range },
      { k: "Exit proximity", v: m.exit_proximity_need },
      { k: "Social threshold", v: m.social_threshold },
      { k: "Fatigue accum.", v: m.fatigue_accumulation },
    ];
  }, [agent.anxiety.modifiers]);

  const accentColor = personaColor?.primary || "var(--amber)";

  return (
    <div>
      {/* Persona badge */}
      {personaColor && (
        <div style={{
          padding: "8px 14px",
          borderBottom: "1px solid var(--line-1)",
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--bg-1)",
        }}>
          <span style={{ width: 10, height: 10, background: accentColor, borderRadius: 1 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em", color: accentColor, fontWeight: 500 }}>
            {agent.id}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)" }}>
            {personaColor.label}
          </span>
          <div className="flex-1" />
          {!agentPlaced && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--brick)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Not Placed
            </span>
          )}
          {hasSimulated && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--calm)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Simulated
            </span>
          )}
        </div>
      )}

      {/* ── 01 · AGENT ───────────────────────────────── */}
      <Section num="01" title="Agent" tag="amber" badge={agent.id}>
        <DataRow label="ID"       value={agent.id}        onEdit={(v) => updateAgent("id", v)} />
        <DataRow label="Age"      value={agent.age}       onEdit={(v) => updateAgent("age", parseInt(v) || 0)} type="number" />
        <DataRow label="Gender"   value={agent.gender}    onEdit={(v) => updateAgent("gender", v)} type="select" options={["male", "female"]} />
        <DataRow label="MBTI"     value={agent.mbti}      onEdit={(v) => updateAgent("mbti", v)} />
        <DataRow label="Mobility" value={agent.mobility}  onEdit={(v) => updateAgent("mobility", v)} type="select" options={["normal", "walker", "wheelchair", "cane"]} />
        <DataRow label="Hearing"  value={agent.hearing}   onEdit={(v) => updateAgent("hearing", v)} type="select" options={["normal", "impaired", "deaf"]} />
        <DataRow label="Vision"   value={agent.vision}    onEdit={(v) => updateAgent("vision", v)} type="select" options={["normal", "mild_impairment", "severe_impairment"]} />
        <div style={{ marginTop: 8 }}>
          <InlineSlider label="Met" value={agent.metabolic_rate}        min={0.5} max={4} step={0.1} onChange={(v) => updateAgent("metabolic_rate", v)} color="var(--brick)" />
          <InlineSlider label="Clo" value={agent.clothing_insulation}   min={0}   max={2} step={0.1} onChange={(v) => updateAgent("clothing_insulation", v)} color="var(--brick)" />
        </div>
      </Section>

      {/* ── 02 · ANXIETY ASI-3 ───────────────────────── */}
      <Section num="02" title="Anxiety (ASI-3)" tag="red" badge="0 – 72">
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>ASI Score</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-0)", fontVariantNumeric: "tabular-nums" }}>
              {asi}<span style={{ color: "var(--ink-3)" }}>/72</span>
            </span>
          </div>
          <div style={{ position: "relative", height: 32 }}>
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: "var(--line-2)", transform: "translateY(-50%)" }} />
            <div style={{ position: "absolute", top: "50%", left: 0, width: `${(asi / 72) * 100}%`, height: 2, background: asiLevel.color, transform: "translateY(-50%)", pointerEvents: "none", transition: "width .2s" }} />
            <div style={{ position: "absolute", top: "50%", left: `${(asi / 72) * 100}%`, width: 10, height: 10, background: "var(--bg-1)", border: `2px solid ${asiLevel.color}`, borderRadius: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none" }} />
            {[0, 16, 23, 72].map((v) => (
              <div key={v} style={{ position: "absolute", top: "calc(50% + 8px)", left: `${(v / 72) * 100}%`, transform: "translateX(-50%)", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ink-3)" }}>{v}</div>
            ))}
            <input
              type="range" min={0} max={72} value={asi}
              onChange={(e) => updateAsi(parseInt(e.target.value))}
              style={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer", height: "100%" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 4 }}>
          <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Level</span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
            padding: "3px 10px", border: `1px solid ${asiLevel.color}`, color: asiLevel.color, textTransform: "uppercase",
          }}>{asiLevel.label}</span>
        </div>

        <div style={{ marginTop: 4 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>
            Modifiers (read-only)
          </div>
          {modifiers.map((m, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "5px 0", borderBottom: "1px dashed var(--line-1)", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{m.k}</span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 11,
                color: m.v > 1.2 ? "var(--brick)" : m.v > 0.9 ? "var(--amber)" : "var(--ink-2)",
                fontVariantNumeric: "tabular-nums",
              }}>×{m.v.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5 }}>
          0–16 normal · 17–23 moderate · 24–72 severe
        </div>
      </Section>

      {/* ── 03 · POSITION ────────────────────────────── */}
      <Section num="03" title="Position" tag="amber">
        <DataRow label="Cell" value={`[${position.cell[0]}, ${position.cell[1]}]`} />
        <DataRow label="Time" value={position.timestamp} onEdit={(v) =>
          onPersonaChange({ ...persona, position: { ...position, timestamp: v } })
        } />
        <DataRow label="Dur." value={`${position.duration_in_cell} min`} onEdit={(v) =>
          onPersonaChange({ ...persona, position: { ...position, duration_in_cell: parseInt(v) || 0 } })
        } type="number" />
      </Section>

      {/* ── 04 · ENVIRONMENT ─────────────────────────── */}
      <Section num="04" title="Environment" tag="teal">
        <EnvBar label="Lux"    value={environment.lux}          min={0}    max={2000} color="var(--amber)" onChange={(v) => updateEnv("lux", v)} />
        <EnvBar label="Noise"  value={environment.dB}           min={0}    max={110}  unit=" dB"   color="#c4623a" onChange={(v) => updateEnv("dB", v)} />
        <EnvBar label="Temp"   value={environment.air_temp}     min={10}   max={40}   unit=" °C"   color="#7aa6c4" onChange={(v) => updateEnv("air_temp", v)} />
        <EnvBar label="RH"     value={environment.humidity}     min={0}    max={100}  unit=" %"    color="#8aa676" onChange={(v) => updateEnv("humidity", v)} />
        <EnvBar label="Air V." value={environment.air_velocity} min={0}    max={2}    unit=" m/s"  color="#8aa676" onChange={(v) => updateEnv("air_velocity", v)} />
      </Section>

      {/* ── 05 · SPATIAL ─────────────────────────────── */}
      <Section num="05" title="Spatial" tag="amber">
        <SpatialRow label="Wall"   value={spatial.dist_to_wall >= 0   ? spatial.dist_to_wall   : null} unit="m" arrow />
        <SpatialRow label="Win."   value={spatial.dist_to_window >= 0 ? spatial.dist_to_window : null} unit="m" arrow />
        <SpatialRow label="Exit"   value={spatial.dist_to_exit >= 0   ? spatial.dist_to_exit   : null} unit="m" arrow />
        <SpatialRow label="Ceil."  value={spatial.ceiling_h}      unit="m" />
        <SpatialRow label="Encl."  value={spatial.enclosure_ratio} />
        <SpatialRow label="Vis.Ag" value={spatial.visible_agents} />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)", marginTop: 6 }}>
          Auto-calculated from map geometry
        </div>
      </Section>

      {/* ── 06 · COMPUTED ────────────────────────────── */}
      <Section num="06" title="Computed" tag="green">
        <div style={{ display: "flex", gap: 1, marginBottom: 1 }}>
          <ComputedCell label="PMV" value={computedOutputs.PMV > 0 ? `+${computedOutputs.PMV.toFixed(2)}` : computedOutputs.PMV.toFixed(2)} />
          <ComputedCell label="PPD" value={`${computedOutputs.PPD.toFixed(0)}%`} />
        </div>
        <div style={{ display: "flex", gap: 1, marginBottom: 8 }}>
          <ComputedCell label="Eff. Lx" value={computedOutputs.effective_lux.toFixed(0)} />
          <ComputedCell label="Pr. dB"  value={computedOutputs.perceived_dB.toFixed(0)} />
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)", textAlign: "center", marginBottom: 8, letterSpacing: "0.04em" }}>
          ISO 7730 · Fanger Model · Anxiety-adjusted
        </div>
        <button
          onClick={() => setShowFormulas((f) => !f)}
          style={{
            width: "100%", padding: "9px",
            background: showFormulas ? "var(--amber)" : "var(--bg-2)",
            color: showFormulas ? "var(--bg-0)" : "var(--ink-1)",
            border: `1px solid ${showFormulas ? "var(--amber)" : "var(--line-2)"}`,
            fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, cursor: "pointer", letterSpacing: "0.02em",
          }}
        >
          {showFormulas ? "Hide Formulas" : "Show Formulas"}
        </button>
        {showFormulas && (
          <div style={{ marginTop: 8, padding: 10, background: "var(--bg-2)", border: "1px solid var(--line-1)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-2)", lineHeight: 1.7 }}>
            PMV = f(M, W, fcl, ta, tr, var, pa)<br />
            PPD = 100 − 95 × e^(−0.03353×PMV⁴ − 0.2179×PMV²)<br />
            Eff.Lx = E_v × CRI/100 × η_mel<br />
            Pr.dB = SPL + AF_dist − AR_room<br />
            Anx.dB = Pr.dB × noise_sensitivity<br />
            Anx.PMV = 1 / thermal_comfort_range
          </div>
        )}
        {computedOutputs.pmv_warnings && computedOutputs.pmv_warnings.length > 0 && (
          <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(200,90,85,0.08)", border: "1px solid rgba(200,90,85,0.3)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--brick)", lineHeight: 1.5 }}>
            {computedOutputs.pmv_warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
          </div>
        )}
      </Section>

      {/* ── 07 · EXPERIENCES ─────────────────────────── */}
      <Section num="07" title="Env. Satisfaction" tag="amber">
        <div style={{
          background: "var(--bg-2)", border: "1px solid var(--line-1)",
          padding: "12px 14px", marginBottom: 10,
          fontFamily: "var(--font-serif)", fontSize: 13, lineHeight: 1.6, color: "var(--ink-1)",
          borderLeft: "2px solid var(--amber)",
        }}>
          {hasSimulated && experience.summary
            ? experience.summary
            : <span style={{ color: "var(--ink-3)", fontStyle: "italic" }}>Run calculation to generate narrative…</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-2)", letterSpacing: "0.08em" }}>COMFORT</span>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 20, color: comfortColor }}>{comfort}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)" }}>/10</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, border: "1px solid var(--line-2)", padding: "2px 6px", color: trendColor, marginLeft: 4 }}>
            {trendArrow} {experience.trend}
          </span>
        </div>
        {prevExperience && (
          <div style={{
            marginTop: 10,
            display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "center", textAlign: "center",
          }}>
            <div style={{ background: "var(--bg-2)", border: "1px solid var(--line-1)", padding: "10px 6px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Before</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: prevExperience.comfort_score >= 7 ? "var(--calm)" : prevExperience.comfort_score >= 4 ? "var(--amber)" : "var(--brick)" }}>{prevExperience.comfort_score}</div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--ink-2)" }}>→</div>
            <div style={{ background: "var(--bg-2)", border: "1px solid var(--line-1)", padding: "10px 6px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>After</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: comfortColor }}>{comfort}</div>
            </div>
          </div>
        )}
        {ruleTriggers && ruleTriggers.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>
              Triggers
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {ruleTriggers.map((t, i) => (
                <span key={i} style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em",
                  padding: "2px 8px", border: "1px solid var(--amber)", color: "var(--amber)", textTransform: "uppercase",
                }}>{t}</span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── 08 · PERCEPTUAL LOAD ─────────────────────── */}
      <Section num="08" title="Perceptual Load" tag="red" style={{ borderBottom: "none" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
          <PLoadBar label="Thermal"  value={accumulatedState.thermal_discomfort} color={accumulatedState.thermal_discomfort  > 0.6 ? "var(--brick)" : "var(--amber)"} />
          <PLoadBar label="Visual"   value={accumulatedState.visual_strain}      color={accumulatedState.visual_strain       > 0.6 ? "var(--brick)" : "var(--amber)"} />
          <PLoadBar label="Noise"    value={accumulatedState.noise_stress}       color={accumulatedState.noise_stress        > 0.6 ? "var(--brick)" : "var(--amber)"} />
          <PLoadBar label="Social"   value={accumulatedState.social_overload}    color={accumulatedState.social_overload     > 0.6 ? "var(--brick)" : "var(--amber)"} />
          <PLoadBar label="Fatigue"  value={accumulatedState.fatigue}            color={accumulatedState.fatigue             > 0.6 ? "var(--brick)" : "var(--amber)"} />
          <PLoadBar label="Wayfind"  value={accumulatedState.wayfinding_anxiety} color={accumulatedState.wayfinding_anxiety  > 0.6 ? "var(--brick)" : "var(--amber)"} />
        </div>
        {prevAccumulatedState && (
          <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Δ since previous simulation ·
            <span style={{ marginLeft: 6, color: "var(--ink-2)" }}>
              Th {(accumulatedState.thermal_discomfort - prevAccumulatedState.thermal_discomfort).toFixed(2)} ·
              Vi {(accumulatedState.visual_strain - prevAccumulatedState.visual_strain).toFixed(2)} ·
              No {(accumulatedState.noise_stress - prevAccumulatedState.noise_stress).toFixed(2)}
            </span>
          </div>
        )}
      </Section>
    </div>
  );
}
