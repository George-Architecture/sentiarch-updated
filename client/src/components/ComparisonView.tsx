// ============================================================
// ComparisonView - Side-by-side comfort score comparison
// Design: Academic Instrument Dashboard (Neumorphism)
// ============================================================

import { type PersonaState, getPersonaColor } from "@/lib/store";

function MiniBar({ val }: { val: number }) {
  const bg = val > 0.6 ? "#C44040" : val > 0.3 ? "#D4A017" : "#2E8B6A";
  return (
    <div className="flex-1 h-2 rounded-full relative" style={{
      background: "var(--muted)",
      boxShadow: "var(--shadow-inset)",
    }}>
      <div className="h-full rounded-full" style={{
        width: `${val * 100}%`,
        background: bg,
        transition: "width 0.4s ease",
      }} />
    </div>
  );
}

export default function ComparisonView({ states }: { states: PersonaState[] }) {
  const allSimulated = states.every((s) => s.hasSimulated);

  const getComfortColor = (score: number) => {
    if (score === 0) return "var(--muted-foreground)";
    if (score <= 3) return "#C44040";
    if (score <= 5) return "#D4A017";
    if (score <= 7) return "#2A8F7E";
    return "#1D6B5E";
  };

  return (
    <div className="sa-panel mb-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-sm font-bold tracking-wider" style={{ color: "var(--primary)", letterSpacing: "1.2px" }}>
          ◫ COMPARISON VIEW
        </span>
      </div>

      {!allSimulated && (
        <div className="text-sm mb-4 p-3 rounded-lg" style={{
          background: "#FFF8E1",
          border: "1px solid #E8D48A",
          color: "#8A6D00",
        }}>
          Some personas have not been simulated yet. Run "Calculate Current Respond" first.
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(states.length, 4)}, 1fr)` }}>
        {states.map((s, i) => {
          const color = getPersonaColor(i);
          const prevScore = s.prevExperience ? s.prevExperience.comfort_score : null;
          const currScore = s.experience.comfort_score;
          const delta = prevScore != null && prevScore > 0 ? currScore - prevScore : null;

          return (
            <div
              key={i}
              className="p-5 rounded-xl"
              style={{
                border: `2px solid ${color.primary}`,
                background: "var(--card)",
                boxShadow: "var(--shadow-raised)",
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 rounded-full shrink-0" style={{ background: color.primary }} />
                <span className="text-base font-bold" style={{ color: color.primary }}>
                  {s.persona.agent.id}
                </span>
              </div>

              {/* Demographics */}
              <div className="text-sm mb-4" style={{
                color: "var(--muted-foreground)",
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {s.persona.agent.mbti} · {s.persona.agent.age}y · {s.persona.agent.gender}
              </div>

              {/* Comfort Score */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-sm font-bold px-4 py-2 rounded-lg" style={{
                  background: s.hasSimulated ? getComfortColor(currScore) : "var(--muted)",
                  color: s.hasSimulated ? "#FFFFFF" : "var(--muted-foreground)",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                }}>
                  {s.hasSimulated ? `Comfort ${currScore}` : "—"}
                </span>

                {s.hasSimulated && (
                  <span className="text-xs font-semibold" style={{
                    color: s.experience.trend === "rising" ? "#1D6B5E"
                      : s.experience.trend === "declining" ? "#C44040"
                      : "var(--muted-foreground)",
                  }}>
                    {s.experience.trend === "rising" ? "▲" : s.experience.trend === "declining" ? "▼" : "—"}{" "}
                    {s.experience.trend}
                  </span>
                )}
              </div>

              {/* Before / After */}
              {s.hasSimulated && prevScore != null && prevScore > 0 && (
                <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg" style={{
                  background: "var(--muted)",
                  border: "1px dashed var(--border)",
                }}>
                  <div className="text-center">
                    <div className="text-xs font-semibold mb-1" style={{ color: "var(--muted-foreground)" }}>Before</div>
                    <div className="text-lg font-bold px-3 py-1 rounded-lg" style={{
                      background: getComfortColor(prevScore),
                      color: "#FFFFFF",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {prevScore}
                    </div>
                  </div>

                  <div className="flex flex-col items-center flex-1">
                    <svg width="48" height="16" viewBox="0 0 48 16">
                      <defs>
                        <marker id={`arrowC${i}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                          <polygon points="0 0, 8 3, 0 6" fill={delta != null && delta > 0 ? "#1D6B5E" : delta != null && delta < 0 ? "#C44040" : "var(--muted-foreground)"} />
                        </marker>
                      </defs>
                      <line x1="2" y1="8" x2="40" y2="8"
                        stroke={delta != null && delta > 0 ? "#1D6B5E" : delta != null && delta < 0 ? "#C44040" : "var(--muted-foreground)"}
                        strokeWidth="2"
                        markerEnd={`url(#arrowC${i})`}
                      />
                    </svg>
                    {delta != null && (
                      <span className="text-sm font-bold" style={{
                        color: delta > 0 ? "#1D6B5E" : delta < 0 ? "#C44040" : "var(--muted-foreground)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {delta > 0 ? "+" : ""}{delta}
                      </span>
                    )}
                  </div>

                  <div className="text-center">
                    <div className="text-xs font-semibold mb-1" style={{ color: "var(--muted-foreground)" }}>After</div>
                    <div className="text-lg font-bold px-3 py-1 rounded-lg" style={{
                      background: getComfortColor(currScore),
                      color: "#FFFFFF",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {currScore}
                    </div>
                  </div>
                </div>
              )}

              {/* Summary */}
              {s.hasSimulated ? (
                <div className="text-sm leading-relaxed mb-4 p-3 rounded-lg" style={{
                  color: "var(--foreground)",
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {s.experience.summary}
                </div>
              ) : (
                <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
                  Not yet simulated
                </p>
              )}

              {/* Perceptual Load */}
              {s.hasSimulated && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
                  {[
                    { label: "Thermal", val: s.accState.thermal_discomfort },
                    { label: "Visual", val: s.accState.visual_strain },
                    { label: "Noise", val: s.accState.noise_stress },
                    { label: "Social", val: s.accState.social_overload },
                    { label: "Fatigue", val: s.accState.fatigue },
                    { label: "Wayfnd.", val: s.accState.wayfinding_anxiety },
                  ].map((m) => (
                    <div key={m.label} className="flex items-center gap-2">
                      <span className="text-xs shrink-0" style={{
                        color: "var(--muted-foreground)",
                        width: 55,
                      }}>
                        {m.label}
                      </span>
                      <MiniBar val={m.val} />
                      <span className="text-xs shrink-0 text-right" style={{
                        color: "var(--foreground)",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 600,
                        width: 28,
                      }}>
                        {m.val.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* PMV / PPD */}
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>PMV</span>
                <span className="text-sm font-bold" style={{
                  color: "var(--foreground)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {s.computed.PMV}
                </span>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>PPD</span>
                <span className="text-sm font-bold" style={{
                  color: "var(--foreground)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
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
