// ============================================================
// PersonaMindMap Component — Strict CSS Grid Layout
// Left (280px): Persona + Agent Image + Env. Satisfaction
// Center (flex grow): Agent + Perceptual Load
// Right (280px): Spatial + Position + Computed
// Bottom (center+right span): Environment
// ============================================================

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
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

// ================================================================
// SVG Agent Avatars
// ================================================================

function AgentAvatar({ persona, color, size = 180 }: {
  persona: PersonaData;
  color: string;
  size?: number;
}) {
  const { age, mobility, vision } = persona.agent;

  // Determine preset
  let preset: "young" | "middle" | "elderly" | "wheelchair" | "blind" = "young";
  if (vision === "severe_impairment") preset = "blind";
  else if (mobility === "wheelchair") preset = "wheelchair";
  else if (age >= 60 || mobility === "walker" || mobility === "cane") preset = "elderly";
  else if (age >= 40) preset = "middle";

  const w = size;
  const h = size;
  const cx = w / 2;
  const strokeW = 2.5;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background circle */}
      <circle cx={cx} cy={h / 2} r={w * 0.42} fill={`${color}12`} stroke={`${color}30`} strokeWidth={1} />

      {preset === "young" && (
        <g stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={cx} cy={h * 0.22} r={16} fill={`${color}20`} />
          <line x1={cx} y1={h * 0.31} x2={cx} y2={h * 0.55} />
          <line x1={cx} y1={h * 0.38} x2={cx - 22} y2={h * 0.50} />
          <line x1={cx} y1={h * 0.38} x2={cx + 22} y2={h * 0.50} />
          <line x1={cx} y1={h * 0.55} x2={cx - 16} y2={h * 0.75} />
          <line x1={cx} y1={h * 0.55} x2={cx + 16} y2={h * 0.75} />
          <line x1={cx - 16} y1={h * 0.75} x2={cx - 22} y2={h * 0.76} />
          <line x1={cx + 16} y1={h * 0.75} x2={cx + 22} y2={h * 0.76} />
          <text x={cx} y={h * 0.88} textAnchor="middle" fill={color} fontSize="10" fontFamily="Inter, sans-serif" fontWeight="600" stroke="none">
            Young Adult
          </text>
        </g>
      )}

      {preset === "middle" && (
        <g stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={cx} cy={h * 0.22} r={16} fill={`${color}20`} />
          <line x1={cx} y1={h * 0.31} x2={cx} y2={h * 0.56} />
          <line x1={cx} y1={h * 0.37} x2={cx - 20} y2={h * 0.52} />
          <line x1={cx} y1={h * 0.37} x2={cx + 20} y2={h * 0.52} />
          <rect x={cx + 16} y={h * 0.50} width={12} height={10} rx={2} fill="none" />
          <line x1={cx} y1={h * 0.56} x2={cx - 14} y2={h * 0.75} />
          <line x1={cx} y1={h * 0.56} x2={cx + 14} y2={h * 0.75} />
          <line x1={cx - 14} y1={h * 0.75} x2={cx - 20} y2={h * 0.76} />
          <line x1={cx + 14} y1={h * 0.75} x2={cx + 20} y2={h * 0.76} />
          <text x={cx} y={h * 0.88} textAnchor="middle" fill={color} fontSize="10" fontFamily="Inter, sans-serif" fontWeight="600" stroke="none">
            Middle-aged
          </text>
        </g>
      )}

      {preset === "elderly" && (
        <g stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={cx - 4} cy={h * 0.22} r={15} fill={`${color}20`} />
          <path d={`M${cx - 4} ${h * 0.30} Q${cx - 2} ${h * 0.42} ${cx - 6} ${h * 0.55}`} fill="none" />
          <line x1={cx - 6} y1={h * 0.38} x2={cx - 24} y2={h * 0.50} />
          <line x1={cx - 24} y1={h * 0.48} x2={cx - 26} y2={h * 0.76} strokeWidth={3} />
          <line x1={cx - 4} y1={h * 0.38} x2={cx + 14} y2={h * 0.48} />
          <line x1={cx - 6} y1={h * 0.55} x2={cx - 16} y2={h * 0.75} />
          <line x1={cx - 6} y1={h * 0.55} x2={cx + 8} y2={h * 0.75} />
          <line x1={cx - 16} y1={h * 0.75} x2={cx - 22} y2={h * 0.76} />
          <line x1={cx + 8} y1={h * 0.75} x2={cx + 14} y2={h * 0.76} />
          <text x={cx} y={h * 0.88} textAnchor="middle" fill={color} fontSize="10" fontFamily="Inter, sans-serif" fontWeight="600" stroke="none">
            Elderly
          </text>
        </g>
      )}

      {preset === "wheelchair" && (
        <g stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={cx} cy={h * 0.20} r={15} fill={`${color}20`} />
          <line x1={cx} y1={h * 0.28} x2={cx} y2={h * 0.48} />
          <line x1={cx} y1={h * 0.36} x2={cx - 20} y2={h * 0.42} />
          <line x1={cx} y1={h * 0.36} x2={cx + 20} y2={h * 0.42} />
          <line x1={cx} y1={h * 0.48} x2={cx - 8} y2={h * 0.58} />
          <line x1={cx - 8} y1={h * 0.58} x2={cx - 6} y2={h * 0.66} />
          <line x1={cx + 18} y1={h * 0.30} x2={cx + 18} y2={h * 0.60} />
          <line x1={cx - 10} y1={h * 0.48} x2={cx + 18} y2={h * 0.48} />
          <circle cx={cx + 12} cy={h * 0.62} r={14} fill="none" />
          <circle cx={cx - 14} cy={h * 0.66} r={6} fill="none" />
          <line x1={cx - 14} y1={h * 0.60} x2={cx - 6} y2={h * 0.66} />
          <text x={cx} y={h * 0.88} textAnchor="middle" fill={color} fontSize="10" fontFamily="Inter, sans-serif" fontWeight="600" stroke="none">
            Wheelchair
          </text>
        </g>
      )}

      {preset === "blind" && (
        <g stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={cx} cy={h * 0.22} r={16} fill={`${color}20`} />
          <line x1={cx - 10} y1={h * 0.21} x2={cx + 10} y2={h * 0.21} strokeWidth={3} />
          <line x1={cx} y1={h * 0.31} x2={cx} y2={h * 0.55} />
          <line x1={cx} y1={h * 0.38} x2={cx - 16} y2={h * 0.48} />
          <line x1={cx - 16} y1={h * 0.48} x2={cx - 34} y2={h * 0.76} strokeWidth={3} />
          <line x1={cx} y1={h * 0.38} x2={cx + 18} y2={h * 0.48} />
          <line x1={cx} y1={h * 0.55} x2={cx - 14} y2={h * 0.75} />
          <line x1={cx} y1={h * 0.55} x2={cx + 14} y2={h * 0.75} />
          <line x1={cx - 14} y1={h * 0.75} x2={cx - 20} y2={h * 0.76} />
          <line x1={cx + 14} y1={h * 0.75} x2={cx + 20} y2={h * 0.76} />
          <text x={cx} y={h * 0.88} textAnchor="middle" fill={color} fontSize="10" fontFamily="Inter, sans-serif" fontWeight="600" stroke="none">
            Visually Impaired
          </text>
        </g>
      )}
    </svg>
  );
}

