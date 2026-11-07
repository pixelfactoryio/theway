/**
 * The layout of a workflow graph: every box at an absolute position, the edges between cards with their points, and
 * the condition pills on them. Deterministic and pure: no DOM, no React.
 */
import {
  type AnyNode,
  childrenOf,
  type EntryNode,
  type ForeachNode,
  type Graph,
  type GraphNode,
  type InsertNode,
  type LoopNode,
  type StepNode,
  type YamlPath,
} from "./model";

export type BoxKind = "start" | "frame" | "loop" | "foreach" | "agent" | "gate" | "stop" | "insert";
/** A drawn box: a card (`start`, `agent`, `gate`, `stop`), a container (`frame`, `loop`, `foreach`) or an editor `+` (`insert`). */
export type Box = {
  kind: BoxKind;
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The path of the nearest container box holding this one, `null` at the top. */
  parent: string | null;
  node: AnyNode;
  /** A step frame's header line, a loop's tag line; `null` for a card. */
  caption: string | null;
};
export type Point = { x: number; y: number };
/** An edge between two cards: `flow` follows the order of the nodes, `loop` goes back to the start of a loop. */
export type LayoutEdge = { source: string; target: string; kind: "flow" | "loop"; points: Point[] };
/** A condition pill: `x` and `y` its centre, `edge` the index of the edge it sits on. */
export type Pill = { x: number; y: number; w: number; text: string; edge: number };
export type Layout = { width: number; height: number; boxes: Box[]; edges: LayoutEdge[]; pills: Pill[] };

export const SIZE = { agent: { w: 240, h: 56 }, start: { w: 160, h: 40 }, gate: { w: 280, h: 50 }, stop: { w: 240, h: 44 } } as const;
export const GAP = 28;
export const PILL_GAP = 56;
export const PILL_H = 18;
export const PARALLEL_GAP = 20;
export const FORK_DROP = 14;
export const LOOP_PAD = { side: 20, top: 20, bottom: 44 } as const;
/** A `foreach` container's padding: a loop's, with room for its label at the top. */
export const FOREACH_PAD = { side: 20, top: 32, bottom: 44 } as const;
/** An editor `+` box, and its gap below the last child of a `do`. */
export const INSERT = 20;
export const INSERT_GAP = 14;
/** The room a `do` with `+` points takes after its last child: the gap and the box. */
const END = INSERT_GAP + INSERT;
export const FRAME_PAD = { side: 16, top: 36, bottom: 20 } as const;
export const ENTRY_GAP = 40;
export const START_GAP = 30;
export const MARGIN = 40;
export const RETURN_INSET = 6;

/** The width of a pill holding `text`: 16 + 7 per character, rounded up to an even number. */
export const pillWidth = (text: string): number => {
  const w = 16 + 7 * text.length;
  return w % 2 === 0 ? w : w + 1;
};

/** The text of a condition pill. */
export const pillText = (conditions: string[]): string => conditions.join(", ");

/** Whether a node sits after a pill: a `when` with `do`, or a stop. */
const pilled = (node: GraphNode): boolean => node.kind === "when" || node.kind === "stop";

/** A step frame's header line after its id. */
export function frameCaption(node: EntryNode): string {
  if (node.kind !== "step") return "";
  const params = Object.entries(node.params).map(([name, p]) => `${name} ${Array.isArray(p.value) ? p.value.join(", ") : String(p.value)}`);
  return [node.agents ? "through agents" : "inline", ...params].join(" · ");
}

/** A loop's tag line after its "Loop" pill. */
export const loopCaption = (node: LoopNode): string =>
  `max ${node.max} · until ${node.until.join(", ")} · ${node.exhausted === "fail" ? "else fail" : "then continue"}`;

/** A `foreach` container's label. */
export const foreachCaption = (node: ForeachNode): string => `For each ${node.value}${node.parallel ? " · parallel" : ""}`;

type Size = { w: number; h: number };

/**
 * The size of a sequence of nodes: the gap before each, a pill gap before a pilled one (the first included); with `+`
 * points (`ins`), the room of the last one below it.
 */
function seqSize(list: GraphNode[], ins = false): Size {
  let w = 0;
  let h = 0;
  list.forEach((node, i) => {
    const s = sizeOf(node, ins);
    h += (pilled(node) ? PILL_GAP : i === 0 ? 0 : GAP) + s.h;
    w = Math.max(w, s.w);
  });
  if (ins) h += list.length === 0 ? INSERT : END;
  return { w, h };
}

