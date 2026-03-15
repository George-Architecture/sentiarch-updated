// ============================================================
// ComparisonView - Side-by-side comfort score comparison
// Shows all 3 personas' results in a compact comparison layout
// ============================================================

import { type PersonaState, PERSONA_COLORS } from "@/lib/store";

export default function ComparisonView({ states }: { states: PersonaState[] }) {
  const allSimulated = states.every((s) => s.hasSimulated);

  return (
    <div className="pixel-panel mb-6" style={{ border: "3px solid #6B4C3B" }}>
      <div className="font-pixel text-[11px] tracking-wider mb-4" style={{ color: "#3A2A1A" }}>
        ◫ COMPARISON VIEW
      </div>

      {!allSimulated && (
        <div className="font-pixel-data text-sm mb-3" style={{ color: "#3A2A1A" }}>
          Note: Some personas have not been simulated yet. Run "Calculate Current Respond" first.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {states.map((s, i) => {
          const color = PERSONA_COLORS[i];
          return (
            <div
              key={i}
              className="p-4"
              style={{
                border: `2px solid ${color.primary}`,
                background: `${color.bg}`,
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-3 h-3"
                  style={{ background: color.primary }}
                />
                <span className="font-pixel text-[11px]" style={{ color: color.primary }}>
                  {s.persona.agent.id}
                </span>
              </div>

              {/* MBTI + Demographics */}
              <div className="font-pixel-data text-sm mb-2" style={{ color: "#3A2A1A" }}>
                {s.persona.agent.mbti} · {s.persona.agent.age}y · {s.persona.agent.gender}
              </div>

              {/* Comfort Score */}
              <div className="mb-3">
                <div
                  className="font-pixel text-[11px] px-3 py-1.5 inline-block"
                  style={{
                    background: s.hasSimulated ? color.primary : "#D4C4A8",
                    color: s.hasSimulated ? "#F2E8D5" : "#3A2A1A",
                    border: "2px solid #6B4C3B",
                  }}
                >
                  {s.hasSimulated ? `Comfort ${s.experience.comfort_score}` : "—"}
                </div>
                {s.hasSimulated && s.prevExperience && (
                  <span className="font-pixel-data text-sm ml-2" style={{
                    color: s.experience.trend === "rising" ? "#6B8E5A" : s.experience.trend === "declining" ? "#B85C38" : "#C4956A",
                  }}>
                    {s.experience.trend === "rising" ? "▲" : s.experience.trend === "declining" ? "▼" : "—"}{" "}
                    {s.experience.trend.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Summary */}
              {s.hasSimulated ? (
                <p className="font-body text-sm leading-relaxed mb-3" style={{ color: "#3A2A1A" }}>
                  {s.experience.summary.length > 120
                    ? s.experience.summary.slice(0, 120) + "..."
                    : s.experience.summary}
                </p>
              ) : (
                <p className="font-pixel-data text-sm" style={{ color: "#3A2A1A" }}>
                  Not yet simulated
                </p>
              )}

              {/* Key metrics */}
              {s.hasSimulated && (
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {[
                    { label: "Thermal", val: s.accState.thermal_discomfort },
                    { label: "Visual", val: s.accState.visual_strain },
                    { label: "Noise", val: s.accState.noise_stress },
                    { label: "Social", val: s.accState.social_overload },
                    { label: "Fatigue", val: s.accState.fatigue },
                    { label: "Wayfind.", val: s.accState.wayfinding_anxiety },
                  ].map((m) => (
                    <div key={m.label} className="flex items-center gap-1">
                      <span className="font-pixel-data text-sm" style={{ color: "#3A2A1A", width: 52 }}>
                        {m.label}
                      </span>
                      <div className="flex-1 h-2" style={{ background: "#EDE3D0" }}>
                        <div
                          className="h-full"
                          style={{
                            width: `${m.val * 100}%`,
                            background: m.val > 0.6 ? "#B85C38" : m.val > 0.3 ? "#C4956A" : "#6B8E5A",
                          }}
                        />
                      </div>
                      <span className="font-pixel-data text-sm" style={{ color: "#3A2A1A", width: 24, textAlign: "right" }}>
                        {m.val.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* PMV */}
              <div className="mt-2 flex items-center gap-2">
                <span className="font-pixel-data text-sm" style={{ color: "#3A2A1A" }}>PMV</span>
                <span className="font-pixel-data text-sm" style={{ color: "#3A2A1A", fontWeight: "bold" }}>
                  {s.computed.PMV}
                </span>
                <span className="font-pixel-data text-sm" style={{ color: "#3A2A1A" }}>PPD</span>
                <span className="font-pixel-data text-sm" style={{ color: "#3A2A1A", fontWeight: "bold" }}>
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