// ================================================================
// Inline Editable Field
// ================================================================

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
          fontSize: "12px",
        }}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="cursor-pointer px-2 py-0.5 rounded-md transition-all hover:bg-[var(--muted)]"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "12px",
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

// ================================================================
// Reusable Sub-Components
// ================================================================

function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-1" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)", letterSpacing: "0.3px" }}>{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

function StaticRow({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-1" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 600, color: "var(--foreground)" }}>
        {value}
        {unit && <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  );
}

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
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs font-medium w-14 shrink-0" style={{ color: "var(--muted-foreground)", fontSize: "10px" }}>{label}</span>
      <div className="flex-1 relative" style={{ height: 5, background: "var(--muted)", borderRadius: 3 }}>
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          width: `${value * 100}%`, background: color,
          borderRadius: 3, transition: "width 0.5s ease",
        }} />
      </div>
      <span className="text-xs w-6 text-right shrink-0" style={{
        fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "var(--foreground)", fontSize: "10px",
      }}>
        {value.toFixed(1)}
      </span>
      {hasPrev && Math.abs(delta) >= 0.01 && (
        <span className="text-xs w-8 text-right shrink-0" style={{
          fontWeight: 600, color: delta > 0 ? "#C44040" : "#2E8B6A", fontSize: "10px",
        }}>
          {delta > 0 ? "+" : ""}{delta.toFixed(1)}
        </span>
      )}
    </div>
  );
}

