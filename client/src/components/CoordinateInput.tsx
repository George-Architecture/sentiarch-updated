// ============================================================
// CoordinateInput Component - Rhino/GH coordinate data entry
// Design: Pixel Architecture Art
// ============================================================

import { useState } from "react";
import type { Shape } from "@/lib/store";
import { toast } from "sonner";

const ROOM_EXAMPLE = `0. {5000, 0}
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

export default function CoordinateInput({
  onAddShape,
  onClearAll,
}: {
  onAddShape: (shape: Shape) => void;
  onClearAll: () => void;
}) {
  const [text, setText] = useState("");
  const [shapeType, setShapeType] = useState<"room" | "window" | "door">("room");
  const [label, setLabel] = useState("");

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-pixel text-[9px]" style={{ color: "#6B4C3B", letterSpacing: "1px" }}>
          RHINO/GH COORDINATE DATA
        </span>
        <div className="flex gap-2">
          <button className="pixel-btn" style={{ fontSize: "8px", padding: "4px 8px" }}
            onClick={() => setText(ROOM_EXAMPLE)}>
            ROOM EXAMPLE
          </button>
          <button className="pixel-btn" style={{ fontSize: "8px", padding: "4px 8px" }}
            onClick={() => setText(WINDOW_EXAMPLE)}>
            WINDOW EXAMPLE
          </button>
        </div>
      </div>

      <div className="font-pixel text-[7px] mb-1" style={{ color: "#A89B8C", letterSpacing: "0.5px" }}>
        FORMAT: INDEX. {"{X, Y}"} — ONE POINT PER LINE — LAST POINT CONNECTS BACK TO FIRST (ROOM)
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Paste Rhino/GH coordinates...\n0. {5000, 0}\n1. {5000, 5000}\n2. {0, 5000}\n3. {0, 0}\n\nPoints connect in order. Rooms close automatically.`}
        className="w-full h-32 font-pixel-data text-base p-3 resize-none"
        style={{
          background: "#F5ECD8",
          border: "2px solid #3D6B4F",
          color: "#6B4C3B",
          outline: "none",
        }}
      />

      <div className="flex items-center gap-3">
        <span className="font-pixel text-[9px]" style={{ color: "#A89B8C" }}>SHAPE TYPE</span>
        {(["room", "window", "door"] as const).map((t) => (
          <button
            key={t}
            className="pixel-btn"
            style={{
              fontSize: "8px",
              padding: "4px 10px",
              background: shapeType === t ? "#3D6B4F" : "#EDE3D0",
              color: shapeType === t ? "#F2E8D5" : "#6B4C3B",
            }}
            onClick={() => setShapeType(t)}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="font-pixel text-[9px]" style={{ color: "#A89B8C" }}>LABEL (OPTIONAL)</span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Room A"
          className="font-pixel-data text-base px-2 py-1 flex-1"
          style={{ background: "#F5ECD8", border: "2px solid #6B4C3B", color: "#6B4C3B", outline: "none" }}
        />
      </div>

      <div className="flex gap-3">
        <button className="pixel-btn flex-1" style={{ background: "#3D6B4F" }} onClick={handleAdd}>
          + ADD SHAPE
        </button>
        <button className="pixel-btn" style={{ background: "#B85C38" }} onClick={onClearAll}>
          CLEAR ALL
        </button>
      </div>
    </div>
  );
}
