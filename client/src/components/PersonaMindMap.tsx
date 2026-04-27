// PersonaMindMap Component — Merged Version v3
// Layout: 12-column Tailwind grid with independent Avatar row
// Style: beige/teal CSS variables
// Avatar: Pixel art SVG with 36 variants (6 mobility × 3 age × 2 gender)
// Design Mode: drag + resize sections, export/import JSON, localStorage
// ============================================================

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import type {
  PersonaData,
  ExperienceData,
  AccumulatedState,
  ComputedOutputs,
  AnxietyLevel,
} from "@/lib/store";
import { buildAnxietyData, defaultAnxiety } from "@/lib/store";
import SliderField from "@/components/SliderField";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ================================================================
// Pixel Art SVG Avatar System — 36 variants
// ================================================================

function Px({ x, y, c, s = 1 }: { x: number; y: number; c: string; s?: number }) {
  return <rect x={x * 4} y={y * 4} width={4 * s} height={4} fill={c} />;
}

const PALETTES = {
  male_young: { skin: "#F2C5A0", hair: "#5B3A29", shirt: "#3B6EA5", pants: "#3A4A5C", shoe: "#2C2C2C" },
  female_young: { skin: "#F2C5A0", hair: "#8B4513", shirt: "#C75B7A", pants: "#4A4A6A", shoe: "#4A3030" },
  male_child: { skin: "#F5D0B0", hair: "#6B4226", shirt: "#5B9BD5", pants: "#6A7A8A", shoe: "#3C3C3C" },
  female_child: { skin: "#F5D0B0", hair: "#A0522D", shirt: "#E8829B", pants: "#7A6A9A", shoe: "#5A3A4A" },
  male_elderly: { skin: "#E8B890", hair: "#C0C0C0", shirt: "#6B7B5A", pants: "#5A5A5A", shoe: "#3A3A3A" },
  female_elderly: { skin: "#E8B890", hair: "#D3D3D3", shirt: "#8B6B7A", pants: "#5A5A6A", shoe: "#4A3A3A" },
};

function getAvatarVariant(agent: PersonaData["agent"]): {
  ageGroup: "child" | "young" | "elderly";
  gender: "male" | "female";
  mobility: "normal" | "wheelchair" | "cane" | "blind" | "blind_wheelchair" | "blind_cane";
} {
  const ageGroup = agent.age < 18 ? "child" : agent.age >= 60 ? "elderly" : "young";
  const gender = agent.gender === "female" ? "female" : "male";
  const isBlind = agent.vision === "severe_impairment";
  let mobility: "normal" | "wheelchair" | "cane" | "blind" | "blind_wheelchair" | "blind_cane";
  if (isBlind && agent.mobility === "wheelchair") mobility = "blind_wheelchair";
  else if (isBlind && (agent.mobility === "cane" || agent.mobility === "walker")) mobility = "blind_cane";
  else if (isBlind) mobility = "blind";
  else if (agent.mobility === "wheelchair") mobility = "wheelchair";
  else if (agent.mobility === "cane" || agent.mobility === "walker") mobility = "cane";
  else mobility = "normal";
  return { ageGroup, gender, mobility };
}

function getLabel(v: ReturnType<typeof getAvatarVariant>): string {
  const age = v.ageGroup === "child" ? "Child" : v.ageGroup === "elderly" ? "Elderly" : "Adult";
  const gen = v.gender === "female" ? "F" : "M";
  const mob = {
    normal: "", wheelchair: " · WC", cane: " · Cane",
    blind: " · Blind", blind_wheelchair: " · Blind+WC", blind_cane: " · Blind+Cane",
  }[v.mobility];
  return `${age} ${gen}${mob}`;
}

// ================================================================
// Pixel Art Body Renderers (32×40 grid at 4x = 128×160)
// ================================================================

