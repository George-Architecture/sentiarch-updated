// ============================================================
// ProgramSpecEditor — State Management
//
// React Context + useReducer for the editor state.
// Manages the current ProgramSpec, dirty state, and
// validation errors.
// ============================================================

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
  type Dispatch,
} from "react";
import {
  type ProgramSpec,
  type SpaceType,
  type AdjacencyRule,
  type BuildingConstraint,
  PROGRAM_SPEC_SCHEMA_VERSION,
  createAdjacencyRule,
} from "@/types/program";

// ---- State -----------------------------------------------------------

export interface EditorState {
  /** Current programme specification being edited. */
  spec: ProgramSpec;
  /** Whether unsaved changes exist. */
  dirty: boolean;
  /** Validation error messages (empty = valid). */
  errors: string[];
}

// ---- Actions ---------------------------------------------------------

export type EditorAction =
  | { type: "LOAD_SPEC"; payload: ProgramSpec }
  | { type: "SET_SPEC_META"; payload: { name?: string; description?: string } }
  | { type: "ADD_SPACE"; payload: SpaceType }
  | { type: "UPDATE_SPACE"; payload: { index: number; space: SpaceType } }
  | { type: "DELETE_SPACE"; payload: number }
  | { type: "ADD_ADJACENCY"; payload: Omit<AdjacencyRule, "fromSpaceId" | "toSpaceId"> & { fromSpaceId: string; toSpaceId: string } }
  | { type: "UPDATE_ADJACENCY"; payload: { index: number; rule: AdjacencyRule } }
  | { type: "DELETE_ADJACENCY"; payload: number }
  | { type: "UPDATE_CONSTRAINTS"; payload: Partial<BuildingConstraint> }
  | { type: "SET_ERRORS"; payload: string[] }
  | { type: "MARK_SAVED" };

// ---- Reducer ---------------------------------------------------------

function editorReducer(
  state: EditorState,
  action: EditorAction
): EditorState {
  switch (action.type) {
    case "LOAD_SPEC":
      return {
        spec: action.payload,
        dirty: false,
        errors: [],
      };

    case "SET_SPEC_META":
      return {
        ...state,
        dirty: true,
        spec: {
          ...state.spec,
          ...(action.payload.name !== undefined && {
            name: action.payload.name,
          }),
          ...(action.payload.description !== undefined && {
            description: action.payload.description,
          }),
          updatedAt: new Date().toISOString(),
        },
      };

    case "ADD_SPACE":
      return {
        ...state,
        dirty: true,
        spec: {
          ...state.spec,
          spaces: [...state.spec.spaces, action.payload],
          updatedAt: new Date().toISOString(),
        },
      };

    case "UPDATE_SPACE":
      return {
        ...state,
        dirty: true,
        spec: {
          ...state.spec,
          spaces: state.spec.spaces.map((s, i) =>
            i === action.payload.index ? action.payload.space : s
          ),
          updatedAt: new Date().toISOString(),
        },
      };

    case "DELETE_SPACE": {
      const removedId = state.spec.spaces[action.payload]?.id;
      // Also remove adjacencies referencing the deleted space.
      const filteredAdj = removedId
        ? state.spec.adjacencies.filter(
            a =>
              a.fromSpaceId !== removedId && a.toSpaceId !== removedId
          )
        : state.spec.adjacencies;
      return {
        ...state,
        dirty: true,
        spec: {
          ...state.spec,
          spaces: state.spec.spaces.filter(
            (_, i) => i !== action.payload
          ),
          adjacencies: filteredAdj,
          updatedAt: new Date().toISOString(),
        },
      };
    }

    case "ADD_ADJACENCY": {
      try {
        const rule = createAdjacencyRule(action.payload);
        return {
          ...state,
          dirty: true,
          spec: {
            ...state.spec,
            adjacencies: [...state.spec.adjacencies, rule],
            updatedAt: new Date().toISOString(),
          },
        };
      } catch {
        // Invalid rule (e.g. self-loop) — ignore silently.
        return state;
      }
    }

    case "UPDATE_ADJACENCY":
      return {
        ...state,
        dirty: true,
        spec: {
          ...state.spec,
          adjacencies: state.spec.adjacencies.map((a, i) =>
            i === action.payload.index ? action.payload.rule : a
          ),
          updatedAt: new Date().toISOString(),
        },
      };

    case "DELETE_ADJACENCY":
      return {
        ...state,
        dirty: true,
        spec: {
          ...state.spec,
          adjacencies: state.spec.adjacencies.filter(
            (_, i) => i !== action.payload
          ),
          updatedAt: new Date().toISOString(),
        },
      };

    case "UPDATE_CONSTRAINTS":
      return {
        ...state,
        dirty: true,
        spec: {
          ...state.spec,
          constraints: {
            ...state.spec.constraints,
            ...action.payload,
          },
          updatedAt: new Date().toISOString(),
        },
      };

    case "SET_ERRORS":
      return { ...state, errors: action.payload };

    case "MARK_SAVED":
      return { ...state, dirty: false };

    default:
      return state;
  }
}

// ---- Empty Spec Factory ----------------------------------------------

export function createEmptySpec(): ProgramSpec {
  const now = new Date().toISOString();
  return {
    id: `spec-${Date.now()}`,
    schemaVersion: PROGRAM_SPEC_SCHEMA_VERSION,
    name: "New Programme",
    description: "",
    spaces: [],
    adjacencies: [],
    constraints: {
      maxFloors: 6,
      floorHeight: 3.6,
      siteAreaM2: 5000,
      maxBuildingHeightM: 24,
      minCorridorWidthM: 1.5,
    },
    createdAt: now,
    updatedAt: now,
  };
}

// ---- Context ---------------------------------------------------------

interface EditorContextValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, {
    spec: createEmptySpec(),
    dirty: false,
    errors: [],
  });

  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error("useEditor must be used within <EditorProvider>");
  }
  return ctx;
}
