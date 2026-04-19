// ============================================================
// MassingViewer — ControlPanel
//
// Floor visibility toggles, section cut slider, wireframe
// toggle, color mode selector, and building info panel.
// ============================================================

import { useCallback } from "react";
import type { BuildingMassing, RoomVolume } from "@/types/massing";
import type { SceneConfig, ColorMode } from "./BuildingScene";

// ---- Props --------------------------------------------------------------

interface ControlPanelProps {
  building: BuildingMassing;
  config: SceneConfig;
  onConfigChange: (update: Partial<SceneConfig>) => void;
  selectedRoom: RoomVolume | null;
  computeTimeMs: number;
}

// ---- Component ----------------------------------------------------------

export default function ControlPanel({
  building,
  config,
  onConfigChange,
  selectedRoom,
  computeTimeMs,
}: ControlPanelProps) {
  // ---- Floor Toggles ----------------------------------------------------

  const toggleFloor = useCallback(
    (floorIndex: number) => {
      const next = new Set(config.visibleFloors);
      if (next.has(floorIndex)) {
        next.delete(floorIndex);
      } else {
        next.add(floorIndex);
      }
      onConfigChange({ visibleFloors: next });
    },
    [config.visibleFloors, onConfigChange],
  );

  const showAll = useCallback(() => {
    const all = new Set(building.floors.map((f) => f.floorIndex));
    onConfigChange({ visibleFloors: all });
  }, [building, onConfigChange]);

  const hideAll = useCallback(() => {
    onConfigChange({ visibleFloors: new Set() });
  }, [onConfigChange]);

  // ---- Section Cut ------------------------------------------------------

  const handleSectionCut = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      onConfigChange({
        sectionCutY: val >= building.totalHeightM ? null : val,
      });
    },
    [building.totalHeightM, onConfigChange],
  );

  // ---- Color Mode -------------------------------------------------------

  const handleColorMode = useCallback(
    (mode: ColorMode) => {
      onConfigChange({ colorMode: mode });
    },
    [onConfigChange],
  );

  // ---- Styles -----------------------------------------------------------

  const sectionStyle: React.CSSProperties = {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid var(--sa-border, #e5e5e5)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "var(--sa-text-muted, #888)",
    marginBottom: 6,
    display: "block",
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 10px",
    fontSize: 12,
    border: "1px solid var(--sa-border, #ddd)",
    borderRadius: 4,
    background: active ? "var(--sa-accent, #2D6A4F)" : "transparent",
    color: active ? "#fff" : "var(--sa-text, #333)",
    cursor: "pointer",
    transition: "all 0.15s",
  });

  const smallBtnStyle: React.CSSProperties = {
    padding: "2px 8px",
    fontSize: 10,
    border: "1px solid var(--sa-border, #ddd)",
    borderRadius: 3,
    background: "transparent",
    cursor: "pointer",
    color: "var(--sa-text-muted, #888)",
  };

  return (
    <div
      style={{
        width: 260,
        padding: 16,
        overflowY: "auto",
        borderLeft: "1px solid var(--sa-border, #e5e5e5)",
        background: "var(--sa-bg, #fff)",
        fontSize: 13,
      }}
    >
      {/* ---- Building Info ---- */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Building Info</span>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "2px 0", color: "#888" }}>Floors</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>
                {building.floorCount}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "2px 0", color: "#888" }}>Height</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>
                {building.totalHeightM.toFixed(1)} m
              </td>
            </tr>
            <tr>
              <td style={{ padding: "2px 0", color: "#888" }}>Total GFA</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>
                {building.totalGfaM2.toFixed(0)} m²
              </td>
            </tr>
            <tr>
              <td style={{ padding: "2px 0", color: "#888" }}>Volume</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>
                {building.totalVolumeM3.toFixed(0)} m³
              </td>
            </tr>
            <tr>
              <td style={{ padding: "2px 0", color: "#888" }}>Total Rooms</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>
                {building.totalRoomCount}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "2px 0", color: "#888" }}>Compute</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>
                {computeTimeMs.toFixed(1)} ms
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ---- Floor Visibility ---- */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Floor Visibility</span>
        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          <button style={smallBtnStyle} onClick={showAll}>
            Show All
          </button>
          <button style={smallBtnStyle} onClick={hideAll}>
            Hide All
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {building.floors.map((floor) => (
            <button
              key={floor.floorIndex}
              style={btnStyle(config.visibleFloors.has(floor.floorIndex))}
              onClick={() => toggleFloor(floor.floorIndex)}
            >
              {floor.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Per-Floor Breakdown ---- */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Per-Floor Area</span>
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #eee" }}>
              <th style={{ textAlign: "left", padding: "2px 0", fontWeight: 600 }}>
                Floor
              </th>
              <th style={{ textAlign: "right", padding: "2px 0", fontWeight: 600 }}>
                Rooms
              </th>
              <th style={{ textAlign: "right", padding: "2px 0", fontWeight: 600 }}>
                Area
              </th>
            </tr>
          </thead>
          <tbody>
            {building.floors.map((floor) => (
              <tr key={floor.floorIndex}>
                <td style={{ padding: "2px 0" }}>{floor.label}</td>
                <td style={{ textAlign: "right" }}>{floor.roomCount}</td>
                <td style={{ textAlign: "right" }}>
                  {floor.totalAreaM2.toFixed(0)} m²
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Section Cut ---- */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Section Cut</span>
        <input
          type="range"
          min={0}
          max={building.totalHeightM}
          step={0.1}
          value={config.sectionCutY ?? building.totalHeightM}
          onChange={handleSectionCut}
          style={{ width: "100%" }}
        />
        <div style={{ fontSize: 11, color: "#888", textAlign: "center" }}>
          {config.sectionCutY !== null
            ? `Cut at ${config.sectionCutY.toFixed(1)} m`
            : "No cut (full view)"}
        </div>
      </div>

      {/* ---- Color Mode ---- */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Color Mode</span>
        <div style={{ display: "flex", gap: 4 }}>
          {(["category", "quality", "uniform"] as ColorMode[]).map((mode) => (
            <button
              key={mode}
              style={btnStyle(config.colorMode === mode)}
              onClick={() => handleColorMode(mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Display Toggles ---- */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Display</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={config.wireframe}
              onChange={(e) =>
                onConfigChange({ wireframe: e.target.checked })
              }
            />
            Wireframe
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={config.showSlabs}
              onChange={(e) =>
                onConfigChange({ showSlabs: e.target.checked })
              }
            />
            Floor Slabs
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={config.showCorridors}
              onChange={(e) =>
                onConfigChange({ showCorridors: e.target.checked })
              }
            />
            Corridors
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={config.showDoors}
              onChange={(e) =>
                onConfigChange({ showDoors: e.target.checked })
              }
            />
            Doors
          </label>
        </div>
      </div>

      {/* ---- Opacity ---- */}
      <div style={sectionStyle}>
        <span style={labelStyle}>
          Room Opacity: {Math.round(config.roomOpacity * 100)}%
        </span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={config.roomOpacity}
          onChange={(e) =>
            onConfigChange({ roomOpacity: parseFloat(e.target.value) })
          }
          style={{ width: "100%" }}
        />
      </div>

      {/* ---- Selected Room Detail ---- */}
      {selectedRoom && (
        <div
          style={{
            padding: 10,
            background: "var(--sa-bg-muted, #f9f9f9)",
            borderRadius: 6,
            border: "1px solid var(--sa-border, #e5e5e5)",
          }}
        >
          <span style={labelStyle}>Selected Room</span>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {selectedRoom.name}
          </div>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ color: "#888", padding: "1px 0" }}>Category</td>
                <td style={{ textAlign: "right" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: selectedRoom.colorHex,
                      marginRight: 4,
                    }}
                  />
                  {selectedRoom.category}
                </td>
              </tr>
              <tr>
                <td style={{ color: "#888", padding: "1px 0" }}>Floor</td>
                <td style={{ textAlign: "right" }}>
                  {selectedRoom.floorIndex === 0
                    ? "G/F"
                    : `${selectedRoom.floorIndex}/F`}
                </td>
              </tr>
              <tr>
                <td style={{ color: "#888", padding: "1px 0" }}>Area</td>
                <td style={{ textAlign: "right" }}>
                  {selectedRoom.areaM2.toFixed(0)} m²
                </td>
              </tr>
              <tr>
                <td style={{ color: "#888", padding: "1px 0" }}>Volume</td>
                <td style={{ textAlign: "right" }}>
                  {selectedRoom.volumeM3.toFixed(0)} m³
                </td>
              </tr>
              <tr>
                <td style={{ color: "#888", padding: "1px 0" }}>Exterior</td>
                <td style={{ textAlign: "right" }}>
                  {selectedRoom.touchesExterior ? "Yes" : "No"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
