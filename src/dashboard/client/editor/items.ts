/** The items the palette and the `+` menus offer, and where each may go. Pure: no DOM, no React. */
import type { InsertPoint } from "../graph/model";

/** A block or a step the user inserts. */
export type Item = { type: "agent" | "loop" | "when" | "foreach" | "gate" } | { type: "step"; name: string };

/** The blocks, in palette order, with their labels. */
export const BLOCKS = [
  { type: "agent", label: "Agent" },
  { type: "loop", label: "Loop" },
  { type: "when", label: "When" },
  { type: "foreach", label: "For each" },
  { type: "gate", label: "Gate" },
] as const;

/** The label of an item. */
export const itemLabel = (item: Item): string => (item.type === "step" ? item.name : (BLOCKS.find((b) => b.type === item.type)?.label ?? item.type));

/** Whether an item may go at a `+` point: a step or a gate between entries; inside a step, a construct that may nest there. */
export function fits(item: Item, at: InsertPoint): boolean {
  if (at.scope === "entries") return item.type === "step" || item.type === "gate";
  if (item.type === "step" || item.type === "gate") return false;
  if (item.type === "loop") return !at.inLoop;
  if (item.type === "foreach") return !at.inForeach;
  return true;
}

/** The items a `+` point's menu lists: the project's steps and Gate between entries, else the constructs that fit. */
export function menuItems(at: InsertPoint, steps: string[]): Item[] {
  if (at.scope === "entries") return [...steps.map((name): Item => ({ type: "step", name })), { type: "gate" }];
  return BLOCKS.filter((b) => b.type !== "gate").map((b): Item => ({ type: b.type })).filter((i) => fits(i, at));
}

/** The drag-and-drop types: a palette item, and a workflow entry dragged by its frame header. */
export const DRAG_ITEM = "application/x-theway-item";
export const DRAG_ENTRY = "application/x-theway-entry";

/** The item a drop carries, `null` when it carries none or an invalid one. */
export function itemOf(raw: string): Item | null {
  try {
    const v = JSON.parse(raw) as Item;
    if (v.type === "step") return typeof v.name === "string" ? v : null;
    return BLOCKS.some((b) => b.type === v.type) ? v : null;
  } catch {
    return null;
  }
}
