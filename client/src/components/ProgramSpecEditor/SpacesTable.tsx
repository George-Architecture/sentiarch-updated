// ============================================================
// ProgramSpecEditor — Tab A: Spaces Table
//
// Spreadsheet-like table for viewing and editing space types.
// Columns: Name, Category, Qty, Area/unit, Min, Max,
//          Total (computed), Occupancy, Features, Floor Pref,
//          Floor Mandatory, Cluster, Actions
// ============================================================

import { useState, useMemo, useCallback, useRef } from "react";
import { useEditor } from "./EditorContext";
import {
  type SpaceType,
  type SpaceCategory,
  type FloorPreference,
  type SpaceFeature,
  SpaceCategoryValues,
  FloorPreferenceValues,
  SpaceFeatureValues,
  PROGRAM_SPEC_SCHEMA_VERSION,
} from "@/types/program";

// ---- Category Colours ------------------------------------------------

const CATEGORY_COLORS: Record<SpaceCategory, string> = {
  academic: "#4A90D9",
  art: "#D4A843",
  science: "#50B87A",
  public: "#9B6FCF",
  sport: "#E8734A",
  support: "#8B8B8B",
  residential: "#D96BA0",
  admin: "#5BBCBF",
};

// ---- Default New Space -----------------------------------------------

function makeNewSpace(existingIds: Set<string>): SpaceType {
  let idx = 1;
  let id = `new-space-${idx}`;
  while (existingIds.has(id)) {
    idx++;
    id = `new-space-${idx}`;
  }
  return {
    id,
    name: "New Space",
    category: "academic",
    quantity: 1,
    areaPerUnit: 65,
    minArea: 55,
    maxArea: 75,
    occupancy: 30,
    requiredFeatures: [],
    floorPreference: "any",
    isOutdoor: false,
  };
}

// ---- Inline Edit Cell ------------------------------------------------

function EditCell({
  value,
  onChange,
  type = "text",
  min,
  max,
  step,
  className = "",
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number";
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      min={min}
      max={max}
      step={step}
      className={`sa-input w-full ${className}`}
      style={{ fontSize: 12, padding: "4px 6px" }}
    />
  );
}

// ---- Select Cell -----------------------------------------------------

