// ============================================================
// FloorStrip — Horizontal bar showing spaces on a single floor
//
// Supports drag-and-drop: drag a space block to another
// FloorStrip to reassign it.
//
// v3: Shows block label when multi-block zoning is active.
// ============================================================

import { useState, useCallback } from "react";
import type { FloorAssignment } from "@/types/zoning";
import type { SpaceType } from "@/types/program";

const BLOCK_COLORS = ["#5B8DEF", "#E07BE0", "#4DC9A0"];

interface FloorStripProps {
  floor: FloorAssignment;
  spaces: SpaceType[];
  categoryColors: Record<string, string>;
  maxFloors: number;
  onDragStart: (spaceId: string, fromFloor: number) => void;
  onDrop: (targetFloor: number) => void;
}

export default function FloorStrip({
  floor,
  spaces,
  categoryColors,
  maxFloors,
  onDragStart,
  onDrop,
}: FloorStripProps) {
  const [dragOver, setDragOver] = useState(false);

  // Space lookup
  const spaceMap = new Map<string, SpaceType>();
  for (const s of spaces) spaceMap.set(s.id, s);

  const floorLabel =
    floor.floorIndex === 0 ? "G/F" : `${floor.floorIndex}/F`;
  const blockIdx = floor.blockIndex ?? 0;
  const blockLabel =
    floor.blockIndex !== undefined
      ? `Block ${String.fromCharCode(65 + blockIdx)}`
      : null;

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(true);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      onDrop(floor.floorIndex);
    },
    [floor.floorIndex, onDrop]
  );

  // Sort spaces by area (largest first) for visual clarity
  const sortedSpaceIds = [...floor.spaceIds].sort((a, b) => {
    const sa = spaceMap.get(a);
    const sb = spaceMap.get(b);
    const areaA = sa ? sa.quantity * sa.areaPerUnit : 0;
    const areaB = sb ? sb.quantity * sb.areaPerUnit : 0;
    return areaB - areaA;
  });

  return (
    <div
      className="sa-card"
      style={{
        padding: "8px 12px",
        border: dragOver
          ? "2px dashed var(--primary)"
          : "2px solid transparent",
        background: dragOver ? "rgba(29, 107, 94, 0.05)" : undefined,
        transition: "all 0.15s",
        borderLeft: blockLabel
          ? `3px solid ${BLOCK_COLORS[blockIdx % BLOCK_COLORS.length]}`
          : undefined,
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Floor header */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-xs font-bold font-mono"
          style={{
            color: "var(--foreground)",
            minWidth: 30,
          }}
        >
          {floorLabel}
        </span>
        {blockLabel && (
          <span
            className="text-[9px] font-semibold px-1 rounded"
            style={{
              color: BLOCK_COLORS[blockIdx % BLOCK_COLORS.length],
              background:
                BLOCK_COLORS[blockIdx % BLOCK_COLORS.length] + "18",
            }}
          >
            {blockLabel}
          </span>
        )}
        <span
          className="text-[10px]"
          style={{ color: "var(--muted-foreground)" }}
        >
          {floor.spaceIds.length} spaces |{" "}
          {Math.round(floor.totalAreaM2).toLocaleString()} m²
        </span>
      </div>

      {/* Space blocks */}
      <div className="flex flex-wrap gap-1">
        {sortedSpaceIds.length === 0 && (
          <span
            className="text-[10px] italic py-2"
            style={{ color: "var(--muted-foreground)" }}
          >
            Empty floor — drop spaces here
          </span>
        )}
        {sortedSpaceIds.map((id) => {
          const s = spaceMap.get(id);
          if (!s) return null;
          const area = s.quantity * s.areaPerUnit;
          const color = categoryColors[s.category] ?? "#95A5A6";
          const isMandatory = s.floorMandatory !== undefined;

          return (
            <div
              key={id}
              draggable={!isMandatory}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
                onDragStart(id, floor.floorIndex);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px]"
              style={{
                background: color + "20",
                border: `1px solid ${color}60`,
                cursor: isMandatory ? "not-allowed" : "grab",
                opacity: isMandatory ? 0.7 : 1,
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
              title={
                isMandatory
                  ? `${s.name} — locked to floor ${s.floorMandatory}`
                  : `${s.name} — ${area}m² — drag to move`
              }
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "var(--foreground)" }}>
                {s.name}
              </span>
              <span style={{ color: "var(--muted-foreground)" }}>
                {area}m²
              </span>
              {isMandatory && (
                <span style={{ fontSize: 8, color: "#E74C3C" }}>
                  🔒
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
