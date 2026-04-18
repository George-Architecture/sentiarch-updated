// ============================================================
// Zoning Page — Step 2 of 6 in the parametric design workflow
// ============================================================

import { useLocation } from "wouter";
import ZoningStrategy from "@/components/ZoningStrategy";

export default function ZoningPage() {
  const [, setLocation] = useLocation();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--background)",
        padding: "20px",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            className="sa-btn"
            onClick={() => setLocation("/")}
            style={{ padding: "4px 12px" }}
          >
            Back
          </button>
          <div>
            <h1
              className="text-base font-bold"
              style={{ color: "var(--foreground)" }}
            >
              Zoning Strategy
            </h1>
            <p
              className="text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              Step 2 of 6 — Generate and compare floor zoning
              candidates
            </p>
          </div>
        </div>

        {/* Editor */}
        <ZoningStrategy />
      </div>
    </div>
  );
}
