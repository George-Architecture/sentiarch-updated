// ============================================================
// CoordinateInput Component - Rhino/GH coordinate data entry + Zone Editor
// Design: Neumorphism-lite warm beige
// ============================================================

import { useState } from "react";
import type { Shape, Zone, ZoneEnv } from "@/lib/store";
import { defaultZoneEnv } from "@/lib/store";
import { toast } from "sonner";

const BOUNDARY_EXAMPLE = `0. {5000, 0}
1. {5000, 5000}
2. {0, 5000}
3. {0, 0}`;

const WINDOW_EXAMPLE = `0. {5000, 1000}
1. {5000, 4000}`;

function parseCoordinates(text: string): [number, number][] {
  const points: [number, number][] = [];
  const lines = text.trim().split("\n");
  for (const line of lines) {
    const match = line.match(/\{?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\}?/);
    if (match) {
      points.push([parseFloat(match[1]), parseFloat(match[2])]);
    }
  }
  return points;
}

// ---- Zone Editor Sub-Component ----
function ZoneEditor({
  zones,
  onAddZone,
  onUpdateZone,
  onRemoveZone,
}: {
  zones: Zone[];
  onAddZone: (zone: Zone) => void;
  onUpdateZone: (id: string, updates: Partial<Zone>) => void;
  onRemoveZone: (id: string) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newBounds, setNewBounds] = useState({ x: "0", y: "0", width: "5000", height: "5000" });
  const [newEnv, setNewEnv] = useState<ZoneEnv>({ ...defaultZoneEnv });
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");

  const handleAddZone = () => {
    const bounds = {
      x: parseFloat(newBounds.x) || 0,
      y: parseFloat(newBounds.y) || 0,
      width: parseFloat(newBounds.width) || 5000,
      height: parseFloat(newBounds.height) || 5000,
    };
    if (bounds.width <= 0 || bounds.height <= 0) {
      toast.error("Zone width and height must be positive");
      return;
    }
    const zone: Zone = {
      id: `zone_${Date.now()}`,
      label: newLabel || `Zone ${zones.length + 1}`,
      bounds,
      env: { ...newEnv },
    };
    onAddZone(zone);
    setNewLabel("");
    toast.success(`Zone "${zone.label}" added`);
  };

  const envFields: { key: keyof ZoneEnv; label: string; unit: string; min: number; max: number; step: number }[] = [
    { key: "temperature", label: "Temp", unit: "°C", min: 10, max: 40, step: 0.5 },
    { key: "humidity", label: "RH", unit: "%", min: 0, max: 100, step: 1 },
    { key: "light", label: "Lux", unit: "lx", min: 0, max: 2000, step: 10 },
    { key: "noise", label: "Noise", unit: "dB", min: 0, max: 120, step: 1 },
    { key: "air_velocity", label: "Air V.", unit: "m/s", min: 0, max: 2, step: 0.01 },
  ];

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold tracking-wider" style={{ color: "var(--muted-foreground)" }}>
        ZONE ENVIRONMENT EDITOR
      </div>

      {/* Existing Zones */}
      {zones.length > 0 && (
        <div className="space-y-2">
          {zones.map((z) => (
            <div key={z.id} className="sa-card p-3" style={{ background: "var(--background)" }}>
              <div className="flex items-center justify-between mb-2">
                {editingLabelId === z.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editingLabelValue}
                    onChange={(e) => setEditingLabelValue(e.target.value)}
                    onBlur={() => {
                      const trimmed = editingLabelValue.trim();
                      if (trimmed) onUpdateZone(z.id, { label: trimmed });
                      setEditingLabelId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const trimmed = editingLabelValue.trim();
                        if (trimmed) onUpdateZone(z.id, { label: trimmed });
                        setEditingLabelId(null);
                      } else if (e.key === "Escape") {
                        setEditingLabelId(null);
                      }
                    }}
                    className="text-sm font-semibold px-1 py-0.5 rounded"
                    style={{
                      color: "var(--foreground)",
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      fontFamily: "inherit",
                      minWidth: "80px",
                      maxWidth: "160px",
                    }}
                  />
                ) : (
                  <span
                    className="text-sm font-semibold cursor-pointer hover:underline"
                    style={{ color: "var(--foreground)" }}
                    title="Click to rename"
                    onClick={() => {
                      setEditingLabelId(z.id);
                      setEditingLabelValue(z.label || z.id);
                    }}
                  >
                    {z.label || z.id} ✎
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
                    ({z.bounds.x}, {z.bounds.y}) {z.bounds.width}×{z.bounds.height}mm
                  </span>
                  <button
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: "#D94F4F20", color: "#D94F4F", border: "1px solid #D94F4F40" }}
                    onClick={() => onRemoveZone(z.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {envFields.map((f) => (
                  <div key={f.key} className="text-center">
                    <div className="text-[10px] mb-1" style={{ color: "var(--muted-foreground)" }}>{f.label}</div>
                    <input
                      type="number"
                      value={z.env[f.key]}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          onUpdateZone(z.id, { env: { ...z.env, [f.key]: val } });
                        }
                      }}
                      className="w-full text-center text-xs p-1 rounded"
                      style={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        color: "var(--foreground)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                    />
                    <div className="text-[9px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{f.unit}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add New Zone */}
      <div className="p-3 rounded-lg" style={{ background: "var(--background)", border: "1px dashed var(--border)" }}>
        <div className="text-xs font-semibold mb-3" style={{ color: "var(--muted-foreground)" }}>
          ADD NEW ZONE
        </div>

        <div className="grid grid-cols-5 gap-2 mb-3">
          <div className="col-span-1">
            <label className="text-[10px] block mb-1" style={{ color: "var(--muted-foreground)" }}>Label</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Zone A"
              className="w-full text-xs p-1.5 rounded"
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
            />
          </div>
          {(["x", "y", "width", "height"] as const).map((k) => (
            <div key={k}>
              <label className="text-[10px] block mb-1" style={{ color: "var(--muted-foreground)" }}>
                {k === "x" ? "X (mm)" : k === "y" ? "Y (mm)" : k === "width" ? "W (mm)" : "H (mm)"}
              </label>
              <input
                type="number"
                value={newBounds[k]}
                onChange={(e) => setNewBounds({ ...newBounds, [k]: e.target.value })}
                className="w-full text-xs p-1.5 rounded"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-2 mb-3">
          {envFields.map((f) => (
            <div key={f.key}>
              <label className="text-[10px] block mb-1" style={{ color: "var(--muted-foreground)" }}>
                {f.label} ({f.unit})
              </label>
              <input
                type="number"
                value={newEnv[f.key]}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setNewEnv({ ...newEnv, [f.key]: val });
                }}
                className="w-full text-xs p-1.5 rounded"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                min={f.min}
                max={f.max}
                step={f.step}
              />
            </div>
          ))}
        </div>

        <button className="sa-btn sa-btn-primary w-full text-xs py-2" onClick={handleAddZone}>
          + Add Zone
        </button>
      </div>
    </div>
  );
}

// ---- Main Component ----
export default function CoordinateInput({
  onAddShape,
  onClearAll,
  zones = [],
  onAddZone,
  onUpdateZone,
  onRemoveZone,
}: {
  onAddShape: (shape: Shape) => void;
  onClearAll: () => void;
  zones?: Zone[];
  onAddZone?: (zone: Zone) => void;
  onUpdateZone?: (id: string, updates: Partial<Zone>) => void;
  onRemoveZone?: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [shapeType, setShapeType] = useState<"boundary" | "window" | "door">("boundary");
  const [label, setLabel] = useState("");
  const [activeSection, setActiveSection] = useState<"shapes" | "zones">("shapes");

  const handleAdd = () => {
    const points = parseCoordinates(text);
    if (points.length < 2) {
      toast.error("Need at least 2 points");
      return;
    }
    onAddShape({ type: shapeType, points, label: label || undefined });
    setText("");
    setLabel("");
    toast.success("Shape added to map");
  };

  return (
    <div className="space-y-4">
      {/* Section Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          className="sa-btn text-xs"
          style={{
            background: activeSection === "shapes" ? "var(--primary)" : "var(--card)",
            color: activeSection === "shapes" ? "#fff" : "var(--foreground)",
          }}
          onClick={() => setActiveSection("shapes")}
        >
          Shapes / Coordinates
        </button>
        <button
          className="sa-btn text-xs"
          style={{
            background: activeSection === "zones" ? "var(--primary)" : "var(--card)",
            color: activeSection === "zones" ? "#fff" : "var(--foreground)",
          }}
          onClick={() => setActiveSection("zones")}
        >
          Zone Environment
        </button>
      </div>

      {/* Shapes Section */}
      {activeSection === "shapes" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider" style={{ color: "var(--muted-foreground)" }}>
              RHINO/GH COORDINATE DATA
            </span>
            <div className="flex gap-2">
              <button className="sa-btn text-xs" onClick={() => setText(BOUNDARY_EXAMPLE)}>
                BOUNDARY EXAMPLE
              </button>
              <button className="sa-btn text-xs" onClick={() => setText(WINDOW_EXAMPLE)}>
                WINDOW EXAMPLE
              </button>
            </div>
          </div>

          <div className="text-[10px] mb-1" style={{ color: "var(--muted-foreground)", letterSpacing: "0.5px" }}>
            FORMAT: INDEX. {"{X, Y}"} — ONE POINT PER LINE — LAST POINT CONNECTS BACK TO FIRST (BOUNDARY)
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Paste Rhino/GH coordinates...\n0. {5000, 0}\n1. {5000, 5000}\n2. {0, 5000}\n3. {0, 0}\n\nPoints connect in order. Boundaries close automatically.`}
            className="w-full h-32 text-sm p-3 resize-none rounded-lg"
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              fontFamily: "'JetBrains Mono', monospace",
              boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.04)",
            }}
          />

          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>SHAPE TYPE</span>
            {((["boundary", "window", "door"] as const)).map((t) => (
              <button
                key={t}
                className="sa-btn text-xs"
                style={{
                  background: shapeType === t ? "var(--primary)" : "var(--card)",
                  color: shapeType === t ? "#fff" : "var(--foreground)",
                }}
                onClick={() => setShapeType(t)}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>LABEL (OPTIONAL)</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Room A"
              className="text-sm px-3 py-1.5 flex-1 rounded-lg"
              style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <div className="flex gap-3">
            <button className="sa-btn sa-btn-primary flex-1 text-xs" onClick={handleAdd}>
              + ADD SHAPE
            </button>
            <button
              className="sa-btn text-xs"
              style={{ background: "#D94F4F20", color: "#D94F4F", borderColor: "#D94F4F40" }}
              onClick={onClearAll}
            >
              CLEAR ALL
            </button>
          </div>
        </div>
      )}

      {/* Zones Section */}
      {activeSection === "zones" && onAddZone && onUpdateZone && onRemoveZone && (
        <ZoneEditor
          zones={zones}
          onAddZone={onAddZone}
          onUpdateZone={onUpdateZone}
          onRemoveZone={onRemoveZone}
        />
      )}
    </div>
  );
}