function SelectCell<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      className="sa-input w-full"
      style={{ fontSize: 12, padding: "4px 6px" }}
    >
      {options.map(opt => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

// ---- Features Multi-Select -------------------------------------------

function FeaturesCell({
  value,
  onChange,
}: {
  value: SpaceFeature[];
  onChange: (v: SpaceFeature[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className="relative">
      <button
        className="sa-input w-full text-left truncate"
        style={{ fontSize: 11, padding: "4px 6px" }}
        onClick={() => setOpen(!open)}
      >
        {value.length === 0
          ? "—"
          : value.map(f => f.replace(/_/g, " ")).join(", ")}
      </button>
      {open && (
        <div
          className="absolute z-50 top-full left-0 mt-1 sa-panel max-h-48 overflow-y-auto"
          style={{ minWidth: 180 }}
        >
          {SpaceFeatureValues.map(feat => (
            <label
              key={feat}
              className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-[var(--muted)] rounded cursor-pointer"
            >
              <input
                type="checkbox"
                checked={value.includes(feat)}
                onChange={e => {
                  if (e.target.checked) {
                    onChange([...value, feat]);
                  } else {
                    onChange(value.filter(f => f !== feat));
                  }
                }}
              />
              {feat.replace(/_/g, " ")}
            </label>
          ))}
          <button
            className="sa-btn w-full mt-1"
            style={{ fontSize: 11, padding: "3px 8px" }}
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Main Component --------------------------------------------------

export default function SpacesTable() {
  const { state, dispatch } = useEditor();
  const { spaces, constraints } = state.spec;

  const existingIds = useMemo(
    () => new Set(spaces.map(s => s.id)),
    [spaces]
  );

  const totalArea = useMemo(
    () => spaces.reduce((sum, s) => sum + s.quantity * s.areaPerUnit, 0),
    [spaces]
  );

  const targetArea = constraints.targetTotalAreaM2;

  const handleAdd = useCallback(() => {
    dispatch({ type: "ADD_SPACE", payload: makeNewSpace(existingIds) });
  }, [dispatch, existingIds]);

  const handleUpdate = useCallback(
    (index: number, partial: Partial<SpaceType>) => {
      const current = spaces[index];
      dispatch({
        type: "UPDATE_SPACE",
        payload: { index, space: { ...current, ...partial } },
      });
    },
    [dispatch, spaces]
  );

  const handleDelete = useCallback(
    (index: number) => {
      if (confirm(`Delete "${spaces[index].name}"?`)) {
        dispatch({ type: "DELETE_SPACE", payload: index });
      }
    },
    [dispatch, spaces]
  );

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="sa-tag">
          <span style={{ color: "var(--muted-foreground)" }}>Spaces:</span>
          <span className="font-semibold">{spaces.length}</span>
        </span>
        <span className="sa-tag">
          <span style={{ color: "var(--muted-foreground)" }}>Total Area:</span>
          <span className="font-semibold">{totalArea.toLocaleString()} m²</span>
        </span>
        {targetArea && (
          <span
            className="sa-tag"
            style={{
              borderColor:
                totalArea > targetArea * 1.1
                  ? "var(--destructive)"
                  : totalArea < targetArea * 0.9
                    ? "#D4A843"
                    : "var(--primary)",
            }}
          >
            <span style={{ color: "var(--muted-foreground)" }}>
              vs Target:
            </span>
            <span className="font-semibold">
              {targetArea.toLocaleString()} m² (
              {((totalArea / targetArea) * 100).toFixed(0)}%)
            </span>
          </span>
        )}
        <button className="sa-btn sa-btn-primary ml-auto" onClick={handleAdd}>
          + Add Space
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto sa-card" style={{ padding: 0 }}>
        <table className="w-full text-xs" style={{ minWidth: 1100 }}>
          <thead>
            <tr
              style={{
                background: "var(--muted)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {[
                "ID",
                "Name",
                "Category",
                "Qty",
                "Area/unit",
                "Min",
                "Max",
                "Total",
                "Occ.",
                "Features",
                "Floor Pref",
                "Floor #",
                "Cluster",
                "In/Out",
                "",
              ].map(h => (
                <th
                  key={h}
                  className="px-2 py-2 text-left font-semibold whitespace-nowrap"
                  style={{ color: "var(--muted-foreground)", fontSize: 11 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spaces.map((space, idx) => (
              <tr
                key={space.id}
                className="hover:bg-[var(--muted)] transition-colors"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                {/* ID */}
                <td className="px-2 py-1">
                  <EditCell
                    value={space.id}
                    onChange={v => handleUpdate(idx, { id: v })}
                    className="font-mono"
                  />
                </td>
                {/* Name */}
                <td className="px-2 py-1">
                  <EditCell
                    value={space.name}
                    onChange={v => handleUpdate(idx, { name: v })}
                  />
                </td>
                {/* Category */}
                <td className="px-2 py-1">
                  <div className="flex items-center gap-1">
                    <span
                      className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                      style={{
                        background: CATEGORY_COLORS[space.category],
                      }}
                    />
                    <SelectCell
                      value={space.category}
                      options={SpaceCategoryValues}
                      onChange={v => handleUpdate(idx, { category: v })}
                    />
                  </div>
                </td>
                {/* Qty */}
                <td className="px-2 py-1" style={{ width: 60 }}>
                  <EditCell
                    value={space.quantity}
                    type="number"
                    min={1}
                    onChange={v =>
                      handleUpdate(idx, {
                        quantity: Math.max(1, parseInt(v) || 1),
                      })
                    }
                  />
                </td>
                {/* Area/unit */}
                <td className="px-2 py-1" style={{ width: 70 }}>
                  <EditCell
                    value={space.areaPerUnit}
                    type="number"
                    min={1}
                    onChange={v =>
                      handleUpdate(idx, {
                        areaPerUnit: Math.max(1, parseFloat(v) || 1),
                      })
                    }
                  />
                </td>
                {/* Min */}
                <td className="px-2 py-1" style={{ width: 60 }}>
                  <EditCell
                    value={space.minArea ?? ""}
                    type="number"
                    min={1}
                    onChange={v =>
                      handleUpdate(idx, {
                        minArea: v ? parseFloat(v) : undefined,
                      })
                    }
                  />
                </td>
                {/* Max */}
                <td className="px-2 py-1" style={{ width: 60 }}>
                  <EditCell
                    value={space.maxArea ?? ""}
                    type="number"
                    min={1}
                    onChange={v =>
                      handleUpdate(idx, {
                        maxArea: v ? parseFloat(v) : undefined,
                      })
                    }
                  />
                </td>
                {/* Total (computed) */}
                <td
                  className="px-2 py-1 font-mono font-semibold text-right"
                  style={{ color: "var(--primary)" }}
                >
                  {(space.quantity * space.areaPerUnit).toLocaleString()}
                </td>
                {/* Occupancy */}
                <td className="px-2 py-1" style={{ width: 60 }}>
                  <EditCell
                    value={space.occupancy}
                    type="number"
                    min={0}
                    onChange={v =>
                      handleUpdate(idx, {
                        occupancy: Math.max(0, parseInt(v) || 0),
                      })
                    }
                  />
                </td>
                {/* Features */}
                <td className="px-2 py-1" style={{ minWidth: 120 }}>
                  <FeaturesCell
                    value={space.requiredFeatures}
                    onChange={v =>
                      handleUpdate(idx, { requiredFeatures: v })
                    }
                  />
                </td>
                {/* Floor Pref */}
                <td className="px-2 py-1" style={{ width: 90 }}>
                  <SelectCell
                    value={space.floorPreference}
                    options={FloorPreferenceValues}
                    onChange={v =>
                      handleUpdate(idx, { floorPreference: v })
                    }
                  />
                </td>
                {/* Floor Mandatory */}
                <td className="px-2 py-1" style={{ width: 60 }}>
                  <EditCell
                    value={space.floorMandatory ?? ""}
                    type="number"
                    min={0}
                    onChange={v =>
                      handleUpdate(idx, {
                        floorMandatory:
                          v !== "" ? parseInt(v) : undefined,
                      })
                    }
                  />
                </td>
                {/* Cluster */}
                <td className="px-2 py-1" style={{ width: 80 }}>
                  <EditCell
                    value={space.clusterGroup ?? ""}
                    onChange={v =>
                      handleUpdate(idx, {
                        clusterGroup: v || undefined,
                      })
                    }
                  />
                </td>
                {/* Indoor/Outdoor Toggle */}
                <td className="px-2 py-1" style={{ width: 70 }}>
                  <button
                    className="sa-btn w-full"
                    style={{
                      fontSize: 11,
                      padding: "3px 6px",
                      background: (space.isOutdoor ?? false)
                        ? "#e8f5e9"
                        : "var(--muted)",
                      color: (space.isOutdoor ?? false)
                        ? "#2e7d32"
                        : "var(--muted-foreground)",
                      border: `1px solid ${(space.isOutdoor ?? false) ? "#a5d6a7" : "var(--border)"}`,
                    }}
                    onClick={() =>
                      handleUpdate(idx, {
                        isOutdoor: !(space.isOutdoor ?? false),
                      })
                    }
                    title={(space.isOutdoor ?? false) ? "Outdoor space" : "Indoor space"}
                  >
                    {(space.isOutdoor ?? false) ? "Outdoor" : "Indoor"}
                  </button>
                </td>
                {/* Actions */}
                <td className="px-2 py-1">
                  <button
                    className="sa-btn sa-btn-danger"
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => handleDelete(idx)}
                    title="Delete space"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {spaces.length === 0 && (
              <tr>
                <td
                  colSpan={15}
                  className="text-center py-8"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  No spaces defined. Click "Add Space" or load a template.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
