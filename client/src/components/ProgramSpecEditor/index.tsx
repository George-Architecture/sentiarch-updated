// ============================================================
// ProgramSpecEditor — Main Component
//
// Three tabs: Spaces, Adjacencies, Constraints
// Template picker, Import/Export JSON, Save to localStorage
// ============================================================

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  EditorProvider,
  useEditor,
  createEmptySpec,
} from "./EditorContext";
import SpacesTable from "./SpacesTable";
import AdjacencyDiagram from "./AdjacencyDiagram";
import ConstraintsForm from "./ConstraintsForm";
import { validateSpec } from "./utils/validation";
import {
  saveToLocalStorage,
  loadFromLocalStorage,
  exportToJson,
  importFromJson,
} from "./utils/exportImport";
import {
  listTemplates,
  getTemplate,
  type TemplateMeta,
} from "@/data/templates/index";

// ---- Tab Definitions -------------------------------------------------

const TABS = [
  { id: "spaces", label: "Spaces", icon: "▦" },
  { id: "adjacencies", label: "Adjacencies", icon: "◇" },
  { id: "constraints", label: "Constraints", icon: "⚙" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ---- Inner Editor (needs EditorProvider) -----------------------------

function EditorInner() {
  const { state, dispatch } = useEditor();
  const [activeTab, setActiveTab] = useState<TabId>("spaces");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadFromLocalStorage();
    if (saved) {
      dispatch({ type: "LOAD_SPEC", payload: saved });
      toast.info("Loaded saved programme specification");
    }
  }, [dispatch]);

  // Template list
  const templates = listTemplates();

  // ---- Handlers -------------------------------------------------------

  const handleLoadTemplate = useCallback(
    (templateId: string) => {
      const entry = getTemplate(templateId);
      if (!entry) return;
      // Deep clone to avoid mutating the registry
      const clone = JSON.parse(JSON.stringify(entry.data));
      clone.id = `spec-${Date.now()}`;
      clone.createdAt = new Date().toISOString();
      clone.updatedAt = new Date().toISOString();
      dispatch({ type: "LOAD_SPEC", payload: clone });
      toast.success(`Loaded template: ${entry.meta.name}`);
    },
    [dispatch]
  );

  const handleNewSpec = useCallback(() => {
    if (state.dirty && !confirm("Discard unsaved changes?")) return;
    dispatch({ type: "LOAD_SPEC", payload: createEmptySpec() });
    toast.info("Created new programme specification");
  }, [dispatch, state.dirty]);

  const handleSave = useCallback(() => {
    const errors = validateSpec(state.spec);
    if (errors.length > 0) {
      dispatch({ type: "SET_ERRORS", payload: errors });
      toast.error(`Validation failed: ${errors.length} error(s)`);
      return;
    }
    dispatch({ type: "SET_ERRORS", payload: [] });
    saveToLocalStorage(state.spec);
    dispatch({ type: "MARK_SAVED" });
    toast.success("Programme specification saved");
  }, [dispatch, state.spec]);

  const handleExport = useCallback(() => {
    exportToJson(state.spec);
    toast.success("Exported JSON file");
  }, [state.spec]);

  const handleImport = useCallback(async () => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const result = await importFromJson(file);
      if (result.success && result.data) {
        dispatch({ type: "LOAD_SPEC", payload: result.data });
        toast.success("Imported programme specification");
      } else {
        toast.error(
          `Import failed: ${result.errors?.join("; ") ?? "Unknown error"}`
        );
      }
      // Reset input so same file can be re-imported
      e.target.value = "";
    },
    [dispatch]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2
          className="text-lg font-semibold flex-shrink-0"
          style={{ color: "var(--foreground)" }}
        >
          Programme Specification Editor
        </h2>
        {state.dirty && (
          <span
            className="sa-tag"
            style={{
              borderColor: "#D4A843",
              color: "#D4A843",
              fontSize: 10,
            }}
          >
            Unsaved changes
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Template Picker */}
        <select
          className="sa-input"
          style={{ fontSize: 12, minWidth: 180 }}
          value=""
          onChange={e => {
            if (e.target.value) handleLoadTemplate(e.target.value);
          }}
        >
          <option value="">Load Template...</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.spaceCount} spaces, {t.totalAreaM2.toLocaleString()} m²)
            </option>
          ))}
        </select>

        <button className="sa-btn" onClick={handleNewSpec}>
          New
        </button>

        <div className="flex-1" />

        <button className="sa-btn" onClick={handleImport}>
          Import JSON
        </button>
        <button className="sa-btn" onClick={handleExport}>
          Export JSON
        </button>
        <button className="sa-btn sa-btn-primary" onClick={handleSave}>
          Save
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Spec Name / Description */}
      <div className="sa-card space-y-3" style={{ padding: "12px 16px" }}>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <label
              className="text-xs font-semibold block mb-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              Name
            </label>
            <input
              className="sa-input w-full"
              value={state.spec.name}
              onChange={e =>
                dispatch({
                  type: "SET_SPEC_META",
                  payload: { name: e.target.value },
                })
              }
            />
          </div>
          <div className="flex-[2] min-w-[300px]">
            <label
              className="text-xs font-semibold block mb-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              Description
            </label>
            <input
              className="sa-input w-full"
              value={state.spec.description ?? ""}
              onChange={e =>
                dispatch({
                  type: "SET_SPEC_META",
                  payload: { description: e.target.value },
                })
              }
            />
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {state.errors.length > 0 && (
        <div
          className="sa-card space-y-1"
          style={{
            borderColor: "var(--destructive)",
            background: "rgba(196, 64, 64, 0.05)",
            padding: "12px 16px",
          }}
        >
          <h4
            className="text-xs font-semibold"
            style={{ color: "var(--destructive)" }}
          >
            Validation Errors ({state.errors.length})
          </h4>
          {state.errors.map((err, i) => (
            <p
              key={i}
              className="text-xs"
              style={{ color: "var(--destructive)" }}
            >
              {err}
            </p>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1" style={{ borderBottom: "1px solid var(--border)" }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2"
                : "hover:bg-[var(--muted)]"
            }`}
            style={{
              color:
                activeTab === tab.id
                  ? "var(--primary)"
                  : "var(--muted-foreground)",
              borderColor:
                activeTab === tab.id ? "var(--primary)" : "transparent",
              borderRadius: "6px 6px 0 0",
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "spaces" && <SpacesTable />}
        {activeTab === "adjacencies" && <AdjacencyDiagram />}
        {activeTab === "constraints" && <ConstraintsForm />}
      </div>
    </div>
  );
}

// ---- Exported Component (with Provider) ------------------------------

export default function ProgramSpecEditor() {
  return (
    <EditorProvider>
      <EditorInner />
    </EditorProvider>
  );
}