function PixelBody_Normal({ p, isChild, isElderly, isFemale }: {
  p: typeof PALETTES.male_young; isChild: boolean; isElderly: boolean; isFemale: boolean;
}) {
  const headY = isChild ? 6 : 4;
  const bodyY = headY + 7;
  const legY = bodyY + (isChild ? 6 : 8);
  const bodyH = isChild ? 6 : 8;
  const headSize = isChild ? 5 : 6;
  const bodyW = isChild ? 4 : 5;
  const cx = 16;
  return (
    <g>
      {isFemale ? (
        <>
          {Array.from({ length: headSize + 2 }, (_, i) => (
            <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) - 1 + i} y={headY - 1} c={p.hair} />
          ))}
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY} c={p.hair} />
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY + 1} c={p.hair} />
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY + 2} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY + 1} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY + 2} c={p.hair} />
          {!isChild && (
            <>
              <Px x={cx - Math.floor(headSize / 2) - 1} y={headY + 3} c={p.hair} />
              <Px x={cx + Math.floor(headSize / 2) + 1} y={headY + 3} c={p.hair} />
              <Px x={cx - Math.floor(headSize / 2) - 1} y={headY + 4} c={p.hair} />
              <Px x={cx + Math.floor(headSize / 2) + 1} y={headY + 4} c={p.hair} />
            </>
          )}
        </>
      ) : (
        <>
          {Array.from({ length: headSize }, (_, i) => (
            <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) + i} y={headY - 1} c={p.hair} />
          ))}
          {isElderly && (
            <>
              <Px x={cx - Math.floor(headSize / 2)} y={headY} c={p.hair} />
              <Px x={cx + Math.floor(headSize / 2) - 1} y={headY} c={p.hair} />
            </>
          )}
        </>
      )}
      {Array.from({ length: headSize }, (_, row) =>
        Array.from({ length: headSize }, (_, col) => (
          <Px key={`face${row}_${col}`} x={cx - Math.floor(headSize / 2) + col} y={headY + row} c={p.skin} />
        ))
      )}
      <Px x={cx - 1} y={headY + 2} c="#333" />
      <Px x={cx + 1} y={headY + 2} c="#333" />
      <Px x={cx} y={headY + headSize} c={p.skin} />
      <Px x={cx - 1} y={headY + headSize} c={p.skin} />
      {Array.from({ length: bodyH }, (_, row) =>
        Array.from({ length: bodyW }, (_, col) => (
          <Px key={`body${row}_${col}`} x={cx - Math.floor(bodyW / 2) + col} y={bodyY + row}
            c={isFemale && row >= bodyH - 2 ? p.pants : p.shirt} />
        ))
      )}
      {Array.from({ length: isChild ? 4 : 5 }, (_, i) => (
        <Px key={`al${i}`} x={cx - Math.floor(bodyW / 2) - 1} y={bodyY + i} c={p.skin} />
      ))}
      {Array.from({ length: isChild ? 4 : 5 }, (_, i) => (
        <Px key={`ar${i}`} x={cx + Math.floor(bodyW / 2) + 1} y={bodyY + i} c={p.skin} />
      ))}
      {isElderly && (
        <>
          <Px x={cx - Math.floor(bodyW / 2) - 2} y={bodyY + 2} c={p.skin} />
          <Px x={cx + Math.floor(bodyW / 2) + 2} y={bodyY + 2} c={p.skin} />
        </>
      )}
      {Array.from({ length: isChild ? 4 : 6 }, (_, i) => (
        <Px key={`ll${i}`} x={cx - 1} y={legY + i} c={p.pants} />
      ))}
      {Array.from({ length: isChild ? 4 : 6 }, (_, i) => (
        <Px key={`lr${i}`} x={cx + 1} y={legY + i} c={p.pants} />
      ))}
      <Px x={cx - 2} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx - 1} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx + 1} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
      <Px x={cx + 2} y={legY + (isChild ? 4 : 6)} c={p.shoe} />
    </g>
  );
}

