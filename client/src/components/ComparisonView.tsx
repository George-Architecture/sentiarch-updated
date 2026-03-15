// ============================================================
// ComparisonView - Side-by-side comfort score comparison
// Updated:
//   - Font sizes tripled throughout
//   - Full inner monologue / summary displayed (no truncation)
//   - Comfort score Before/After comparison with delta
//   - Larger perceptual load bars
// ============================================================

import { type PersonaState, PERSONA_COLORS } from "@/lib/store";

function MiniBar({ val }: { val: number }) {
  const bg = val > 0.6 ? "#B85C38" : val > 0.3 ? "#C4956A" : "#6B8E5A";
  return (
    <div className="flex-1 h-4" style={{ background: "#EDE3D0", border: "1px solid #C4B49A" }}>
      <div className="h-full" style={{ width: `${val * 100}%`, background: bg, transition: "width 0.4s ease" }} />
    </div>
  );
}

export default function ComparisonView({ states }: { states: PersonaState[] }) {
  const allSimulated = states.every((s) => s.hasSimulated);

  return (
    <div className="pixel-panel mb-6" style={{ border: "3px solid #6B4C3B" }}>
      {/* Section title */}
      <div className="font-pixel mb-5" style={{ color: "#3A2A1A", fontSize: "18px", letterSpacing: "2px" }}>
        ◫ COMPARISON VIEW
      </div>

      {!allSimulated && (
        <div className="font-pixel-data mb-4" style={{ color: "#3A2A1A", fontSize: "16px" }}>
          Note: Some personas have not been simulated yet. Run "Calculate Current Respond" first.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {states.map((s, i) => {
          const color = PERSONA_COLORS[i];
          const prevScore = s.prevExperience ? s.prevExperience.comfort_score : null;
          const currScore = s.experience.comfort_score;
          const delta = prevScore != null && prevScore > 0 ? currScore - prevScore : null;

          // High-contrast comfort colour (matches PersonaMindMap)
          const getComfortBg = (score: number) => {
            if (score === 0) return "#6B4C3B";
            if (score <= 3) return "#8B1A1A";
            if (score <= 5) return "#B85C38";
            if (score <= 7) return "#C4956A";
            return "#2E6B3A";
          };

          return (
            <div
              key={i}
              className="p-5"
              style={{
                border: `3px solid ${color.primary}`,
                background: color.bg,
              }}
            >
              {/* ---- Header: persona name ---- */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 shrink-0" style={{ background: color.primary }} />
                <span className="font-pixel" style={{ color: color.primary, fontSize: "20px", letterSpacing: "1px" }}>
                  {s.persona.agent.id}
                </span>
              </div>

              {/* ---- Demographics ---- */}
              <div className="font-pixel-data mb-4" style={{ color: "#3A2A1A", fontSize: "16px" }}>
                {s.persona.agent.mbti} · {s.persona.agent.age}y · {s.persona.agent.gender}
              </div>

              {/* ---- Comfort Score (current) ---- */}
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <div
                  className="font-pixel px-4 py-2 inline-block"
                  style={{
                    background: s.hasSimulated ? getComfortBg(currScore) : "#D4C4A8",
                    color: "#F2E8D5",
                    border: "2px solid #6B4C3B",
                    fontSize: "20px",
                    letterSpacing: "1px",
                  }}
                >
                  {s.hasSimulated ? `Comfort ${currScore}` : "—"}
                </div>

                {/* Trend badge */}
                {s.hasSimulated && (
                  <span
                    className="font-pixel"
                    style={{
                      fontSize: "15px",
                      color:
                        s.experience.trend === "rising" ? "#2E6B3A"
                        : s.experience.trend === "declining" ? "#8B1A1A"
                        : "#C4956A",
                    }}
                  >
                    {s.experience.trend === "rising" ? "▲" : s.experience.trend === "declining" ? "▼" : "—"}{" "}
                    {s.experience.trend.toUpperCase()}
                  </span>
                )}
              </div>

              {/* ---- Before / After Comfort comparison ---- */}
              {s.hasSimulated && prevScore != null && prevScore > 0 && (
                <div
                  className="flex items-center gap-3 mb-4 px-3 py-2"
                  style={{ background: "#F2E8D5", border: "2px dashed #C4B49A" }}
                >
                  {/* Before */}
                  <div className="text-center">
                    <div className="font-pixel mb-1" style={{ color: "#3A2A1A", fontSize: "11px", letterSpacing: "1px" }}>BEFORE</div>
                    <div
                      className="font-pixel px-3 py-1"
                      style={{
                        background: getComfortBg(prevScore),
                        color: "#F2E8D5",
                        fontSize: "18px",
                        border: "2px solid #6B4C3B",
                      }}
                    >
                      {prevScore}
                    </div>
                  </div>

                  {/* Arrow + delta */}
                  <div className="flex flex-col items-center flex-1">
                    <svg width="48" height="20" viewBox="0 0 48 20">
                      <defs>
                        <marker id={`arrowC${i}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                          <polygon points="0 0, 8 3, 0 6" fill={delta != null && delta > 0 ? "#2E6B3A" : delta != null && delta < 0 ? "#8B1A1A" : "#C4956A"} />
                        </marker>
                      </defs>
                      <line x1="2" y1="10" x2="40" y2="10"
                        stroke={delta != null && delta > 0 ? "#2E6B3A" : delta != null && delta < 0 ? "#8B1A1A" : "#C4956A"}
                        strokeWidth="2.5"
                        markerEnd={`url(#arrowC${i})`}
                      />
                    </svg>
                    {delta != null && (
                      <span className="font-pixel-data" style={{
                        fontSize: "15px",
                        fontWeight: "bold",
                        color: delta > 0 ? "#2E6B3A" : delta < 0 ? "#8B1A1A" : "#C4956A",
                      }}>
                        {delta > 0 ? "+" : ""}{delta}
                      </span>
                    )}
                  </div>

                  {/* After */}
                  <div className="text-center">
                    <div className="font-pixel mb-1" style={{ color: "#3A2A1A", fontSize: "11px", letterSpacing: "1px" }}>AFTER</div>
                    <div
                      className="font-pixel px-3 py-1"
                      style={{
                        background: getComfortBg(currScore),
                        color: "#F2E8D5",
                        fontSize: "18px",
                        border: "2px solid #6B4C3B",
                      }}
                    >
                      {currScore}
                    </div>
                  </div>
                </div>
              )}

              {/* ---- Full inner monologue / summary ---- */}
              {s.hasSimulated ? (
                <div
                  className="font-body leading-relaxed mb-4 p-3"
                  style={{
                    color: "#3A2A1A",
                    fontSize: "15px",
                    background: "#F5ECD8",
                    border: "1px solid #C4B49A",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {s.experience.summary}
                </div>
              ) : (
                <p className="font-pixel-data mb-4" style={{ color: "#3A2A1A", fontSize: "15px" }}>
                  Not yet simulated
                </p>
              )}

              {/* ---- Perceptual Load bars ---- */}
              {s.hasSimulated && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
                  {[
                    { label: "Thermal",  val: s.accState.thermal_discomfort },
                    { label: "Visual",   val: s.accState.visual_strain },
                    { label: "Noise",    val: s.accState.noise_stress },
                    { label: "Social",   val: s.accState.social_overload },
                    { label: "Fatigue",  val: s.accState.fatigue },
                    { label: "Wayfnd.", val: s.accState.wayfinding_anxiety },
                  ].map((m) => (
                    <div key={m.label} className="flex items-center gap-2">
                      <span
                        className="font-pixel-data shrink-0"
                        style={{ color: "#3A2A1A", fontSize: "14px", width: 62 }}
                      >
                        {m.label}
                      </span>
                      <MiniBar val={m.val} />
                      <span
                        className="font-pixel-data shrink-0 text-right"
                        style={{ color: "#3A2A1A", fontSize: "14px", width: 32 }}
                      >
                        {m.val.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* ---- PMV / PPD ---- */}
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span className="font-pixel-data" style={{ color: "#3A2A1A", fontSize: "15px" }}>PMV</span>
                <span className="font-pixel-data" style={{ color: "#3A2A1A", fontSize: "15px", fontWeight: "bold" }}>
                  {s.computed.PMV}
                </span>
                <span className="font-pixel-data" style={{ color: "#3A2A1A", fontSize: "15px" }}>PPD</span>
                <span className="font-pixel-data" style={{ color: "#3A2A1A", fontSize: "15px", fontWeight: "bold" }}>
                  {s.computed.PPD}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
