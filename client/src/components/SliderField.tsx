// ============================================================
// SliderField Component - Draggable slider for parameter adjustment
// Design: Pixel Architecture Art
// Feature #3: Slider bars for ENVIRONMENT params + Met/Clo
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (val: number) => void;
  color?: string;
}

export default function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  color = "#3D6B4F",
}: SliderFieldProps) {
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const trackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep draft in sync when value changes externally
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const clamp = useCallback(
    (v: number) => {
      const clamped = Math.min(max, Math.max(min, v));
      // Round to step precision
      const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
      return parseFloat(clamped.toFixed(decimals));
    },
    [min, max, step]
  );

  const pct = ((value - min) / (max - min)) * 100;

  const updateFromPosition = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      // Snap to step
      const snapped = clamp(Math.round(raw / step) * step);
      onChange(snapped);
    },
    [min, max, step, clamp, onChange]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      updateFromPosition(e.clientX);
    },
    [updateFromPosition]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateFromPosition(e.clientX);
    };
    const handleMouseUp = () => {
      setDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, updateFromPosition]);

  // Touch support
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      setDragging(true);
      updateFromPosition(e.touches[0].clientX);
    },
    [updateFromPosition]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleTouchMove = (e: TouchEvent) => {
      updateFromPosition(e.touches[0].clientX);
    };
    const handleTouchEnd = () => {
      setDragging(false);
    };

    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [dragging, updateFromPosition]);

  const commitEdit = () => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) {
      onChange(clamp(parsed));
    }
  };

  return (
    <div className="py-1.5 px-1">
      {/* Label + Value row */}
      <div className="flex justify-between items-center mb-1">
        <span
          className="font-pixel-data text-base"
          style={{ color: "#A89B8C" }}
        >
          {label}
        </span>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(String(value));
              }
            }}
            step={step}
            min={min}
            max={max}
            className="font-pixel-data text-base px-1 py-0 outline-none text-right"
            style={{
              background: "#F5ECD8",
              color: "#6B4C3B",
              border: "2px solid #3D6B4F",
              width: 70,
            }}
            autoFocus
          />
        ) : (
          <span
            className="font-pixel-data text-base cursor-pointer px-1 hover:outline hover:outline-2 hover:outline-dashed"
            style={{
              color: "#6B4C3B",
              fontWeight: "bold",
              outlineColor: "#3D6B4F",
            }}
            onClick={() => {
              setDraft(String(value));
              setEditing(true);
            }}
            title="Click to edit"
          >
            {value}
            {suffix && (
              <span style={{ color: "#A89B8C", fontWeight: "normal" }}>
                {" "}
                {suffix}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Slider track */}
      <div
        ref={trackRef}
        className="relative h-5 select-none"
        style={{
          background: "#F2E8D5",
          border: "2px solid #6B4C3B",
          cursor: "pointer",
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* Fill bar */}
        <div
          className="absolute top-0 left-0 h-full"
          style={{
            width: `${pct}%`,
            background: color,
            opacity: 0.7,
            transition: dragging ? "none" : "width 0.15s ease",
          }}
        />

        {/* Thumb */}
        <div
          className="absolute top-0 h-full"
          style={{
            left: `${pct}%`,
            transform: "translateX(-50%)",
            width: 10,
            background: "#6B4C3B",
            border: "1px solid #F2E8D5",
            cursor: "grab",
          }}
        />

        {/* Min/Max labels */}
        <div
          className="absolute bottom-full left-0 font-pixel text-[6px]"
          style={{ color: "#C4B8A0", transform: "translateY(-1px)" }}
        >
          {min}
        </div>
        <div
          className="absolute bottom-full right-0 font-pixel text-[6px]"
          style={{ color: "#C4B8A0", transform: "translateY(-1px)" }}
        >
          {max}
        </div>
      </div>
    </div>
  );
}
