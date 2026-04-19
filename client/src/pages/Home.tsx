// ============================================================
// SentiArch — Landing / Dashboard Page
// Entry point to the 6-step parametric design workflow
// ============================================================

import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    step: 1,
    path: "/program-spec",
    label: "Program Specification",
    short: "Program",
    icon: "📋",
    color: "#6366F1",
    description: "Define space types, areas, adjacency rules, and floor counts using the JCTIC template.",
    tag: "Schema · Zod · JCTIC Template",
  },
  {
    step: 2,
    path: "/zoning",
    label: "Zoning Strategy",
    short: "Zoning",
    icon: "🗺️",
    color: "#8B5CF6",
    description: "Genetic algorithm generates 5 floor zoning candidates. Drag-and-drop to refine.",
    tag: "GA · 100 pop × 200 gen · 4 fitness metrics",
  },
  {
    step: 3,
    path: "/layout",
    label: "Layout Generation",
    short: "Layout",
    icon: "📐",
    color: "#EC4899",
    description: "Treemap CSP solver produces 2D floor plans. Edit site boundary polygon.",
    tag: "CSP · Treemap · 5 strategies",
  },
  {
    step: 4,
    path: "/massing",
    label: "Massing Extrusion",
    short: "Massing",
    icon: "🏗️",
    color: "#F59E0B",
    description: "Extrude 2D plans into a 3D building model. Toggle floors, slice sections, export screenshots.",
    tag: "Three.js · React Three Fiber · Screenshot",
  },
  {
    step: 5,
    path: "/simulation",
    label: "Agent Simulation",
    short: "Simulate",
    icon: "🧠",
    color: "#10B981",
    description: "Run PMV/PPD thermal comfort simulation across 6 MBTI cohorts. Static dwell or A* route mode.",
    tag: "PMV/PPD · A* · MBTI · LLM Narrative",
  },
  {
    step: 6,
    path: "/compare",
    label: "Compare & Refine",
    short: "Compare",
    icon: "📊",
    color: "#3B82F6",
    description: "Radar chart comparison, Thermal Equity Score analysis, what-if overrides, export package.",
    tag: "Thermal Equity · Radar · Export",
  },
];

export default function Home() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="flex items-start justify-between gap-8">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4"
                style={{ background: "#6366F115", color: "#6366F1", border: "1px solid #6366F130" }}>
                HKU MArch Thesis · JCTIC Case Study
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground mb-3">
                SentiArch
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
                A parametric design system that makes the <em>heterogeneous user experience</em> visible —
                MBTI personas, PMV/PPD thermal comfort, and LLM first-person narratives across 6 design steps.
              </p>
              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={() => navigate("/program-spec")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "#6366F1", boxShadow: "0 2px 12px #6366F140" }}
                >
                  Start Workflow →
                </button>
                <button
                  onClick={() => navigate("/legacy")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                >
                  Legacy Prototype ↗
                </button>
              </div>
            </div>

            {/* Progress pills */}
            <div className="hidden md:flex flex-col gap-1.5 shrink-0 pt-1">
              {STEPS.map((s) => (
                <button
                  key={s.path}
                  onClick={() => navigate(s.path)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-all hover:bg-muted"
                >
                  <span className="text-base">{s.icon}</span>
                  <span className="text-muted-foreground">Step {s.step}</span>
                  <span className="text-foreground font-semibold">{s.short}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Step cards */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-6">
          6-Step Design Workflow
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <button
              key={s.path}
              onClick={() => navigate(s.path)}
              className="group text-left rounded-xl border border-border bg-card p-5 transition-all hover:border-opacity-60 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]"
              style={{ "--step-color": s.color } as React.CSSProperties}
            >
              {/* Step number + icon */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                    style={{ background: s.color + "18" }}
                  >
                    {s.icon}
                  </div>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: s.color + "15", color: s.color }}
                  >
                    Step {s.step}
                  </span>
                </div>
                <span
                  className="text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium"
                  style={{ color: s.color }}
                >
                  Open →
                </span>
              </div>

              {/* Label */}
              <h3 className="text-sm font-semibold text-foreground mb-1.5">{s.label}</h3>

              {/* Description */}
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">{s.description}</p>

              {/* Tag */}
              <div
                className="text-xs px-2 py-0.5 rounded-md inline-block font-mono"
                style={{ background: s.color + "10", color: s.color + "cc" }}
              >
                {s.tag}
              </div>
            </button>
          ))}
        </div>

        {/* Bottom note */}
        <div className="mt-8 flex items-center gap-4 text-xs text-muted-foreground">
          <span>Data flows via <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">localStorage</code> between steps.</span>
          <span>·</span>
          <span>Configure LLM API key in <button onClick={() => navigate("/settings")} className="underline hover:text-foreground transition-colors">Settings</button> for narrative generation.</span>
        </div>
      </div>
    </div>
  );
}
