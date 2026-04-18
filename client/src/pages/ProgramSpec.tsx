// ============================================================
// Programme Specification Editor Page
//
// Phase 1, Step 1 of the SentiArch parametric design workflow.
// ============================================================

import { useLocation } from "wouter";
import ProgramSpecEditor from "@/components/ProgramSpecEditor";

export default function ProgramSpec() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div className="container py-6 mx-auto" style={{ maxWidth: 1400 }}>
        {/* Navigation */}
        <div className="flex items-center gap-3 mb-4">
          <button className="sa-btn" onClick={() => navigate("/")}>
            Back
          </button>
          <div>
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              Programme Specification
            </h1>
            <p
              className="text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              Step 1 of 6 — Define spaces, adjacencies, and constraints
            </p>
          </div>
        </div>

        {/* Editor */}
        <ProgramSpecEditor />
      </div>
    </div>
  );
}
