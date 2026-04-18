// ============================================================
// ProgramSpecEditor — Tab B: Adjacency Diagram
//
// Bubble diagram using React Flow (@xyflow/react).
// - Nodes = space types (circle, sized by total area, colored by category)
// - Edges = adjacency rules (colored by type)
// - Drag-connect to create rules
// - Click edge to select → side panel for weight/reason/delete
// ============================================================

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type EdgeProps,
  Position,
  BaseEdge,
  getBezierPath,
  useReactFlow,
  applyNodeChanges,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEditor } from "./EditorContext";
import {
  type SpaceCategory,
  type AdjacencyType,
  AdjacencyTypeValues,
  createAdjacencyRule,
} from "@/types/program";

// ---- Constants -------------------------------------------------------

const CATEGORY_COLORS: Record<SpaceCategory, string> = {
  academic: "#4A90D9",
  art: "#D4A843",
  science: "#50B87A",
  public: "#9B6FCF",
  sport: "#E8734A",
  support: "#8B8B8B",
  residential: "#D96BA0",
  admin: "#5BBCBF",
};

const EDGE_COLORS: Record<AdjacencyType, string> = {
  must_adjacent: "#22C55E",
  should_adjacent: "#3B82F6",
  prefer_nearby: "#9CA3AF",
  must_separate: "#EF4444",
};

const EDGE_LABELS: Record<AdjacencyType, string> = {
  must_adjacent: "Must Adjacent",
  should_adjacent: "Should Adjacent",
  prefer_nearby: "Prefer Nearby",
  must_separate: "Must Separate",
};

// ---- Custom Node -----------------------------------------------------

type SpaceNodeData = {
  label: string;
  category: SpaceCategory;
  totalArea: number;
  colorHex?: string;
};

type SpaceNode = Node<SpaceNodeData>;

function SpaceNodeComponent({ data }: NodeProps<SpaceNode>) {
  const size = Math.max(40, Math.min(120, Math.sqrt(data.totalArea) * 2));
  const color = data.colorHex || CATEGORY_COLORS[data.category];

  return (
    <div
      className="flex items-center justify-center rounded-full border-2 shadow-md"
      style={{
        width: size,
        height: size,
        background: `${color}20`,
        borderColor: color,
        cursor: "grab",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <span
        className="text-center leading-tight font-medium"
        style={{
          fontSize: Math.max(8, Math.min(11, size / 8)),
          color: "var(--foreground)",
          maxWidth: size - 8,
          overflow: "hidden",
          textOverflow: "ellipsis",
          wordBreak: "break-word",
        }}
      >
        {data.label}
      </span>
    </div>
  );
}

const nodeTypes = { spaceNode: SpaceNodeComponent };

// ---- Custom Edge (coloured by type) ----------------------------------

type AdjEdgeData = {
  adjType: AdjacencyType;
  adjIndex: number;
};

type AdjEdge = Edge<AdjEdgeData>;

function AdjEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<AdjEdge>) {
  const adjType = data?.adjType ?? "should_adjacent";
  const color = EDGE_COLORS[adjType];
  const isDashed = adjType === "must_separate";

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: color,
        strokeWidth: selected ? 3 : 2,
        strokeDasharray: isDashed ? "6 3" : undefined,
        filter: selected ? `drop-shadow(0 0 4px ${color})` : undefined,
      }}
    />
  );
}

const edgeTypes = { adjEdge: AdjEdgeComponent };

// ---- Layout Helper ---------------------------------------------------