/** A container's width: its content's, at least an agent card's, and its padding. */
const containerW = (s: Size, side: number): number => Math.max(s.w, SIZE.agent.w) + 2 * side;

function sizeOf(node: AnyNode, ins = false): Size {
  switch (node.kind) {
    case "start":
      return { ...SIZE.start };
    case "agent":
      return { ...SIZE.agent };
    case "gate":
      return { ...SIZE.gate };
    case "stop":
      return { ...SIZE.stop };
    case "parallel": {
      const w = node.children.length * SIZE.agent.w + Math.max(0, node.children.length - 1) * PARALLEL_GAP;
      return { w, h: node.children.length === 0 ? 0 : SIZE.agent.h };
    }
    case "when":
      return seqSize(node.children, ins);
    case "loop": {
      const s = seqSize(node.children, ins);
      return { w: containerW(s, LOOP_PAD.side), h: LOOP_PAD.top + s.h + LOOP_PAD.bottom };
    }
    case "foreach": {
      const s = seqSize(node.children, ins);
      return { w: containerW(s, FOREACH_PAD.side), h: FOREACH_PAD.top + s.h + FOREACH_PAD.bottom };
    }
    case "step": {
      const s = seqSize(node.children, ins);
      return { w: containerW(s, FRAME_PAD.side), h: FRAME_PAD.top + s.h + FRAME_PAD.bottom };
    }
    case "insert":
      return { w: INSERT, h: INSERT };
  }
}

/** The `do` list a sequence of `+` points inserts into: its file and YAML path, its model path, and what it is inside. */
type SeqAt = { file: string; yaml: YamlPath; path: string; inLoop: boolean; inForeach: boolean };

/** A pending pill: placed before the edges exist, bound to the first flow edge into `target` once they do. */
type PendingPill = { x: number; y: number; w: number; text: string; target: string };

class Builder {
  boxes: Box[] = [];
  edges: LayoutEdge[] = [];
  pending: PendingPill[] = [];
  /** Every box by its path. */
  byPath = new Map<string, Box>();

  box(kind: BoxKind, node: AnyNode, cx: number, top: number, size: Size, parent: string | null, caption: string | null = null): Box {
    const b: Box = { kind, path: node.path, x: cx - size.w / 2, y: top, w: size.w, h: size.h, parent, node, caption };
    this.boxes.push(b);
    this.byPath.set(b.path, b);
    return b;
  }

  /** Places an editor `+` box centred on (`cx`, `cy`). */
  insert(path: string, at: InsertNode["at"], cx: number, cy: number, parent: string | null): void {
    const node: InsertNode = { kind: "insert", path, at };
    this.box("insert", node, cx, cy - INSERT / 2, { w: INSERT, h: INSERT }, parent);
  }

  /**
   * Places a sequence centred on `cx` from `top`, with a pill before each pilled node. With `at`, a `+` sits on each
   * edge between two nodes (right of its pill when it has one) and below the last one.
   */
  seq(list: GraphNode[], cx: number, top: number, parent: string | null, at?: SeqAt): void {
    const ins = at !== undefined;
    const point = (index: number, x: number, cy: number) => {
      if (at === undefined) return;
      const { file, yaml, inLoop, inForeach } = at;
      this.insert(`${at.path}+${index}`, { scope: "step", file, parent: yaml, index, inLoop, inForeach }, x, cy, parent);
    };
    let y = top;
    list.forEach((node, i) => {
      if (pilled(node)) {
        const text = pillText(node.kind === "when" || node.kind === "stop" ? node.conditions : []);
        const target = entryBoxes(node)[0];
        const px = entryX(node, cx, ins);
        // On the edge into the first card: when that card is the left one of a parallel group, the edge forks off the
        // axis 14px down, so the pill sits on its vertical run at that card's centre.
        if (target !== undefined) this.pending.push({ x: px, y: y + PILL_GAP / 2, w: pillWidth(text), text, target });
        if (i > 0) point(i, px + pillWidth(text) / 2 + 8 + INSERT / 2, y + PILL_GAP / 2);
        y += PILL_GAP;
      } else if (i > 0) {
        point(i, cx, y + GAP / 2);
        y += GAP;
      }
      this.place(node, cx, y, parent, at);
      y += sizeOf(node, ins).h;
    });
    if (at !== undefined) point(list.length, cx, list.length === 0 ? y + INSERT / 2 : y + INSERT_GAP + INSERT / 2);
  }

