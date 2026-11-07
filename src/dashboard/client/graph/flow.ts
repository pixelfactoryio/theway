/** The layout as React Flow nodes and edges. Pure: it imports only types from React Flow. */
import type { Edge, Node } from "@xyflow/react";
import type { Box, BoxKind, Layout, Pill, Point } from "./layout";

export type BoxData = { box: Box };
export type FlowNode = Node<BoxData, BoxKind>;
export type RoutedData = {
  points: Point[];
  kind: "flow" | "loop";
  /** The text of the pill on the edge, if any. */
  pill?: string;
  /** Every pill on the edge, at its absolute position. */
  pills: Pill[];
};
export type FlowEdge = Edge<RoutedData, "routed">;

/**
 * The React Flow nodes and edges of a layout: one node per box, a box inside a container placed relative to it, every
 * parent before its children; one `routed` edge per layout edge, drawn through the layout's points.
 */
export function toFlow(layout: Layout): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const byPath = new Map(layout.boxes.map((b) => [b.path, b]));
  const nodes = layout.boxes.map((box): FlowNode => {
    const parent = box.parent === null ? undefined : byPath.get(box.parent);
    const node: FlowNode = {
      id: box.path,
      type: box.kind,
      position: parent === undefined ? { x: box.x, y: box.y } : { x: box.x - parent.x, y: box.y - parent.y },
      width: box.w,
      height: box.h,
      draggable: false,
      data: { box },
    };
    // A `+` point is a button, never a selection.
    if (box.kind === "insert") node.selectable = false;
    if (parent !== undefined) node.parentId = parent.path;
    return node;
  });
  const edges = layout.edges.map((e, i): FlowEdge => {
    const pills = layout.pills.filter((p) => p.edge === i);
    const data: RoutedData = { points: e.points, kind: e.kind, pills };
    if (pills[0] !== undefined) data.pill = pills[0].text;
    return { id: `e${i}`, type: "routed", source: e.source, target: e.target, sourceHandle: "out", targetHandle: "in", data };
  });
  return { nodes, edges };
}