function autoLayout(spaces: { id: string; totalArea: number }[]): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const count = spaces.length;
  if (count === 0) return positions;

  // Arrange in a circle
  const radius = Math.max(200, count * 30);
  const cx = 400;
  const cy = 400;

  spaces.forEach((s, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    positions[s.id] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  return positions;
}

// ---- Inner Component (needs ReactFlowProvider) -----------------------

function AdjacencyDiagramInner() {
  const { state, dispatch } = useEditor();
  const { spaces, adjacencies } = state.spec;
  const { fitView } = useReactFlow();

  // Selected edge index for side panel
  const [selectedEdgeIdx, setSelectedEdgeIdx] = useState<number | null>(null);

  // Node positions (persisted in component state)
  const [nodePositions, setNodePositions] = useState<
    Record<string, { x: number; y: number }>
  >(() => {
    const items = spaces.map(s => ({
      id: s.id,
      totalArea: s.quantity * s.areaPerUnit,
    }));
    return autoLayout(items);
  });

  // Re-layout when spaces change significantly
  useEffect(() => {
    const currentIds = new Set(Object.keys(nodePositions));
    const specIds = new Set(spaces.map(s => s.id));
    const needsRelayout =
      spaces.some(s => !currentIds.has(s.id)) ||
      Array.from(currentIds).some(id => !specIds.has(id));

    if (needsRelayout) {
      const items = spaces.map(s => ({
        id: s.id,
        totalArea: s.quantity * s.areaPerUnit,
      }));
      const newPositions = autoLayout(items);
      // Keep existing positions for nodes that still exist
      const merged: Record<string, { x: number; y: number }> = {};
      for (const s of spaces) {
        merged[s.id] = nodePositions[s.id] ?? newPositions[s.id];
      }
      setNodePositions(merged);
      setTimeout(() => fitView({ padding: 0.2 }), 100);
    }
  }, [spaces.map(s => s.id).join(",")]);

  // Build React Flow nodes
  const nodes: SpaceNode[] = useMemo(
    () =>
      spaces.map(s => ({
        id: s.id,
        type: "spaceNode",
        position: nodePositions[s.id] ?? { x: 0, y: 0 },
        data: {
          label: s.name,
          category: s.category,
          totalArea: s.quantity * s.areaPerUnit,
          colorHex: s.colorHex,
        },
      })),
    [spaces, nodePositions]
  );

  // Build React Flow edges
  const edges: AdjEdge[] = useMemo(
    () =>
      adjacencies.map((a, i) => ({
        id: a.id,
        source: a.fromSpaceId,
        target: a.toSpaceId,
        type: "adjEdge",
        data: { adjType: a.type, adjIndex: i },
        selected: selectedEdgeIdx === i,
      })),
    [adjacencies, selectedEdgeIdx]
  );

  // Handle node drag
  const onNodesChange = useCallback(
    (changes: NodeChange<SpaceNode>[]) => {
      // Apply position changes to our state
      for (const change of changes) {
        if (change.type === "position" && change.position && change.id) {
          setNodePositions(prev => ({
            ...prev,
            [change.id]: change.position!,
          }));
        }
      }
    },
    []
  );

  // Handle new connection (drag-connect)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;

      // Check if edge already exists
      const exists = adjacencies.some(
        a =>
          (a.fromSpaceId === connection.source &&
            a.toSpaceId === connection.target) ||
          (a.fromSpaceId === connection.target &&
            a.toSpaceId === connection.source)
      );
      if (exists) return;

      const id = `adj-${connection.source}-${connection.target}`.slice(0, 40);
      dispatch({
        type: "ADD_ADJACENCY",
        payload: {
          id,
          fromSpaceId: connection.source,
          toSpaceId: connection.target,
          type: "should_adjacent",
          weight: 0.5,
          reason: "",
        },
      });
    },
    [adjacencies, dispatch]
  );

  // Handle edge click
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const data = edge.data as AdjEdgeData | undefined;
      if (data) {
        setSelectedEdgeIdx(data.adjIndex);
      }
    },
    []
  );

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedEdgeIdx(null);
  }, []);

  // Selected adjacency for side panel
  const selectedAdj =
    selectedEdgeIdx !== null ? adjacencies[selectedEdgeIdx] : null;

  return (
    <div className="flex gap-4" style={{ height: 600 }}>
      {/* Diagram */}
      <div
        className="flex-1 sa-card relative"
        style={{ padding: 0, overflow: "hidden" }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          style={{ background: "var(--background)" }}
        >
          <Background color="var(--border)" gap={20} />
          <Controls
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
            }}
          />
          <MiniMap
            nodeColor={node => {
              const data = node.data as SpaceNodeData;
              return data.colorHex || CATEGORY_COLORS[data.category];
            }}
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
            }}
          />
        </ReactFlow>

        {/* Legend */}
        <div
          className="absolute bottom-2 left-2 sa-panel flex flex-wrap gap-3"
          style={{ fontSize: 10, padding: "6px 10px" }}
        >
          {AdjacencyTypeValues.map(t => (
            <span key={t} className="flex items-center gap-1">
              <span
                className="inline-block w-4 h-0.5"
                style={{
                  background: EDGE_COLORS[t],
                  borderTop:
                    t === "must_separate"
                      ? `2px dashed ${EDGE_COLORS[t]}`
                      : `2px solid ${EDGE_COLORS[t]}`,
                }}
              />
              {EDGE_LABELS[t]}
            </span>
          ))}
        </div>
      </div>

      {/* Side Panel */}
      <div className="w-64 flex-shrink-0 space-y-3">
        <div className="sa-card space-y-3">
          <h4
            className="text-xs font-semibold"
            style={{ color: "var(--muted-foreground)" }}
          >
            {selectedAdj ? "Selected Rule" : "Adjacency Rules"}
          </h4>

          {selectedAdj ? (
            <div className="space-y-3">
              {/* From / To */}
              <div className="space-y-1">
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  From
                </span>
                <div className="sa-tag text-xs">{selectedAdj.fromSpaceId}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  To
                </span>
                <div className="sa-tag text-xs">{selectedAdj.toSpaceId}</div>
              </div>

              {/* Type */}
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
                  Type
                </label>
                <select
                  className="sa-input w-full"
                  style={{ fontSize: 12 }}
                  value={selectedAdj.type}
                  onChange={e => {
                    dispatch({
                      type: "UPDATE_ADJACENCY",
                      payload: {
                        index: selectedEdgeIdx!,
                        rule: {
                          ...selectedAdj,
                          type: e.target.value as AdjacencyType,
                        },
                      },
                    });
                  }}
                >
                  {AdjacencyTypeValues.map(t => (
                    <option key={t} value={t}>
                      {EDGE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Weight */}
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
                  Weight: {selectedAdj.weight.toFixed(2)}
                </label>
                <input
                  type="range"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={selectedAdj.weight}
                  onChange={e => {
                    dispatch({
                      type: "UPDATE_ADJACENCY",
                      payload: {
                        index: selectedEdgeIdx!,
                        rule: {
                          ...selectedAdj,
                          weight: parseFloat(e.target.value),
                        },
                      },
                    });
                  }}
                  className="w-full"
                  style={{ accentColor: "var(--primary)" }}
                />
              </div>

              {/* Reason */}
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
                  Reason
                </label>
                <textarea
                  className="sa-input w-full"
                  style={{ fontSize: 12, minHeight: 60 }}
                  value={selectedAdj.reason ?? ""}
                  onChange={e => {
                    dispatch({
                      type: "UPDATE_ADJACENCY",
                      payload: {
                        index: selectedEdgeIdx!,
                        rule: {
                          ...selectedAdj,
                          reason: e.target.value || undefined,
                        },
                      },
                    });
                  }}
                />
              </div>

              {/* Delete */}
              <button
                className="sa-btn sa-btn-danger w-full"
                style={{ fontSize: 12 }}
                onClick={() => {
                  dispatch({
                    type: "DELETE_ADJACENCY",
                    payload: selectedEdgeIdx!,
                  });
                  setSelectedEdgeIdx(null);
                }}
              >
                Delete Rule
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p
                className="text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                {adjacencies.length} rules defined.
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                Drag from one node to another to create a new rule.
                Click an edge to edit.
              </p>

              {/* Rules list */}
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {adjacencies.map((a, i) => (
                  <button
                    key={a.id}
                    className="sa-data-row w-full text-left"
                    style={{ fontSize: 11 }}
                    onClick={() => setSelectedEdgeIdx(i)}
                  >
                    <span
                      className="truncate"
                      style={{ maxWidth: 140 }}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1"
                        style={{ background: EDGE_COLORS[a.type] }}
                      />
                      {a.fromSpaceId}
                    </span>
                    <span style={{ color: "var(--muted-foreground)" }}>
                      ↔
                    </span>
                    <span
                      className="truncate"
                      style={{ maxWidth: 140 }}
                    >
                      {a.toSpaceId}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Exported Wrapper ------------------------------------------------

export default function AdjacencyDiagram() {
  return (
    <ReactFlowProvider>
      <AdjacencyDiagramInner />
    </ReactFlowProvider>
  );
}
