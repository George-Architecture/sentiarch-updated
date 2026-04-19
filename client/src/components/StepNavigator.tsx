// ============================================================
// StepNavigator — Step progress bar with data-based completion
//
// Each step's completion is determined by checking whether the
// corresponding localStorage key contains valid data.  This
// gives the user a clear picture of which steps are done and
// which still need attention.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

// ---- Step definitions with localStorage keys ----------------

interface StepDef {
  label: string;
  path: string;
  step: number;
  /** localStorage key whose presence indicates this step is done. */
  storageKey: string;
}

const STEPS: StepDef[] = [
  { label: "Program",  path: "/program-spec", step: 1, storageKey: "sentiarch_program_spec" },
  { label: "Zoning",   path: "/zoning",       step: 2, storageKey: "sentiarch_selected_zoning" },
  { label: "Layout",   path: "/layout",       step: 3, storageKey: "sentiarch_selected_layout" },
  { label: "Massing",  path: "/massing",      step: 4, storageKey: "sentiarch_massing_result" },
  { label: "Simulate", path: "/simulation",   step: 5, storageKey: "sentiarch_simulation_result" },
  { label: "Compare",  path: "/compare",      step: 6, storageKey: "sentiarch_compare_snapshot" },
];

// ---- Helpers ------------------------------------------------

/** Check whether a localStorage key contains a non-empty JSON value. */
function hasData(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    // Accept objects and non-empty arrays
    return parsed !== null && parsed !== undefined;
  } catch {
    return false;
  }
}

// ---- Component ----------------------------------------------

export default function StepNavigator() {
  const [location, navigate] = useLocation();
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Scan localStorage for step completion data
  const refreshCompletion = useCallback(() => {
    const done = new Set<number>();
    for (const s of STEPS) {
      if (hasData(s.storageKey)) done.add(s.step);
    }
    setCompletedSteps(done);
  }, []);

  // Refresh on mount and whenever the route changes (user may
  // have just saved data in the previous step).
  useEffect(() => {
    refreshCompletion();
  }, [location, refreshCompletion]);

  // Also listen for storage events (cross-tab or same-tab writes)
  useEffect(() => {
    const handler = () => refreshCompletion();
    window.addEventListener("storage", handler);
    // Poll every 2 seconds as a fallback (same-tab localStorage
    // writes don't fire the storage event).
    const interval = setInterval(handler, 2000);
    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, [refreshCompletion]);

  const currentStep =
    STEPS.find((s) => location.startsWith(s.path))?.step ?? 0;

  if (currentStep === 0) return null;

  // Count completed steps for the summary badge
  const completedCount = completedSteps.size;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between gap-2">
        {/* Logo / Back to home */}
        <button
          onClick={() => navigate("/")}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          SentiArch
        </button>

        {/* Step pills */}
        <ol className="flex items-center gap-1 flex-1 justify-center">
          {STEPS.map((s, idx) => {
            const isActive = s.step === currentStep;
            const isCompleted = completedSteps.has(s.step);
            // A step is "reachable" if it's step 1, or the previous
            // step has data, or the step itself already has data.
            const isReachable =
              s.step === 1 ||
              isCompleted ||
              completedSteps.has(s.step - 1);

            return (
              <li key={s.path} className="flex items-center gap-1">
                {idx > 0 && (
                  <span
                    className={cn(
                      "h-px w-4 shrink-0 transition-colors",
                      isCompleted ? "bg-primary" : "bg-border"
                    )}
                  />
                )}
                <button
                  onClick={() => navigate(s.path)}
                  title={
                    isCompleted
                      ? `Step ${s.step}: ${s.label} — completed`
                      : isReachable
                        ? `Step ${s.step}: ${s.label}`
                        : `Step ${s.step}: ${s.label} — complete previous steps first`
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : isCompleted
                        ? "bg-primary/15 text-primary hover:bg-primary/25"
                        : isReachable
                          ? "text-muted-foreground hover:text-foreground hover:bg-muted"
                          : "text-muted-foreground/50 cursor-default"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                      isActive
                        ? "bg-primary-foreground/20"
                        : isCompleted
                          ? "bg-primary/20"
                          : "bg-muted"
                    )}
                  >
                    {isCompleted && !isActive ? "✓" : s.step}
                  </span>
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>

        {/* Right side: completion badge + Next button */}
        <div className="flex items-center gap-3 shrink-0">
          <span
            className="text-[10px] font-medium"
            style={{ color: "var(--muted-foreground)" }}
          >
            {completedCount}/6
          </span>
          {currentStep < 6 && (
            <button
              onClick={() => navigate(STEPS[currentStep].path)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
