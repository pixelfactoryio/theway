/** The workflow graph canvas: React Flow runs pan, zoom, fit and selection; the layout gives every position. */
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  type NodeChange,
  Panel,
  ReactFlow,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { type ReactElement, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FlowEdge, FlowNode } from "./flow";
import { nodeTypes } from "./nodes";

const FLOW = { stroke: "#C4C4CC", strokeWidth: 1.5 };
const LOOP = { stroke: "#8B5CF6", strokeWidth: 1.5, strokeDasharray: "4 4" };

/** An edge drawn through the layout's points with straight segments, an arrowhead and its pills. */
function RoutedEdge({ id, data }: EdgeProps<FlowEdge>) {
  if (data === undefined) return null;
  const path = data.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const loop = data.kind === "loop";
  const marker = `arrow-${id}`;
  return (
    <>
      <defs>
        <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={loop ? "#8B5CF6" : "#A1A1AA"} />
        </marker>
      </defs>
      <BaseEdge id={id} path={path} markerEnd={`url(#${marker})`} style={loop ? LOOP : FLOW} />
      {data.pills.length > 0 && (
        <EdgeLabelRenderer>
          {data.pills.map((p, i) => (
            <div
              key={i}
              className="nodrag nopan absolute flex h-[18px] items-center justify-center rounded-full border border-[#E4E4E7] bg-white text-[11px] leading-none text-[#52525B]"
              style={{ width: p.w, transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` }}
            >
              {p.text}
            </div>
          ))}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { routed: RoutedEdge };

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The zoom toolbar: zoom out, the zoom as a percentage, zoom in, then fit. */
function ZoomBar() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  return (
    <Panel position="bottom-center">
      <div className="flex items-center gap-0.5 rounded-lg border bg-white p-1 shadow-sm">
        <ToolButton label="Zoom out" onClick={() => void zoomOut()}>
          <ZoomOut />
        </ToolButton>
        <span className="w-12 text-center text-[12px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <ToolButton label="Zoom in" onClick={() => void zoomIn()}>
          <ZoomIn />
        </ToolButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolButton label="Fit" onClick={() => void fitView({ padding: 0.1 })}>
          <Maximize />
        </ToolButton>
      </div>
    </Panel>
  );
}

/**
 * The canvas of a laid-out workflow. `onSelect` gets the path of the node a click, or Enter on a focused node,
 * selects, and `null` on a click on the pane; `selected` is the path the inspector shows.
 */
export function Canvas({
  nodes: initial,
  edges,
  selected,
  onSelect,
}: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selected: string | null;
  onSelect: (path: string | null) => void;
}) {
  const [nodes, setNodes] = useState(initial);
  // The inspector closed from outside the canvas (Esc or its close button) clears the canvas selection too.
  const [shown, setShown] = useState(selected);
  if (shown !== selected) {
    setShown(selected);
    if (selected === null) setNodes((ns) => ns.map((n) => (n.selected === true ? { ...n, selected: false } : n)));
  }
  return (
    <ReactFlow<FlowNode, FlowEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={(changes: NodeChange<FlowNode>[]) => setNodes((ns) => applyNodeChanges(changes, ns))}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      onSelectionChange={({ nodes: chosen }) => {
        if (chosen.length === 1 && chosen[0] !== undefined) onSelect(chosen[0].id);
      }}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      elementsSelectable
      deleteKeyCode={null}
      fitView
      fitViewOptions={{ padding: 0.1 }}
      minZoom={0.5}
      maxZoom={2}
      zoomOnScroll={false}
      panOnScroll
      zoomOnDoubleClick={false}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#DCDCE0" bgColor="#FAFAFA" />
      <ZoomBar />
    </ReactFlow>
  );
}