function PixelBody_Wheelchair({ p, isChild, isFemale }: {
  p: typeof PALETTES.male_young; isChild: boolean; isFemale: boolean;
}) {
  const headY = isChild ? 4 : 2;
  const headSize = isChild ? 5 : 6;
  const cx = 16;
  const bodyY = headY + headSize + 1;
  const bodyH = isChild ? 5 : 6;
  const bodyW = isChild ? 4 : 5;
  const chairY = bodyY + bodyH - 1;
  return (
    <g>
      {isFemale ? (
        <>
          {Array.from({ length: headSize + 2 }, (_, i) => (
            <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) - 1 + i} y={headY - 1} c={p.hair} />
          ))}
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY} c={p.hair} />
          <Px x={cx - Math.floor(headSize / 2) - 1} y={headY + 1} c={p.hair} />
          <Px x={cx + Math.floor(headSize / 2) + 1} y={headY + 1} c={p.hair} />
        </>
      ) : (
        Array.from({ length: headSize }, (_, i) => (
          <Px key={`h${i}`} x={cx - Math.floor(headSize / 2) + i} y={headY - 1} c={p.hair} />
        ))
      )}
      {Array.from({ length: headSize }, (_, row) =>
        Array.from({ length: headSize }, (_, col) => (
          <Px key={`f${row}_${col}`} x={cx - Math.floor(headSize / 2) + col} y={headY + row} c={p.skin} />
        ))
      )}
      <Px x={cx - 1} y={headY + 2} c="#333" />
      <Px x={cx + 1} y={headY + 2} c="#333" />
      <Px x={cx} y={headY + headSize} c={p.skin} />
      {Array.from({ length: bodyH }, (_, row) =>
        Array.from({ length: bodyW }, (_, col) => (
          <Px key={`b${row}_${col}`} x={cx - Math.floor(bodyW / 2) + col} y={bodyY + row} c={p.shirt} />
        ))
      )}
      <rect x={10} y={chairY * 4} width={12} height={4} fill="#555" />
      <rect x={22} y={chairY * 4} width={4} height={12} fill="#555" />
      <circle cx={14 * 4} cy={(chairY + 4) * 4} r={4 * 4} fill="none" stroke="#777" strokeWidth="4" />
      <circle cx={22 * 4} cy={(chairY + 4) * 4} r={4 * 4} fill="none" stroke="#777" strokeWidth="4" />
    </g>
  );
}

function PixelAvatar({ persona, color, size = 120 }: { persona: PersonaData; color: string; size?: number }) {
  const v = getAvatarVariant(persona.agent);
  const p = PALETTES[`${v.gender}_${v.ageGroup}` as keyof typeof PALETTES] || PALETTES.male_young;
  const isChild = v.ageGroup === "child";
  const isElderly = v.ageGroup === "elderly";
  const isFemale = v.gender === "female";

  return (
    <svg width={size} height={size} viewBox="0 0 128 160" style={{ shapeRendering: "crispEdges" }}>
      {v.mobility === "wheelchair" || v.mobility === "blind_wheelchair" ? (
        <PixelBody_Wheelchair p={p} isChild={isChild} isFemale={isFemale} />
      ) : (
        <PixelBody_Normal p={p} isChild={isChild} isElderly={isElderly} isFemale={isFemale} />
      )}
      {v.mobility.includes("blind") && (
        <g>
          <rect x={15 * 4} y={5 * 4} width={4 * 4} height={4} fill="#000" opacity="0.8" />
          <rect x={14 * 4} y={15 * 4} width={4} height={12 * 4} fill="#DDD" />
        </g>
      )}
      {v.mobility === "cane" && (
        <rect x={14 * 4} y={15 * 4} width={4} height={12 * 4} fill="#8B4513" />
      )}
    </svg>
  );
}

// ================================================================
// Design Mode System
// ================================================================

