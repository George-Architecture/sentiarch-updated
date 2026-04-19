import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Program", path: "/program-spec", step: 1 },
  { label: "Zoning",  path: "/zoning",       step: 2 },
  { label: "Layout",  path: "/layout",        step: 3 },
  { label: "Massing", path: "/massing",       step: 4 },
  { label: "Simulate",path: "/simulation",    step: 5 },
  { label: "Compare", path: "/compare",       step: 6 },
];

export default function StepNavigator() {
  const [location, navigate] = useLocation();

  const currentStep = STEPS.find((s) => location.startsWith(s.path))?.step ?? 0;

  if (currentStep === 0) return null; // 唔喺任何 step page 就唔顯示

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
            const isDone   = s.step < currentStep;
            return (
              <li key={s.path} className="flex items-center gap-1">
                {idx > 0 && (
                  <span className={cn(
                    "h-px w-4 shrink-0 transition-colors",
                    isDone ? "bg-primary" : "bg-border"
                  )} />
                )}
                <button
                  onClick={() => navigate(s.path)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : isDone
                        ? "bg-primary/15 text-primary hover:bg-primary/25"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <span className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                    isActive ? "bg-primary-foreground/20" : isDone ? "bg-primary/20" : "bg-muted"
                  )}>
                    {s.step}
                  </span>
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>

        {/* Next step button */}
        {currentStep < 6 && (
          <button
            onClick={() => navigate(STEPS[currentStep].path)}
            className="text-xs font-medium text-primary hover:underline shrink-0"
          >
            Next →
          </button>
        )}
      </div>
    </nav>
  );
}