  place(node: AnyNode, cx: number, top: number, parent: string | null, at?: SeqAt): void {
    const ins = at !== undefined;
    const size = sizeOf(node, ins);
    switch (node.kind) {
      case "start":
        this.box("start", node, cx, top, size, parent);
        return;
      case "insert":
        return;
      case "agent":
        this.box("agent", node, cx, top, size, parent);
        return;
      case "gate":
        this.box("gate", node, cx, top, size, parent);
        return;
      case "stop":
        this.box("stop", node, cx, top, size, parent);
        return;
      case "parallel": {
        let x = cx - size.w / 2;
        for (const child of node.children) {
          this.box("agent", child, x + SIZE.agent.w / 2, top, SIZE.agent, parent);
          x += SIZE.agent.w + PARALLEL_GAP;
        }
        return;
      }
      case "when":
        this.seq(node.children, cx, top, parent, inner(at, node, ["do"], `${node.path}.do`));
        return;
      case "loop": {
        const b = this.box("loop", node, cx, top, size, parent, loopCaption(node));
        const sub = inner(at, node, ["loop", "do"], `${node.path}.loop.do`);
        this.seq(node.children, cx, top + LOOP_PAD.top, b.path, sub === undefined ? undefined : { ...sub, inLoop: true });
        return;
      }
      case "foreach": {
        const b = this.box("foreach", node, cx, top, size, parent, foreachCaption(node));
        const sub = inner(at, node, ["do"], `${node.path}.do`);
        this.seq(node.children, cx, top + FOREACH_PAD.top, b.path, sub === undefined ? undefined : { ...sub, inForeach: true });
        return;
      }
      case "step": {
        const b = this.box("frame", node, cx, top, size, parent, frameCaption(node));
        this.seq(node.children, cx, top + FRAME_PAD.top, b.path, at);
        return;
      }
    }
  }

  get(path: string): Box {
    return this.byPath.get(path) as Box;
  }

  /** One flow edge from each exit card of `a` to each entry card of `b`. */
  connect(a: AnyNode, b: AnyNode): void {
    for (const s of exitBoxes(a)) {
      for (const t of entryBoxes(b)) {
        const src = this.get(s);
        const dst = this.get(t);
        const sx = src.x + src.w / 2;
        const sy = src.y + src.h;
        const tx = dst.x + dst.w / 2;
        const ty = dst.y;
        const points =
          sx === tx
            ? [
                { x: sx, y: sy },
                { x: tx, y: ty },
              ]
            : [
                { x: sx, y: sy },
                { x: sx, y: sy + FORK_DROP },
                { x: tx, y: sy + FORK_DROP },
                { x: tx, y: ty },
              ];
        this.edges.push({ source: s, target: t, kind: "flow", points });
      }
    }
  }

  /** The flow edges between consecutive nodes of `list`, inside each, and each loop's return edge. */
  wire(list: AnyNode[]): void {
    list.forEach((node, i) => {
      if (i > 0) this.connect(list[i - 1] as AnyNode, node);
      this.wire(node.kind === "parallel" ? [] : childrenOf(node));
      if (node.kind === "loop") this.loopEdge(node);
    });
  }

  /** A loop's return edge: from its last card to its first (the rightmost card when it starts with a parallel group). */
  loopEdge(node: LoopNode): void {
    const cards = cardsIn(node);
    const first = node.children[0];
    const target = first?.kind === "parallel" ? first.children[first.children.length - 1]?.path : cards[0];
    const source = cards[cards.length - 1];
    if (source === undefined || target === undefined) return;
    const container = this.get(node.path);
    const src = this.get(source);
    const dst = this.get(target);
    const x = container.x + container.w - RETURN_INSET;
    const sy = src.y + src.h / 2;
    const ty = dst.y + dst.h / 2;
    this.edges.push({
      source,
      target,
      kind: "loop",
      points: [
        { x: src.x + src.w, y: sy },
        { x, y: sy },
        { x, y: ty },
        { x: dst.x + dst.w, y: ty },
      ],
    });
  }
}

