// ============================================================
// CandidateCard — Compact overview of a single zoning candidate
// ============================================================

import type { ZoningCandidate, FitnessBreakdown } from "@/types/zoning";
import type { SpaceType } from "@/types/program";

interface CandidateCardProps {
  candidate: ZoningCandidate;
  isSelected: boolean;
  isBest: boolean;
  isAdjusted: boolean;
  adjustedFitness: FitnessBreakdown | null;
  onClick: () => void;
  categoryColors: Record<string, string>;
  spaces: SpaceType[];
}

export default function CandidateCard({
  candidate,
  isSelected,
  isBest,
  isAdjusted,
  adjustedFitness,
  onClick,
  categoryColors,
  spaces,
}: CandidateCardProps) {
  const fitness = adjustedFitness ?? candidate.fitness;

  // Build space lookup
  const spaceMap = new Map<string, SpaceType>();
  for (const s of spaces) spaceMap.set(s.id, s);

  // Score color
  const scoreColor =
    fitness.totalScore >= 0.8
      ? "#27AE60"
      : fitness.totalScore >= 0.6
        ? "#E67E22"
        : "#E74C3C";

  return (
    <div
      onClick={onClick}
      className="sa-card"
      style={{
        padding: "10px 12px",
        minWidth: 160,
        maxWidth: 200,
        cursor: "pointer",
        border: isSelected
          ? "2px solid var(--primary)"
          : "2px solid transparent",
        opacity: isSelected ? 1 : 0.8,
        transition: "all 0.15s",
        position: "relative",
      }}
    >
      {/* Badges */}
      <div className="flex items-center gap-1 mb-2">
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          #{candidate.rank + 1}
        </span>
        {isBest && (
          <span
            className="sa-tag"
            style={{
              background: "#27AE60",
              color: "#fff",
              fontSize: 9,
              padding: "1px 5px",
            }}
          >
            BEST
          </span>
        )}
        {isAdjusted && (
          <span
            className="sa-tag"
            style={{
              background: "#E67E22",
              color: "#fff",
              fontSize: 9,
              padding: "1px 5px",
            }}
          >
            ADJUSTED
          </span>
        )}
      </div>

      {/* Score */}
      <div
        className="text-lg font-bold mb-2"
        style={{ color: scoreColor }}
      >
        {fitness.totalScore.toFixed(3)}
      </div>

      {/* Mini floor bars */}
      <div className="space-y-1">
        {candidate.floors.map((floor) => (
          <div key={floor.floorIndex} className="flex items-center gap-1">
            <span
              className="text-[9px] font-mono w-[18px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {floor.floorIndex === 0 ? "G" : `${floor.floorIndex}F`}
            </span>
            <div
              className="flex-1 flex gap-[1px]"
              style={{
                height: 8,
                borderRadius: 2,
                overflow: "hidden",
                background: "var(--muted)",
              }}
            >
              {floor.spaceIds.map((id) => {
                const s = spaceMap.get(id);
                if (!s) return null;
                const area = s.quantity * s.areaPerUnit;
                const maxFloorArea = Math.max(
                  ...candidate.floors.map((f) => f.totalAreaM2),
                  1
                );
                const widthPct = (area / maxFloorArea) * 100;
                return (
                  <div
                    key={id}
                    style={{
                      width: `${widthPct}%`,
                      minWidth: 2,
                      height: "100%",
                      background:
                        categoryColors[s.category] ?? "#95A5A6",
                      borderRadius: 1,
                    }}
                    title={`${s.name} (${area}m²)`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sub-scores */}
      <div
        className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px]"
        style={{ color: "var(--muted-foreground)" }}
      >
        <span>Adj: {fitness.adjacencyScore.toFixed(2)}</span>
        <span>Clst: {fitness.clusterScore.toFixed(2)}</span>
        <span>Flr: {fitness.floorScore.toFixed(2)}</span>
        <span>Lgt: {fitness.lightScore.toFixed(2)}</span>
      </div>

      {/* Generation */}
      <div
        className="mt-1 text-[9px]"
        style={{ color: "var(--muted-foreground)" }}
      >
        Gen {candidate.generation}
      </div>
    </div>
  );
}
