// ============================================================
// MassingViewer — Main Component
//
// Loads SelectedLayout from localStorage, runs the massing
// extrusion engine, and renders the 3D building model with
// controls.  Provides export and screenshot functionality.
// ============================================================

import { useState, useMemo, useCallback, useRef } from "react";
import type { SelectedLayout } from "@/types/layout";
import type { RoomVolume, MassingResult } from "@/types/massing";
import { generateMassing, DEFAULT_MASSING_CONFIG } from "@/engines/massing";
import BuildingScene, {
  DEFAULT_SCENE_CONFIG,
  type SceneConfig,
} from "./BuildingScene";
import ControlPanel from "./ControlPanel";

// ---- localStorage helpers -----------------------------------------------

function loadFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// ---- Component ----------------------------------------------------------

export default function MassingViewer() {
  // Load layout from localStorage
  const layout = useMemo(
    () => loadFromStorage<SelectedLayout>("sentiarch_selected_layout"),
    [],
  );

  // Run massing engine
  const massingResult = useMemo<MassingResult | null>(() => {
    if (!layout) return null;
    try {
      return generateMassing(layout, {
        ...DEFAULT_MASSING_CONFIG,
        floorHeightM: 3.6,
      });
    } catch (err) {
      console.error("Massing generation failed:", err);
      return null;
    }
  }, [layout]);

  // Scene config state
  const [config, setConfig] = useState<SceneConfig>(() => {
    if (!massingResult) return DEFAULT_SCENE_CONFIG;
    // Show all floors by default
    const allFloors = new Set(
      massingResult.building.floors.map((f) => f.floorIndex),
    );
    return { ...DEFAULT_SCENE_CONFIG, visibleFloors: allFloors };
  });

  // Ensure visibleFloors is populated after massing is ready
  useMemo(() => {
    if (massingResult && config.visibleFloors.size === 0) {
      const allFloors = new Set(
        massingResult.building.floors.map((f) => f.floorIndex),
      );
      setConfig((prev) => ({ ...prev, visibleFloors: allFloors }));
    }
  }, [massingResult, config.visibleFloors.size]);

  // Selected room
  const [selectedRoom, setSelectedRoom] = useState<RoomVolume | null>(null);

  // Canvas ref for screenshot
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Config update handler
  const handleConfigChange = useCallback((update: Partial<SceneConfig>) => {
    setConfig((prev) => ({ ...prev, ...update }));
  }, []);

  // Room click handler
  const handleRoomClick = useCallback((room: RoomVolume) => {
    setSelectedRoom((prev) =>
      prev?.spaceId === room.spaceId && prev?.floorIndex === room.floorIndex
        ? null
        : room,
    );
  }, []);

  // Export JSON
  const handleExportJson = useCallback(() => {
    if (!massingResult) return;
    const blob = new Blob([JSON.stringify(massingResult, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sentiarch_massing_result.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [massingResult]);

  // Save to localStorage for Step 5
  const handleSave = useCallback(() => {
    if (!massingResult) return;
    localStorage.setItem(
      "sentiarch_massing_result",
      JSON.stringify(massingResult),
    );
    alert("Massing result saved for Step 5!");
  }, [massingResult]);

  // Screenshot
  const handleScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "sentiarch_massing_screenshot.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // ---- No Data State ----------------------------------------------------

  if (!layout) {
    return (
      <div className="sa-card" style={{ padding: 32, textAlign: "center" }}>
        <h3 style={{ marginBottom: 8 }}>No Layout Data</h3>
        <p style={{ color: "#888", marginBottom: 16 }}>
          Complete Steps 1–3 first, then return here to view the 3D massing
          model.
        </p>
        <p style={{ fontSize: 12, color: "#aaa" }}>
          Required: Programme Specification → Zoning Strategy → Layout
          Generation → Confirm selections
        </p>
      </div>
    );
  }

  if (!massingResult) {
    return (
      <div className="sa-card" style={{ padding: 32, textAlign: "center" }}>
        <h3 style={{ marginBottom: 8 }}>Massing Generation Failed</h3>
        <p style={{ color: "#888" }}>
          An error occurred while extruding the layout. Check the console for
          details.
        </p>
      </div>
    );
  }

  const { building } = massingResult;

  // ---- Render -----------------------------------------------------------

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: "1px solid var(--sa-border, #e5e5e5)",
          background: "var(--sa-bg, #fff)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, color: "#888" }}>
            {building.floorCount} floors | {building.totalHeightM.toFixed(1)}m
            | {building.totalGfaM2.toFixed(0)} m² GFA |{" "}
            {building.totalRoomCount} rooms
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="sa-btn sa-btn-sm" onClick={handleScreenshot}>
            Screenshot
          </button>
          <button className="sa-btn sa-btn-sm" onClick={handleExportJson}>
            Export JSON
          </button>
          <button
            className="sa-btn sa-btn-sm sa-btn-primary"
            onClick={handleSave}
          >
            Save for Step 5
          </button>
        </div>
      </div>

      {/* Main content: 3D view + control panel */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* 3D Viewer */}
        <div style={{ flex: 1, position: "relative" }}>
          <BuildingScene
            building={building}
            config={config}
            onRoomClick={handleRoomClick}
            onRoomHover={(room) => {
              if (room) {
                document.body.style.cursor = "pointer";
              } else {
                document.body.style.cursor = "default";
              }
            }}
            canvasRef={canvasRef}
          />

          {/* Category legend */}
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              background: "rgba(255,255,255,0.9)",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 11,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              maxWidth: 400,
              boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
            }}
          >
            {Array.from(
              new Set(
                building.floors.flatMap((f) =>
                  f.rooms.map((r) => r.category),
                ),
              ),
            )
              .sort()
              .map((cat) => {
                const room = building.floors
                  .flatMap((f) => f.rooms)
                  .find((r) => r.category === cat);
                return (
                  <span
                    key={cat}
                    style={{ display: "flex", alignItems: "center", gap: 3 }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: room?.colorHex ?? "#999",
                        display: "inline-block",
                      }}
                    />
                    {cat}
                  </span>
                );
              })}
          </div>
        </div>

        {/* Control Panel */}
        <ControlPanel
          building={building}
          config={config}
          onConfigChange={handleConfigChange}
          selectedRoom={selectedRoom}
          computeTimeMs={massingResult.computeTimeMs}
        />
      </div>
    </div>
  );
}