/** The `+` points of a container's `do`: its file and YAML path under the enclosing ones, `undefined` without them. */
function inner(at: SeqAt | undefined, node: GraphNode, field: YamlPath, path: string): SeqAt | undefined {
  if (at === undefined || node.src === undefined) return undefined;
  return { ...at, yaml: [...node.src.yaml, ...field], path };
}

/** Whether a node holds a sequence of nodes. */
const isContainer = (node: AnyNode): boolean => node.kind === "step" || node.kind === "loop" || node.kind === "when" || node.kind === "foreach";

/** The card paths inside a node, in document order. */
function cardsIn(node: AnyNode): string[] {
  if (node.kind === "start" || node.kind === "agent" || node.kind === "gate" || node.kind === "stop") return [node.path];
  if (node.kind === "insert") return [];
  return childrenOf(node).flatMap(cardsIn);
}

/** The centre x of the first card an edge into `node`, placed centred on `cx`, ends on. */
function entryX(node: AnyNode, cx: number, ins = false): number {
  if (node.kind === "parallel") return node.children.length === 0 ? cx : cx - sizeOf(node, ins).w / 2 + SIZE.agent.w / 2;
  if (isContainer(node)) {
    const first = childrenOf(node)[0];
    return first === undefined ? cx : entryX(first, cx, ins);
  }
  return cx;
}

/** The cards an edge into `node` ends on. */
export function entryBoxes(node: AnyNode): string[] {
  if (node.kind === "parallel") return node.children.map((c) => c.path);
  if (node.kind === "step" || node.kind === "loop" || node.kind === "when" || node.kind === "foreach") {
    const first = node.children[0];
    return first === undefined ? [] : entryBoxes(first);
  }
  return [node.path];
}

/** The cards an edge out of `node` starts from. */
export function exitBoxes(node: AnyNode): string[] {
  if (node.kind === "parallel") return node.children.map((c) => c.path);
  if (node.kind === "step" || node.kind === "loop" || node.kind === "when" || node.kind === "foreach") {
    const last = node.children[node.children.length - 1];
    return last === undefined ? [] : exitBoxes(last);
  }
  return [node.path];
}

/** The `+` points of an editable step frame's `do`, `undefined` when it takes none. */
function frameAt(entry: EntryNode, inserts: boolean): SeqAt | undefined {
  if (!inserts || entry.kind !== "step" || !entry.editable) return undefined;
  return { file: `steps/${(entry as StepNode).step}`, yaml: ["do"], path: `${entry.path}.do`, inLoop: false, inForeach: false };
}

/**
 * The layout of a graph model. With `inserts` (the editor's source model), a `+` point sits between the start and
 * each workflow entry and after the last one, and on the sequence edges and at the end of every `do` of an editable
 * step frame.
 */
export function layout(graph: Graph, opts: { inserts?: boolean } = {}): Layout {
  const inserts = opts.inserts === true;
  const b = new Builder();
  const width = Math.max(SIZE.start.w, ...graph.entries.map((e) => sizeOf(e, frameAt(e, inserts) !== undefined).w));
  const cx = MARGIN + width / 2;
  const entryPoint = (index: number, cy: number) => {
    if (inserts) b.insert(`steps+${index}`, { scope: "entries", index }, cx, cy, null);
  };
  let y = MARGIN;
  b.place(graph.start, cx, y, null);
  y += SIZE.start.h + START_GAP;
  entryPoint(0, y - START_GAP / 2);
  graph.entries.forEach((entry, i) => {
    if (i > 0) {
      entryPoint(i, y + ENTRY_GAP / 2);
      y += ENTRY_GAP;
    }
    const at = frameAt(entry, inserts);
    b.place(entry, cx, y, null, at);
    y += sizeOf(entry, at !== undefined).h;
  });
  if (inserts) {
    entryPoint(graph.entries.length, y + INSERT_GAP + INSERT / 2);
    y += END;
  }
  b.wire([graph.start, ...graph.entries]);
  const pills = b.pending.map((p): Pill => {
    const edge = b.edges.findIndex((e) => e.kind === "flow" && e.target === p.target);
    return { x: p.x, y: p.y, w: p.w, text: p.text, edge };
  });
  return { width: width + 2 * MARGIN, height: y + MARGIN, boxes: b.boxes, edges: b.edges, pills };
}
