/** The editor's canvas nodes: the `+` points, and the step frames with their drag handle and "Edit for this project". */
import type { NodeProps } from "@xyflow/react";
import { GripVertical, Plus } from "lucide-react";
import { createContext, type DragEvent, useContext } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { FlowNode } from "../graph/flow";
import type { InsertPoint } from "../graph/model";
import { nodeTypes } from "../graph/nodes";
import { DRAG_ENTRY, DRAG_ITEM, type Item, itemLabel, menuItems } from "./items";

/** What the editor's nodes call back into. */
export type EditorApi = {
  /** The project's step names, for the menus between entries. */
  steps: string[];
  /** An item chosen at a `+` point, from its menu or dropped from the palette. */
  insert: (at: InsertPoint, item: Item) => void;
  /** An entry dragged by its frame header onto a `+` point between entries. */
  move: (from: number, at: InsertPoint) => void;
  /** "Edit for this project" on a global step's frame. */
  editCopy: (step: string) => void;
};

export const EditorContext = createContext<EditorApi>({ steps: [], insert: () => {}, move: () => {}, editCopy: () => {} });

/** The drop on a `+` point: an entry moved there, or a palette item inserted there. */
function onDrop(api: EditorApi, at: InsertPoint, e: DragEvent): void {
  e.preventDefault();
  const entry = e.dataTransfer.getData(DRAG_ENTRY);
  if (entry !== "") {
    api.move(Number(entry), at);
    return;
  }
  const raw = e.dataTransfer.getData(DRAG_ITEM);
  if (raw === "") return;
  try {
    api.insert(at, JSON.parse(raw) as Item);
  } catch {
    // Not one of ours.
  }
}

/** A `+` point: a menu of what fits there, and a drop target; `nodrag nopan` so React Flow leaves its events alone. */
export function InsertNode({ data }: NodeProps<FlowNode>) {
  const api = useContext(EditorContext);
  const node = data.box.node;
  if (node.kind !== "insert") return null;
  const items = menuItems(node.at, api.steps);
  return (
    <div
      className="nodrag nopan flex size-full items-center justify-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(api, node.at, e)}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Insert here"
              className="size-5 rounded-full border-[#C4C4CC] bg-white text-[#71717A] hover:border-[#6366F1] hover:text-[#6366F1]"
            />
          }
        >
          <Plus className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {items.map((item) => (
            <DropdownMenuItem key={item.type === "step" ? `step:${item.name}` : item.type} onClick={() => api.insert(node.at, item)}>
              {item.type === "step" ? <span className="font-mono">{item.name}</span> : itemLabel(item)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** A step frame of the editor: a drag handle to reorder the entry, and "Edit for this project" on a global step. */
export function EditFrameNode({ data, selected }: NodeProps<FlowNode>) {
  const api = useContext(EditorContext);
  const node = data.box.node;
  if (node.kind !== "step") return null;
  const index = Number(node.src?.yaml[1] ?? -1);
  const readOnly = node.error === undefined && !node.editable;
  return (
    <div className={cn("size-full rounded-[12px] border border-[#E4E4E7] bg-white/60", readOnly && "bg-[#FAFAFA]", selected && "border-[#6366F1]")}>
      <div className="flex h-9 items-center gap-1 overflow-hidden pr-2 pl-1 text-[12px] whitespace-nowrap">
        <span
          draggable
          role="button"
          tabIndex={-1}
          aria-label={`Drag ${node.id} onto a + between entries`}
          className="nodrag nopan flex size-6 shrink-0 cursor-grab items-center justify-center text-[#A1A1AA]"
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_ENTRY, String(index));
            e.dataTransfer.effectAllowed = "move";
          }}
        >
          <GripVertical className="size-3.5" />
        </span>
        <span className="font-semibold">{node.id}</span>
        <span className="min-w-0 grow truncate text-[#71717A]">· {data.box.caption}</span>
        {readOnly && (
          <Button variant="outline" size="xs" className="nodrag nopan" onClick={() => api.editCopy(node.step)}>
            Edit for this project
          </Button>
        )}
      </div>
      {node.error !== undefined && <p className="truncate px-4 font-mono text-[11px] text-destructive">{node.error}</p>}
    </div>
  );
}

/** The editor's node types: the graph's, its own step frame, and the `+` point. */
export const editorNodeTypes = { ...nodeTypes, frame: EditFrameNode, insert: InsertNode };
