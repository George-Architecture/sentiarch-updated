// ============================================================
// ProgramSpecEditor — Tab C: Constraints Form
//
// Simple form for BuildingConstraint fields with real-time
// validation (e.g. maxFloors × floorHeight ≤ maxBuildingHeightM).
// ============================================================

import { useMemo } from "react";
import { useEditor } from "./EditorContext";

// ---- Field Component -------------------------------------------------

function Field({
  label,
  unit,
  value,
  onChange,
  min,
  step,
  error,
  hint,
}: {
  label: string;
  unit?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  step?: number;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label
        className="text-xs font-semibold block"
        style={{ color: "var(--muted-foreground)" }}
      >
        {label}
        {unit && (
          <span className="font-normal ml-1 opacity-60">({unit})</span>
        )}
      </label>
      <input
        type="number"
        value={value ?? ""}
        onChange={e => {
          const v = e.target.value;
          onChange(v !== "" ? parseFloat(v) : undefined);
        }}
        min={min}
        step={step ?? 1}
        className="sa-input w-full"
        style={{
          borderColor: error ? "var(--destructive)" : undefined,
        }}
      />
      {hint && !error && (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {hint}
        </p>
      )}
      {error && (
        <p className="text-xs font-medium" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ---- Main Component --------------------------------------------------

export default function ConstraintsForm() {
  const { state, dispatch } = useEditor();
  const c = state.spec.constraints;

  // Real-time validation
  const heightError = useMemo(() => {
    const totalHeight = c.maxFloors * c.floorHeight;
    if (totalHeight > c.maxBuildingHeightM) {
      return `${c.maxFloors} floors × ${c.floorHeight}m = ${totalHeight.toFixed(1)}m exceeds limit of ${c.maxBuildingHeightM}m`;
    }
    return undefined;
  }, [c.maxFloors, c.floorHeight, c.maxBuildingHeightM]);

  const handleChange = (field: string, value: number | undefined) => {
    if (value === undefined) return;
    dispatch({
      type: "UPDATE_CONSTRAINTS",
      payload: { [field]: value },
    });
  };

  const totalHeight = c.maxFloors * c.floorHeight;
  const heightRatio = c.maxBuildingHeightM > 0
    ? (totalHeight / c.maxBuildingHeightM) * 100
    : 0;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Building Envelope */}
      <div className="sa-card space-y-4">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          Building Envelope
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Max Floors"
            value={c.maxFloors}
            onChange={v => handleChange("maxFloors", v)}
            min={1}
            hint="Number of above-ground floors (G/F = floor 0)"
          />
          <Field
            label="Floor Height"
            unit="m"
            value={c.floorHeight}
            onChange={v => handleChange("floorHeight", v)}
            min={2}
            step={0.1}
            hint="Floor-to-floor height"
          />
          <Field
            label="Max Building Height"
            unit="m"
            value={c.maxBuildingHeightM}
            onChange={v => handleChange("maxBuildingHeightM", v)}
            min={1}
            step={0.5}
            error={heightError}
            hint="Absolute height limit (e.g. HK Buildings Ordinance)"
          />
          <Field
            label="Min Corridor Width"
            unit="m"
            value={c.minCorridorWidthM}
            onChange={v => handleChange("minCorridorWidthM", v)}
            min={0.9}
            step={0.1}
            hint="Minimum accessible corridor width"
          />
        </div>

        {/* Height Gauge */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs" style={{ color: "var(--muted-foreground)" }}>
            <span>Building Height Usage</span>
            <span className="font-mono font-semibold" style={{ color: heightError ? "var(--destructive)" : "var(--primary)" }}>
              {totalHeight.toFixed(1)}m / {c.maxBuildingHeightM}m ({heightRatio.toFixed(0)}%)
            </span>
          </div>
          <div className="sa-slider-track">
            <div
              className="sa-slider-fill"
              style={{
                width: `${Math.min(100, heightRatio)}%`,
                background: heightError ? "var(--destructive)" : "var(--primary)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Site */}
      <div className="sa-card space-y-4">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          Site Parameters
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Site Area"
            unit="m²"
            value={c.siteAreaM2}
            onChange={v => handleChange("siteAreaM2", v)}
            min={100}
            step={100}
          />
          <Field
            label="Target Total Area"
            unit="m²"
            value={c.targetTotalAreaM2}
            onChange={v => handleChange("targetTotalAreaM2", v)}
            min={0}
            step={100}
            hint="Optional target gross floor area"
          />
        </div>

        {/* GFA Feasibility */}
        {c.targetTotalAreaM2 && (
          <div className="sa-card-inset space-y-2">
            <div className="sa-data-row">
              <span className="sa-data-row-label">Max GFA (site × floors)</span>
              <span className="sa-data-row-value">
                {(c.siteAreaM2 * c.maxFloors).toLocaleString()} m²
              </span>
            </div>
            <div className="sa-data-row">
              <span className="sa-data-row-label">Target GFA</span>
              <span className="sa-data-row-value">
                {c.targetTotalAreaM2.toLocaleString()} m²
              </span>
            </div>
            <div className="sa-data-row">
              <span className="sa-data-row-label">Floor Plate Efficiency Needed</span>
              <span
                className="sa-data-row-value"
                style={{
                  color:
                    c.targetTotalAreaM2 / (c.siteAreaM2 * c.maxFloors) > 0.85
                      ? "var(--destructive)"
                      : "var(--primary)",
                }}
              >
                {(
                  (c.targetTotalAreaM2 / (c.siteAreaM2 * c.maxFloors)) *
                  100
                ).toFixed(1)}
                %
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