const STORAGE_KEY = "sentiarch_layout_v3";
const SECTION_KEYS = ["agent", "anxiety", "environment", "experience", "spatial", "outputs", "perceptual", "avatar", "persona"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

interface SectionLayout { x: number; y: number; w: number; h: number }
type LayoutConfig = Record<SectionKey, SectionLayout>;

const EMPTY_LAYOUT: LayoutConfig = SECTION_KEYS.reduce((acc, k) => {
  acc[k] = { x: 0, y: 0, w: 0, h: 0 };
  return acc;
}, {} as LayoutConfig);

function loadLayout(): LayoutConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : { ...EMPTY_LAYOUT };
  } catch { return { ...EMPTY_LAYOUT }; }
}
function saveLayout(cfg: LayoutConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

// ================================================================
// UI Components
// ================================================================

function FormulaModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-[9px] font-bold text-primary hover:underline mt-2 uppercase tracking-widest">
          View Formula Logic
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Occupant Perception Logic</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm leading-relaxed overflow-y-auto max-h-[60vh] pr-2">
          <p><strong>Thermal Comfort (PMV/PPD):</strong> Calculated via ISO 7730 Fanger model using Air Temp, RH, Air Velocity, Metabolic Rate, and Clothing Insulation.</p>
          <p><strong>Visual Load:</strong> Derived from Lux level vs. Agent sensitivity. High lux (&gt;1000) or low lux (&lt;100) increases visual strain based on age.</p>
          <p><strong>Acoustic Stress:</strong> Logarithmic dB scale. Noise sensitivity multiplier (from ASI-3) scales the impact of environmental dB on stress.</p>
          <p><strong>Social Overload:</strong> Function of visible agents and mobility constraints. Higher density increases wayfinding anxiety for impaired agents.</p>
          <p><strong>Fatigue:</strong> Accumulated over simulation duration. Mobility type (wheelchair/cane) accelerates fatigue gain.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PMVWarnings({ computedOutputs }: { computedOutputs: ComputedOutputs }) {
  const pmv = computedOutputs.PMV;
  if (pmv >= -0.5 && pmv <= 0.5) return null;
  const msg = pmv > 0.5 ? "Warm discomfort detected" : "Cool discomfort detected";
  return (
    <div className="mt-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2">
      <span className="text-destructive font-bold text-[10px]">!</span>
      <span className="text-destructive font-bold text-[9px] uppercase tracking-wider">{msg}</span>
    </div>
  );
}

function EditableField({
  value, onChange, type = "text", suffix, options, highlight = false,
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number" | "select" | "time";
  suffix?: string;
  options?: { value: string; label: string }[];
  highlight?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    onChange(draft);
    setEditing(false);
  };

  if (editing) {
    if (type === "select" && options) {
      return (
        <select autoFocus value={draft} onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); setEditing(false); }}
          className="sa-input text-xs" style={{ padding: "2px 4px" }}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <input autoFocus type={type === "time" ? "time" : type}
        value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        step={type === "number" ? "any" : undefined} className="sa-input text-right"
        style={{ width: type === "time" ? 90 : Math.max(60, String(value).length * 10 + 30), fontSize: "12px" }} />
    );
  }

  return (
    <span onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="cursor-pointer px-2 py-0.5 rounded-md transition-all hover:bg-[var(--muted)]"
      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 600,
        color: highlight ? "var(--destructive)" : "var(--foreground)" }}
      title="Click to edit">
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

