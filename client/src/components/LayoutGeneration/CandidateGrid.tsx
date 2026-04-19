// ============================================================
// CandidateGrid — Thumbnail grid of layout candidates
//
// Shows 5 candidates side by side for one floor.  Click to
// expand full view.  Quality score breakdown visible.
// ============================================================

import type { FloorLayoutCandidate } from "@/types/layout";
import FloorPlanCanvas from "./FloorPlanCanvas";

interface CandidateGridProps {
  candidates: FloorLayoutCandidate[];
  selectedId: string | null;
  onSelect: (candidateId: string) => void;
}

export default function CandidateGrid({
  candidates,
  selectedId,
  onSelect,
}: CandidateGridProps) {
  if (candidates.length === 0) {
    return (
      <div
        className="sa-card"
        style={{
          padding: 20,
          textAlign: "center",
          color: "var(--muted-foreground)",
        }}
      >
        No candidates generated for this floor.
      </div>
    );
  }

  const bestId = candidates[0]?.id;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 12,
      }}
    >
      {candidates.map((c) => {
        const isSelected = selectedId === c.id;
        const isBest = c.id === bestId;
        const scoreColor =
          c.quality.totalScore >= 0.7
            ? "#27AE60"
            : c.quality.totalScore >= 0.5
              ? "#E67E22"
              : "#E74C3C";

        return (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            className="sa-card"
            style={{
              padding: 8,
              cursor: "pointer",
              border: isSelected
                ? "2px solid var(--primary)"
                : "2px solid transparent",
              opacity: isSelected ? 1 : 0.85,
              transition: "all 0.15s",
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-1 mb-1">
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                #{c.rank + 1}
              </span>
              {isBest && (
                <span
                  className="sa-tag"
                  style={{
                    background: "#27AE60",
                    color: "#fff",
                    fontSize: 9,
                    padding: "1px 4px",
                  }}
                >
                  BEST
                </span>
              )}
              <span
                className="sa-tag"
                style={{
                  fontSize: 8,
                  padding: "1px 4px",
                  background: "var(--muted)",
                  color: "var(--muted-foreground)",
                }}
              >
                {c.generationStrategy}
              </span>
              <div className="flex-1" />
              <span
                className="text-sm font-bold"
                style={{ color: scoreColor }}
              >
                {c.quality.totalScore.toFixed(3)}
              </span>
            </div>

            {/* Thumbnail */}
            <FloorPlanCanvas
              candidate={c}
              width={200}
              height={150}
              thumbnail
            />

            {/* Score breakdown */}
            <div
              className="mt-1 grid grid-cols-2 gap-x-2 text-[9px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              <span>
                Adj: {(c.quality.adjacencySatisfaction * 100).toFixed(0)}%
              </span>
              <span>
                Area: {(c.quality.areaEfficiency * 100).toFixed(0)}%
              </span>
              <span>
                Corr: {(c.quality.corridorRatio * 100).toFixed(1)}%
              </span>
              <span>
                Light: {(c.quality.naturalLightAccess * 100).toFixed(0)}%
              </span>
            </div>

            {/* Room count */}
            <div
              className="mt-1 text-[9px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {c.rooms.length} rooms | {c.doors.length} doors |{" "}
              {c.corridors.length} corridors
            </div>
          </div>
        );
      })}
    </div>
  );
}
