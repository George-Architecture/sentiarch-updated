// ============================================================
// Page — Massing Extrusion (Step 4 of 6)
// ============================================================

import { useLocation } from "wouter";
import MassingViewer from "@/components/MassingViewer";

export default function MassingPage() {
  const [, setLocation] = useLocation();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--sa-bg-page, #FDF6EC)",
      }}
    >
      {/* Page header */}
      <div
        style={{
          padding: "12px 24px",
          borderBottom: "1px solid var(--sa-border, #e5e5e5)",
          background: "var(--sa-bg, #fff)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <button
          className="sa-btn sa-btn-sm"
          onClick={() => setLocation("/layout")}
        >
          Back
        </button>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            Massing Extrusion
          </h1>
          <p
            style={{
              fontSize: 12,
              color: "var(--sa-text-muted, #888)",
              margin: 0,
            }}
          >
            Step 4 of 6 — 3D building massing from floor plans
          </p>
        </div>
      </div>

      {/* Viewer fills remaining space */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <MassingViewer />
      </div>
    </div>
  );
}