function SectionTag({ label, icon, color }: { label: string; icon: string; color?: string }) {
  const c = color || "var(--primary)";
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-2 rounded-md"
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
      <span style={{ fontSize: "11px" }}>{icon}</span> {label}
    </div>
  );
}

function Panel({ children, className = "", style = {} }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`sa-panel ${className}`} style={{ padding: "12px", ...style }}>
      {children}
    </div>
  );
}

// ================================================================
// Design Intervention Arrow Mock-up
// ================================================================

function InterventionArrow() {
  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px dashed var(--border)" }}>
      <div className="text-xs font-semibold tracking-wider mb-2" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>
        DESIGN INTERVENTION
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 p-2 text-center rounded-lg" style={{
          background: "var(--muted)", border: "1px solid var(--border)", boxShadow: "var(--shadow-inset)",
        }}>
          <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>BEFORE</div>
          <div className="text-lg font-bold" style={{ color: "#C44040", fontFamily: "'JetBrains Mono', monospace" }}>4</div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>Comfort</div>
        </div>
        <div className="flex flex-col items-center gap-1 px-1">
          <span className="font-semibold px-1.5 py-0.5 rounded" style={{
            background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "8px", letterSpacing: "0.5px",
          }}>+WINDOW</span>
          <svg width="30" height="10" viewBox="0 0 30 10">
            <defs><marker id="ah2" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
              <polygon points="0 0, 6 2.5, 0 5" fill="var(--primary)" />
            </marker></defs>
            <line x1="2" y1="5" x2="24" y2="5" stroke="var(--primary)" strokeWidth="1.5" markerEnd="url(#ah2)" />
          </svg>
          <span className="font-semibold px-1.5 py-0.5 rounded" style={{
            background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "8px", letterSpacing: "0.5px",
          }}>+LIGHT</span>
        </div>
        <div className="flex-1 p-2 text-center rounded-lg" style={{
          background: "var(--muted)", border: "1px solid var(--border)", boxShadow: "var(--shadow-inset)",
        }}>
          <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>AFTER</div>
          <div className="text-lg font-bold" style={{ color: "#2E8B6A", fontFamily: "'JetBrains Mono', monospace" }}>7</div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>Comfort</div>
        </div>
      </div>
      <div className="text-xs mt-1.5 text-center" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>
        Mock-up: Intervention Feedback Loop
      </div>
    </div>
  );
}

// ================================================================
// Show Formula Modal
// ================================================================

function FormulaModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="sa-btn w-full mt-2" style={{
          fontSize: "11px", padding: "8px 12px",
          background: "var(--primary)", color: "var(--primary-foreground)",
          border: "none",
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
          {/* PMV */}
          <div>
            <h4 className="text-sm font-bold mb-2" style={{ color: "var(--primary)" }}>
              PMV — Predicted Mean Vote (ISO 7730 Fanger)
            </h4>
            <div className="p-3 rounded-lg" style={{
              background: "var(--muted)", border: "1px solid var(--border)",
              fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: 1.8,
            }}>
              <div>PMV = f(M, W, I<sub>cl</sub>, f<sub>cl</sub>, t<sub>a</sub>, t<sub>r</sub>, v<sub>ar</sub>, p<sub>a</sub>)</div>
              <div className="mt-2" style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                PMV = [0.303 × exp(-0.036 × M) + 0.028] × L
              </div>
              <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                where L = internal heat production - heat loss
              </div>
              <div className="mt-2" style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                M = metabolic rate (W/m²) &nbsp;|&nbsp; W = external work (≈0)<br />
                I<sub>cl</sub> = clothing insulation (clo) &nbsp;|&nbsp; f<sub>cl</sub> = clothing area factor<br />
                t<sub>a</sub> = air temperature (°C) &nbsp;|&nbsp; t<sub>r</sub> = mean radiant temp (°C)<br />
                v<sub>ar</sub> = relative air velocity (m/s) &nbsp;|&nbsp; p<sub>a</sub> = water vapour pressure (Pa)
              </div>
            </div>
          </div>

          {/* PPD */}
          <div>
            <h4 className="text-sm font-bold mb-2" style={{ color: "var(--primary)" }}>
              PPD — Predicted Percentage Dissatisfied
            </h4>
            <div className="p-3 rounded-lg" style={{
              background: "var(--muted)", border: "1px solid var(--border)",
              fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: 1.8,
            }}>
              <div>PPD = 100 - 95 × exp(-0.03353 × PMV⁴ - 0.2179 × PMV²)</div>
              <div className="mt-2" style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                Range: 5% (PMV=0, neutral) → 100% (extreme discomfort)
              </div>
            </div>
          </div>

          {/* Enclosure */}
          <div>
            <h4 className="text-sm font-bold mb-2" style={{ color: "#D4A017" }}>
              Enclosure Ratio — Ray Casting Method
            </h4>
            <div className="p-3 rounded-lg" style={{
              background: "var(--muted)", border: "1px solid var(--border)",
              fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: 1.8,
            }}>
              <div>Enclosure = 1 - (open_rays / total_rays)</div>
              <div className="mt-2" style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                16 rays cast from agent position at 22.5° intervals<br />
                Each ray checks intersection with walls and room boundaries<br />
                Max ray distance: 10,000mm (10m)
              </div>
            </div>
          </div>

          {/* Effective Lux */}
          <div>
            <h4 className="text-sm font-bold mb-2" style={{ color: "#D4A017" }}>
              Effective Lux — Vision-Adjusted Illuminance
            </h4>
            <div className="p-3 rounded-lg" style={{
              background: "var(--muted)", border: "1px solid var(--border)",
              fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: 1.8,
            }}>
              <div>Eff.Lux = base_lux + Σ(window_influence × distance_decay)</div>
              <div className="mt-2" style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                Window influence: max +400 lux, quadratic decay over 5000mm
              </div>
              <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                Vision adjustment: normal ×1.0 | mild ×0.5 | severe ×0.15
              </div>
            </div>
          </div>

          {/* Perceived dB */}
          <div>
            <h4 className="text-sm font-bold mb-2" style={{ color: "#C44040" }}>
              Perceived dB — Hearing-Adjusted Noise
            </h4>
            <div className="p-3 rounded-lg" style={{
              background: "var(--muted)", border: "1px solid var(--border)",
              fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: 1.8,
            }}>
              <div>Pr.dB = base_dB × hearing_factor</div>
              <div className="mt-2" style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                Hearing factor: normal ×1.0 | impaired ×0.6 | deaf ×0.1
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ================================================================
// PMV Warnings
// ================================================================

function PMVWarnings({ computedOutputs }: { computedOutputs: ComputedOutputs }) {
  const warnings = computedOutputs.pmv_warnings || [];
  if (warnings.length === 0) return null;
  return (
    <div className="mt-2 px-2 py-2 rounded-lg" style={{
      background: "#FFF8E1", border: "1px solid #E8D48A", fontSize: "10px",
    }}>
      <div className="font-semibold mb-0.5" style={{ color: "#8A6D00", letterSpacing: "0.5px" }}>PMV Notes</div>
      {warnings.map((w, i) => (
        <div key={i} style={{ color: "#6B5500", lineHeight: 1.5 }}>{w}</div>
      ))}
    </div>
  );
}

// ================================================================
// Main Component
// ================================================================

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
    <div className="w-full">
      {/* ============ STRICT CSS GRID: 3 columns ============ */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr 280px",
        gridTemplateRows: "auto auto auto auto",
        gap: "12px",
      }}>

        {/* ================================================================ */}
        {/* ROW 1-3: LEFT COLUMN                                            */}
        {/* ================================================================ */}

        {/* -- R1 Left: PERSONA card (small) -- */}
        <div style={{ gridColumn: "1", gridRow: "1" }}>
          <SectionTag label="PERSONA" icon="●" color={accentColor} />
          <Panel>
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
              <SliderField label="Met Rate" value={agent.metabolic_rate} min={0.8} max={4} step={0.05}
                onChange={(v) => updateAgent("metabolic_rate", String(v))} color={accentColor} />
              <SliderField label="Clothing (Clo)" value={agent.clothing_insulation} min={0} max={2} step={0.05}
                onChange={(v) => updateAgent("clothing_insulation", String(v))} color={accentColor} />
            </div>
          </Panel>
        </div>

        {/* -- R2 Left: Agent Image card (large) -- */}
        <div style={{ gridColumn: "1", gridRow: "2" }}>
          <Panel className="flex items-center justify-center" style={{ minHeight: 200 }}>
            <AgentAvatar persona={persona} color={accentColor} size={180} />
          </Panel>
        </div>

        {/* -- R3-4 Left: Env. Satisfaction card (large) -- */}
        <div style={{ gridColumn: "1", gridRow: "3 / 5" }}>
          <SectionTag label="ENV. SATISFACTION" icon="◌" color="#1D6B5E" />
          <Panel>
            <p className="text-xs italic mb-2" style={{ color: "var(--foreground)", lineHeight: 1.6, fontSize: "11px" }}>
              "{experience.summary}"
            </p>
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <span className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{
                background: getComfortColor(experience.comfort_score).bg,
                color: getComfortColor(experience.comfort_score).text,
                boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                letterSpacing: "0.5px", fontSize: "10px",
              }}>
                COMFORT {experience.comfort_score}/10
              </span>
              {comfortDelta !== null && Math.abs(comfortDelta) >= 0.1 && (
                <span className="text-xs font-bold px-2 py-1.5 rounded-lg" style={{
                  background: comfortDelta > 0 ? "#1D6B5E" : "#C44040",
                  color: "#FFFFFF", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", fontSize: "10px",
                }}>
                  {comfortDelta > 0 ? "+" : ""}{comfortDelta.toFixed(1)}
                </span>
              )}
              <span className="text-xs font-semibold px-2 py-1.5 rounded-lg" style={{
                background: "var(--muted)", color: getTrendInfo(experience.trend).color,
                border: "1px solid var(--border)", fontSize: "10px",
              }}>
                {getTrendInfo(experience.trend).icon} {getTrendInfo(experience.trend).label}
              </span>
            </div>

            {ruleTriggers.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1 mb-2">
                {ruleTriggers.map((t) => (
                  <span key={t} className="sa-tag" style={{ fontSize: "9px" }}>{t}</span>
                ))}
              </div>
            )}

            <InterventionArrow />
          </Panel>
        </div>

        {/* ================================================================ */}
        {/* ROW 1-2: CENTER COLUMN                                          */}
        {/* ================================================================ */}

        {/* -- R1 Center: AGENT card (large, spans rows 1-2) -- */}
        <div style={{ gridColumn: "2", gridRow: "1 / 3" }}>
          <SectionTag label="AGENT" icon="◆" color={accentColor} />
          <Panel style={{
            borderTop: `3px solid ${accentColor}`,
            height: "calc(100% - 28px)",
          }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: accentColor, color: "#fff" }}>
                {agent.id.replace("persona_", "P")}
              </div>
              <div>
                <div className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{agent.id}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {agent.age}{agent.gender === "female" ? "F" : "M"} · {agent.mobility} · {agent.mbti}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              {[
                { label: "Met", value: agent.metabolic_rate.toFixed(1) },
                { label: "Clo", value: agent.clothing_insulation.toFixed(1) },
                { label: "Vision", value: agent.vision === "normal" ? "OK" : agent.vision === "mild_impairment" ? "Mild" : "Severe" },
              ].map((item) => (
                <div key={item.label} className="p-1.5 text-center rounded" style={{
                  background: "var(--muted)", border: "1px solid var(--border)", fontSize: "10px",
                }}>
                  <div style={{ color: "var(--muted-foreground)", fontWeight: 600 }}>{item.label}</div>
                  <div style={{ color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "12px" }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Editable fields inside Agent card */}
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <DataRow label="Name">
                <EditableField value={agent.id} onChange={(v) => updateAgent("id", v)} type="text" />
              </DataRow>
              <DataRow label="Gender">
                <EditableField value={agent.gender} onChange={(v) => updateAgent("gender", v)} type="select"
                  options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }]} />
              </DataRow>
              <DataRow label="Mobility">
                <EditableField value={agent.mobility} onChange={(v) => updateAgent("mobility", v)} type="select"
                  options={[
                    { value: "normal", label: "Normal" }, { value: "walker", label: "Walker" },
                    { value: "wheelchair", label: "Wheelchair" }, { value: "cane", label: "Cane" },
                  ]} />
              </DataRow>
              <DataRow label="MBTI">
                <EditableField value={agent.mbti} onChange={(v) => updateAgent("mbti", v)} type="select" options={mbtiOptions} />
              </DataRow>
            </div>
          </Panel>
        </div>

        {/* -- R3 Center: Perceptual Load card (medium) -- */}
        <div style={{ gridColumn: "2", gridRow: "3" }}>
          <SectionTag label="PERCEPTUAL LOAD" icon="▐" color="#C44040" />
          <Panel>
            <LoadBar label="Thermal" value={accumulatedState.thermal_discomfort} prevValue={prevAccumulatedState?.thermal_discomfort} />
            <LoadBar label="Visual" value={accumulatedState.visual_strain} prevValue={prevAccumulatedState?.visual_strain} />
            <LoadBar label="Noise" value={accumulatedState.noise_stress} prevValue={prevAccumulatedState?.noise_stress} />
            <LoadBar label="Social" value={accumulatedState.social_overload} prevValue={prevAccumulatedState?.social_overload} />
            <LoadBar label="Fatigue" value={accumulatedState.fatigue} prevValue={prevAccumulatedState?.fatigue} />
            <LoadBar label="Wayfind." value={accumulatedState.wayfinding_anxiety} prevValue={prevAccumulatedState?.wayfinding_anxiety} />
          </Panel>
        </div>

        {/* ================================================================ */}
        {/* ROW 1-3: RIGHT COLUMN                                           */}
        {/* ================================================================ */}

        {/* -- R1 Right: Spatial card (small) -- */}
        <div style={{ gridColumn: "3", gridRow: "1" }}>
          <SectionTag label="SPATIAL" icon="□" color="#D4A017" />
          <Panel>
            <StaticRow label="→ Wall" value={!agentPlaced || spatial.dist_to_wall < 0 ? "—" : spatial.dist_to_wall}
              unit={!agentPlaced || spatial.dist_to_wall < 0 ? undefined : "m"} />
            <StaticRow label="→ Window" value={!agentPlaced || spatial.dist_to_window < 0 ? "—" : spatial.dist_to_window}
              unit={!agentPlaced || spatial.dist_to_window < 0 ? undefined : "m"} />
            <StaticRow label="→ Exit" value={!agentPlaced || spatial.dist_to_exit < 0 ? "—" : spatial.dist_to_exit}
              unit={!agentPlaced || spatial.dist_to_exit < 0 ? undefined : "m"} />
            <DataRow label="Ceiling">
              <EditableField value={spatial.ceiling_h} onChange={(v) => updateSpatial("ceiling_h", v)} suffix="m" />
            </DataRow>
            <StaticRow label="Enclosure" value={!agentPlaced ? "—" : spatial.enclosure_ratio} />
            <StaticRow label="Vis. Agents" value={!agentPlaced ? "—" : spatial.visible_agents} />
            <div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>Auto-calculated from map</div>
          </Panel>
        </div>

        {/* -- R2 Right: Position card (small) -- */}
        <div style={{ gridColumn: "3", gridRow: "2" }}>
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

        {/* -- R3 Right: Computed card (medium) -- */}
        <div style={{ gridColumn: "3", gridRow: "3" }}>
          <SectionTag label="COMPUTED" icon="⊕" color="#1D6B5E" />
          <Panel>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "PMV", value: computedOutputs.PMV, tooltip: "Predicted Mean Vote (ISO 7730)" },
                { label: "PPD", value: `${computedOutputs.PPD}%`, tooltip: "Predicted Percentage Dissatisfied" },
                { label: "Eff. Lux", value: computedOutputs.effective_lux, tooltip: "Vision-adjusted illuminance" },
                { label: "Pr. dB", value: computedOutputs.perceived_dB, tooltip: "Hearing-adjusted noise" },
              ].map((item) => (
                <div key={item.label} className="p-2 text-center rounded-lg" title={item.tooltip}
                  style={{ background: "var(--muted)", border: "1px solid var(--border)", boxShadow: "var(--shadow-inset)" }}>
                  <div className="font-semibold" style={{ color: "var(--muted-foreground)", letterSpacing: "0.5px", fontSize: "10px" }}>{item.label}</div>
                  <div className="font-bold mt-0.5" style={{ color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace", fontSize: "18px" }}>{item.value}</div>
                </div>
              ))}
            </div>
            <PMVWarnings computedOutputs={computedOutputs} />
            <div className="mt-2 text-xs text-center" style={{ color: "var(--muted-foreground)", fontSize: "9px" }}>
              PMV/PPD: ISO 7730 Fanger Model
            </div>

            {/* Show Formula Button */}
            <FormulaModal />
          </Panel>
        </div>

        {/* ================================================================ */}
        {/* ROW 4: ENVIRONMENT card — spans center + right (col 2-3)        */}
        {/* ================================================================ */}
        <div style={{ gridColumn: "2 / 4", gridRow: "4" }}>
          <SectionTag label="ENVIRONMENT" icon="◉" color="#1D6B5E" />
          <Panel>
            {!agentPlaced && (
              <div className="text-xs text-center py-4 px-2 rounded-lg mb-2" style={{
                background: "#FFF8E1", border: "1px solid #E8D48A", color: "#8A6D00",
              }}>
                Agent not placed on map — showing default values
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {/* Left side: sliders */}
              <div>
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
              </div>
              {/* Right side: summary tiles */}
              <div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Light", value: `${environment.lux}`, unit: "lux", color: "#D4A017" },
                    { label: "Noise", value: `${environment.dB}`, unit: "dB", color: "#C44040" },
                    { label: "Temp", value: `${environment.air_temp}`, unit: "°C", color: "#1D6B5E" },
                    { label: "Humidity", value: `${environment.humidity}`, unit: "%", color: "#4A90B8" },
                  ].map((item) => (
                    <div key={item.label} className="p-2 text-center rounded-lg" style={{
                      background: "var(--muted)", border: "1px solid var(--border)",
                    }}>
                      <div style={{ color: item.color, fontSize: "9px", fontWeight: 700, letterSpacing: "0.5px" }}>{item.label}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "16px", color: "var(--foreground)" }}>
                        {item.value}
                        <span style={{ fontSize: "10px", color: "var(--muted-foreground)", marginLeft: 2 }}>{item.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-center" style={{ fontSize: "9px", color: "var(--muted-foreground)" }}>
                  Air Velocity: {environment.air_velocity} m/s · From zone data
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