/** Environment adjustable bar — manual adjustment unlocked in Phase 3 */
function EnvAdjustableBar({
  label, value, min, max, step = 1, suffix, color, onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; color: string; onChange: (v: number) => void;
}) {
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <div className="py-1.5 group">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className="w-12 bg-transparent text-right text-[11px] font-black tabular-nums border-none p-0 focus:ring-0"
            style={{ color }}
          />
          {suffix && <span className="text-[10px] font-bold text-muted-foreground">{suffix}</span>}
        </div>
      </div>
      <div className="relative h-2 w-full bg-muted/30 rounded-full overflow-hidden border border-border/50 cursor-pointer">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div className="h-full transition-all duration-200" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function AsiLevelBadge({ level }: { level: AnxietyLevel }) {
  const map: Record<AnxietyLevel, { bg: string; fg: string; label: string }> = {
    normal:   { bg: "#2E8B6A", fg: "#FFFFFF", label: "NORMAL" },
    moderate: { bg: "#D4A017", fg: "#FFFFFF", label: "MODERATE" },
    severe:   { bg: "#C44040", fg: "#FFFFFF", label: "SEVERE" },
  };
  const c = map[level];
  return (
    <span className="px-2.5 py-1 rounded-md" style={{
      background: c.bg, color: c.fg, fontFamily: "'JetBrains Mono', monospace",
      fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
    }}>{c.label}</span>
  );
}

function ModifierRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1 px-1"
      style={{ borderBottom: "1px dashed var(--border)" }}>
      <span className="text-xs" style={{ color: "var(--muted-foreground)", fontSize: "10px" }}>{label}</span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: "11px",
        fontWeight: 600, color: "var(--foreground)",
      }}>×{value.toFixed(2)}</span>
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
  const getColor = (v: number) => v <= 0.3 ? "#2E8B6A" : v <= 0.6 ? "#D4A017" : "#C44040";
  const color = getColor(value);
  const hasPrev = prevValue != null && prevValue !== 0;
  const delta = hasPrev ? value - (prevValue ?? 0) : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs font-medium w-14 shrink-0" style={{ color: "var(--muted-foreground)", fontSize: "10px" }}>{label}</span>
      <div className="flex-1 relative" style={{ height: 5, background: "var(--muted)", borderRadius: 3 }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${value * 100}%`, background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
      <span className="text-xs w-6 text-right shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "var(--foreground)", fontSize: "10px" }}>
        {value.toFixed(1)}
      </span>
      {hasPrev && Math.abs(delta) >= 0.01 && (
        <span className="text-xs w-8 text-right shrink-0" style={{ fontWeight: 600, color: delta > 0 ? "#C44040" : "#2E8B6A", fontSize: "10px" }}>
          {delta > 0 ? "+" : ""}{delta.toFixed(1)}
        </span>
      )}
    </div>
  );
}

function SectionTag({ label, icon, color }: { label: string; icon: string; color?: string }) {
  const c = color || "var(--primary)";
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-2 rounded-md"
      style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "1.2px",
        textTransform: "uppercase" as const, color: c, border: `1.5px solid ${c}`, background: `${c}10` }}>
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
// Design Section (Drag & Resize)
// ================================================================

function DesignSection({
  sectionKey, designMode, layout, onLayoutChange, children, className = "", style = {},
}: {
  sectionKey: SectionKey;
  designMode: boolean;
  layout: LayoutConfig;
  onLayoutChange: (k: SectionKey, p: Partial<SectionLayout>) => void;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const sl = layout[sectionKey] || { x: 0, y: 0, w: 0, h: 0 };
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  const onDragStart = (e: React.MouseEvent) => {
    if (!designMode) return;
    e.preventDefault();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: sl.x, origY: sl.y };
    const onMove = (me: MouseEvent) => {
      if (!dragState.current) return;
      onLayoutChange(sectionKey, {
        x: dragState.current.origX + (me.clientX - dragState.current.startX),
        y: dragState.current.origY + (me.clientY - dragState.current.startY),
      });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onResizeStart = (e: React.MouseEvent) => {
    if (!designMode) return;
    e.stopPropagation();
    e.preventDefault();
    const w = elRef.current?.offsetWidth || 0;
    const h = elRef.current?.offsetHeight || 0;
    resizeState.current = { startX: e.clientX, startY: e.clientY, origW: w, origH: h };
    const onMove = (me: MouseEvent) => {
      if (!resizeState.current) return;
      onLayoutChange(sectionKey, {
        w: resizeState.current.origW + (me.clientX - resizeState.current.startX),
        h: resizeState.current.origH + (me.clientY - resizeState.current.startY),
      });
    };
    const onUp = () => {
      resizeState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const transform = sl.x !== 0 || sl.y !== 0 ? `translate(${sl.x}px, ${sl.y}px)` : undefined;
  const customWidth = sl.w > 0 ? sl.w : undefined;
  const customHeight = sl.h > 0 ? sl.h : undefined;

  return (
    <div
      ref={elRef}
      className={className}
      onMouseDown={onDragStart}
      style={{
        ...style,
        transform,
        width: customWidth,
        height: customHeight,
        overflow: customHeight ? "auto" : undefined,
        position: "relative",
        cursor: designMode ? "grab" : undefined,
        outline: designMode ? "2px dashed var(--primary)" : undefined,
        outlineOffset: designMode ? "2px" : undefined,
        transition: dragState.current || resizeState.current ? "none" : "transform 0.2s ease",
        userSelect: designMode ? "none" : undefined,
        zIndex: designMode ? 10 : undefined,
      }}
    >
      {designMode && (
        <div style={{
          position: "absolute", top: -10, left: 4, background: "var(--primary)",
          color: "var(--primary-foreground)", fontSize: "8px", fontWeight: 700,
          padding: "1px 6px", borderRadius: "3px", zIndex: 20, letterSpacing: "0.5px",
          textTransform: "uppercase",
        }}>
          {sectionKey}
        </div>
      )}
      {children}
      {designMode && (
        <div
          onMouseDown={onResizeStart}
          style={{
            position: "absolute", bottom: 0, right: 0, width: 16, height: 16,
            cursor: "nwse-resize", zIndex: 20,
            background: "linear-gradient(135deg, transparent 50%, var(--primary) 50%)",
            borderRadius: "0 0 4px 0", opacity: 0.7,
          }}
        />
      )}
    </div>
  );
}

// ================================================================
// Design Mode Toolbar
// ================================================================

function DesignToolbar({
  designMode, setDesignMode, layout, onReset, onImport,
}: {
  designMode: boolean;
  setDesignMode: (v: boolean) => void;
  layout: LayoutConfig;
  onReset: () => void;
  onImport: (config: LayoutConfig) => void;
}) {
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);

  const handleExport = () => {
    const json = JSON.stringify(layout, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }).catch(() => {
      prompt("Copy this layout JSON:", json);
    });
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText);
      onImport(parsed);
      setShowImport(false);
      setImportText("");
    } catch {
      alert("Invalid JSON format");
    }
  };

  const btnBase: React.CSSProperties = {
    fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", padding: "5px 12px",
    borderRadius: "6px", border: "1.5px solid var(--border)", cursor: "pointer",
    fontFamily: "'Inter', sans-serif", transition: "all 0.15s ease",
  };

  return (
    <div className="flex items-center gap-2 flex-wrap mb-3">
      <button
        onClick={() => setDesignMode(!designMode)}
        style={{
          ...btnBase,
          background: designMode ? "var(--primary)" : "var(--card)",
          color: designMode ? "var(--primary-foreground)" : "var(--foreground)",
          border: designMode ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
        }}
      >
        {designMode ? "✓ Design Mode ON" : "⚙ Design Mode"}
      </button>

      {designMode && (
        <>
          <button onClick={handleExport} style={{ ...btnBase, background: "var(--card)", color: "var(--foreground)" }}>
            {copyFeedback ? "✓ Copied!" : "↗ Export Layout"}
          </button>
          <button onClick={() => setShowImport(!showImport)} style={{ ...btnBase, background: "var(--card)", color: "var(--foreground)" }}>
            ↙ Import Layout
          </button>
          <button onClick={onReset} style={{ ...btnBase, background: "#C4404015", color: "#C44040", border: "1.5px solid #C4404040" }}>
            ↺ Reset
          </button>
        </>
      )}

      {showImport && (
        <div className="w-full mt-2 p-3 rounded-lg" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-semibold mb-2" style={{ color: "var(--foreground)" }}>Paste Layout JSON:</div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={6}
            className="w-full p-2 rounded-md text-xs"
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: "10px",
              background: "var(--card)", border: "1px solid var(--border)",
              color: "var(--foreground)", resize: "vertical",
            }}
            placeholder='{"agent":{"x":0,"y":0,"w":0,"h":0},...}'
          />
          <div className="flex gap-2 mt-2">
            <button onClick={handleImport} style={{ ...btnBase, background: "var(--primary)", color: "var(--primary-foreground)", border: "none" }}>Apply</button>
            <button onClick={() => { setShowImport(false); setImportText(""); }} style={{ ...btnBase, background: "var(--card)", color: "var(--foreground)" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// Main Component
// ================================================================

export default function PersonaMindMap({
  persona, experience, accumulatedState, computedOutputs, ruleTriggers,
  prevExperience, onPersonaChange,
  hasSimulated = true, personaColor, agentPlaced = false,
}: {
  persona: PersonaData;
  experience: ExperienceData;
  accumulatedState: AccumulatedState;
  computedOutputs: ComputedOutputs;
  ruleTriggers: string[];
  prevExperience: ExperienceData | null;
  onPersonaChange: (p: PersonaData) => void;
  hasSimulated?: boolean;
  personaColor?: { primary: string; secondary: string; bg: string; label: string };
  agentPlaced?: boolean;
}) {
  const { agent, environment, spatial } = persona;
  const containerRef = useRef<HTMLDivElement>(null);
  const [designMode, setDesignMode] = useState(false);
  const [layout, setLayout] = useState<LayoutConfig>(() => loadLayout());

  useEffect(() => { saveLayout(layout); }, [layout]);

  const handleLayoutChange = useCallback((key: SectionKey, partial: Partial<SectionLayout>) => {
    setLayout((prev) => ({ ...prev, [key]: { ...prev[key], ...partial } }));
  }, []);

  const handleReset = useCallback(() => {
    setLayout({ ...EMPTY_LAYOUT });
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const handleImport = useCallback((config: LayoutConfig) => { setLayout(config); }, []);

  const updateAgent = useCallback((key: string, val: string) => {
    const parsed = ["age", "metabolic_rate", "clothing_insulation"].includes(key) ? parseFloat(val) || 0 : val;
    onPersonaChange({ ...persona, agent: { ...persona.agent, [key]: parsed } });
  }, [persona, onPersonaChange]);

  const updateAsiScore = useCallback((nextScore: number) => {
    const anxiety = buildAnxietyData(nextScore);
    onPersonaChange({ ...persona, agent: { ...persona.agent, anxiety } });
  }, [persona, onPersonaChange]);

  const updateEnv = useCallback((key: string, val: string) => {
    onPersonaChange({ ...persona, environment: { ...persona.environment, [key]: parseFloat(val) || 0 } });
  }, [persona, onPersonaChange]);

  const updateSpatial = useCallback((key: string, val: string) => {
    onPersonaChange({ ...persona, spatial: { ...persona.spatial, [key]: parseFloat(val) || 0 } });
  }, [persona, onPersonaChange]);

  const mbtiOptions = ["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"].map((m) => ({ value: m, label: m }));
  const accentColor = personaColor?.primary || "var(--primary)";

  const DS = useCallback(({ k, children, className = "", style = {} }: {
    k: SectionKey; children: ReactNode; className?: string; style?: React.CSSProperties;
  }) => (
    <DesignSection sectionKey={k} designMode={designMode} layout={layout}
      onLayoutChange={handleLayoutChange} className={className} style={style}>
      {children}
    </DesignSection>
  ), [designMode, layout, handleLayoutChange]);

  return (
    <div ref={containerRef} className="relative w-full space-y-6">
      <DesignToolbar designMode={designMode} setDesignMode={setDesignMode} layout={layout} onReset={handleReset} onImport={handleImport} />

      <div className="flex items-center gap-6 p-6 rounded-2xl bg-white border border-border shadow-sm">
        <div className="w-24 h-24 rounded-xl bg-muted/30 flex items-center justify-center border border-border overflow-hidden">
          <PixelAvatar persona={persona} color={accentColor} size={80} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">{agent.id}</h2>
            <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/20">{agent.mbti}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
            <span>{agent.age}Y · {agent.gender === "female" ? "Female" : "Male"}</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>{agent.mobility}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Comfort Level</div>
          <div className="flex items-center gap-2 justify-end">
            <span className="text-3xl font-black tabular-nums">{hasSimulated ? experience.comfort_score : "--"}</span>
            <span className="text-sm font-bold text-muted-foreground">/10</span>
          </div>
        </div>
      </div>

      <div className="relative grid grid-cols-12 gap-6" style={{ zIndex: 1 }}>
        <div className="col-span-12 lg:col-span-7 space-y-6">
          <DS k="agent">
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground uppercase tracking-widest">Agent Parameters</span>
                <span className="text-primary opacity-40">◆</span>
              </div>
              <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-1">
                <DataRow label="ID"><EditableField value={agent.id} onChange={(v) => updateAgent("id", v)} type="text" /></DataRow>
                <DataRow label="Age"><EditableField value={agent.age} onChange={(v) => updateAgent("age", v)} type="number" /></DataRow>
                <DataRow label="Gender"><EditableField value={agent.gender} onChange={(v) => updateAgent("gender", v)} type="select" options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }]} /></DataRow>
                <DataRow label="MBTI"><EditableField value={agent.mbti} onChange={(v) => updateAgent("mbti", v)} type="select" options={mbtiOptions} /></DataRow>
                <DataRow label="Mobility"><EditableField value={agent.mobility} onChange={(v) => updateAgent("mobility", v)} type="select" options={[{ value: "normal", label: "Normal" }, { value: "walker", label: "Walker" }, { value: "wheelchair", label: "Wheelchair" }, { value: "cane", label: "Cane" }]} /></DataRow>
                <DataRow label="Metabolic"><EditableField value={agent.metabolic_rate} onChange={(v) => updateAgent("metabolic_rate", v)} type="number" suffix="met" /></DataRow>
                <DataRow label="Clothing"><EditableField value={agent.clothing_insulation} onChange={(v) => updateAgent("clothing_insulation", v)} type="number" suffix="clo" /></DataRow>
              </div>
            </div>
          </DS>

          <DS k="anxiety">
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground uppercase tracking-widest">Psychological Load</span>
                <span className="text-destructive opacity-40">▤</span>
              </div>
              <div className="p-5">
                {(() => {
                  const anx = agent.anxiety ?? defaultAnxiety;
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                        <SliderField label="ASI-3 Score" value={anx.asi_score} min={0} max={72} step={1} suffix="/72" onChange={(v) => updateAsiScore(v)} color="var(--destructive)" />
                        <div className="flex items-center justify-between mt-4 p-3 rounded-xl bg-muted/20 border border-border/50">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Clinical Level</span>
                          <AsiLevelBadge level={anx.asi_level} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <ModifierRow label="Noise Sensitivity" value={anx.modifiers.noise_sensitivity} />
                        <ModifierRow label="Thermal Range" value={anx.modifiers.thermal_comfort_range} />
                        <ModifierRow label="Exit Proximity" value={anx.modifiers.exit_proximity_need} />
                        <ModifierRow label="Social Threshold" value={anx.modifiers.social_threshold} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </DS>

          <DS k="environment">
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground uppercase tracking-widest">Environment Parameters</span>
                <span className="text-primary opacity-40">◉</span>
              </div>
              <div className="p-5 space-y-1">
                <EnvAdjustableBar label="Lux" value={environment.lux} min={0} max={2000} color="#D4A017" onChange={(v) => updateEnv("lux", String(v))} />
                <EnvAdjustableBar label="Noise" value={environment.dB} min={0} max={120} suffix="dB" color="#C44040" onChange={(v) => updateEnv("dB", String(v))} />
                <EnvAdjustableBar label="Temp" value={environment.air_temp} min={10} max={35} suffix="°C" color="#1D6B5E" onChange={(v) => updateEnv("air_temp", String(v))} />
                <EnvAdjustableBar label="RH" value={environment.humidity} min={0} max={100} suffix="%" color="#4A90B8" onChange={(v) => updateEnv("humidity", String(v))} />
                <EnvAdjustableBar label="Air V." value={environment.air_velocity} min={0} max={2} suffix="m/s" color="#2E8B6A" onChange={(v) => updateEnv("air_velocity", String(v))} />
              </div>
            </div>
          </DS>
        </div>

        <div className="col-span-12 lg:col-span-5 space-y-6">
          <DS k="experience">
            <div className="bg-primary/5 rounded-2xl border border-primary/20 shadow-sm overflow-hidden h-full">
              <div className="px-5 py-3 bg-primary/10 border-b border-primary/20 flex items-center justify-between">
                <span className="text-[11px] font-bold text-primary uppercase tracking-widest">Subjective Narrative</span>
                <span className="text-primary opacity-40">◌</span>
              </div>
              <div className="p-6">
                <blockquote className="text-sm font-medium leading-relaxed text-foreground italic mb-6">"{experience.summary}"</blockquote>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-4 rounded-2xl bg-white border border-border">
                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Comfort</div>
                    <div className="text-2xl font-black">{experience.comfort_score}<span className="text-xs font-bold text-muted-foreground ml-1">/10</span></div>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-border">
                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Trend</div>
                    <div className="text-xs font-bold uppercase tracking-wider">{experience.trend}</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <LoadBar label="Thermal" value={accumulatedState.thermal_discomfort} />
                  <LoadBar label="Visual" value={accumulatedState.visual_strain} />
                  <LoadBar label="Noise" value={accumulatedState.noise_stress} />
                  <LoadBar label="Social" value={accumulatedState.social_overload} />
                  <LoadBar label="Fatigue" value={accumulatedState.fatigue} />
                  <LoadBar label="Wayfind" value={accumulatedState.wayfinding_anxiety} />
                </div>
              </div>
            </div>
          </DS>

          <DS k="spatial">
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground uppercase tracking-widest">Spatial Metrics</span>
                <span className="text-primary opacity-40">□</span>
              </div>
              <div className="p-5 space-y-1">
                <StaticRow label="Wall Dist." value={spatial.dist_to_wall} unit="m" />
                <StaticRow label="Win. Dist." value={spatial.dist_to_window} unit="m" />
                <StaticRow label="Exit Dist." value={spatial.dist_to_exit} unit="m" />
                <DataRow label="Ceiling H."><EditableField value={spatial.ceiling_h} onChange={(v) => updateSpatial("ceiling_h", v)} suffix="m" /></DataRow>
              </div>
            </div>
          </DS>

          <DS k="outputs">
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground uppercase tracking-widest">Computed Outputs</span>
                <span className="text-primary opacity-40">⊕</span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">PMV</div>
                    <div className="text-xl font-bold">{computedOutputs.PMV}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">PPD</div>
                    <div className="text-xl font-bold">{computedOutputs.PPD}%</div>
                  </div>
                </div>
                <PMVWarnings computedOutputs={computedOutputs} />
                <FormulaModal />
              </div>
            </div>
          </DS>
        </div>
      </div>
    </div>
  );
}
