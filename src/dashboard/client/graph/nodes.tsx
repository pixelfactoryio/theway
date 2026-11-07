/** The custom React Flow nodes of the workflow graph: the cards, the step frames and the loop containers. */
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { ArrowUp, Diamond, Eye, FileText, GitCommitHorizontal, OctagonX, Play } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import type { Access } from "../../../core/schema";
import type { FlowNode } from "./flow";

/** The hidden `in` and `out` handles every card renders: React Flow draws no edge to a node without one. */
function Handles() {
  return (
    <>
      <Handle type="target" id="in" position={Position.Top} isConnectable={false} className="opacity-0" />
      <Handle type="source" id="out" position={Position.Bottom} isConnectable={false} className="opacity-0" />
    </>
  );
}

const SELECTED = "border-[1.5px] border-[#6366F1] ring-[3px] ring-[#E0E7FF]";

/** The icon tile of an agent by its access. */
const ACCESS: Record<Access, { tile: string; icon: ReactNode }> = {
  read: { tile: "bg-[#F4F4F5] text-[#52525B]", icon: <Eye className="size-3.5" /> },
  commit: { tile: "bg-[#FEF3C7] text-[#B45309]", icon: <GitCommitHorizontal className="size-3.5" /> },
  push: { tile: "bg-[#DBEAFE] text-[#1D4ED8]", icon: <ArrowUp className="size-3.5" /> },
  spec: { tile: "bg-[#EDE9FE] text-[#6D28D9]", icon: <FileText className="size-3.5" /> },
};

function Tile({ className, children }: { className: string; children: ReactNode }) {
  return <div className={cn("flex size-6 shrink-0 items-center justify-center rounded-[6px]", className)}>{children}</div>;
}

export function AgentNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.box.node;
  if (node.kind !== "agent") return null;
  const access = ACCESS[node.access];
  return (
    <div className={cn("flex size-full items-center gap-2.5 rounded-lg border border-[#E4E4E7] bg-white px-3", selected && SELECTED)}>
      <Handles />
      <Tile className={access.tile}>{access.icon}</Tile>
      <div className="min-w-0 grow">
        <div className="truncate text-[11px] leading-4 text-[#71717A]">
          Agent · {node.returns} · {node.access}
        </div>
        <div className="truncate text-[13px] leading-5 font-semibold">{node.label.slice(node.label.indexOf(":") + 1)}</div>
      </div>
      {node.model !== null && <div className="shrink-0 self-start pt-2 text-[11px] text-[#71717A]">{node.model}</div>}
    </div>
  );
}

export function StartNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.box.node;
  return (
    <div className={cn("flex size-full items-center justify-center gap-2 rounded-full border border-[#E4E4E7] bg-white px-3", selected && SELECTED)}>
      <Handles />
      <Play className="size-3.5 text-[#71717A]" />
      <span className="text-[12px] text-[#71717A]">Start ·</span>
      <span className="text-[12px] font-semibold">{node.kind === "start" ? node.input : ""}</span>
    </div>
  );
}

export function GateNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.box.node;
  if (node.kind !== "gate") return null;
  return (
    <div className={cn("flex size-full items-center gap-2.5 rounded-lg border border-[#FCD34D] bg-[#FFFBEB] px-3 text-[#92400E]", selected && SELECTED)}>
      <Handles />
      <Diamond className="size-4 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] leading-4 opacity-80">Gate</div>
        <div className="truncate text-[13px] leading-5 font-semibold">{node.question}</div>
      </div>
    </div>
  );
}

export function StopNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.box.node;
  if (node.kind !== "stop") return null;
  const fail = node.stop === "fail";
  return (
    <div
      className={cn(
        "flex size-full items-center gap-2 rounded-lg border px-3",
        fail ? "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]" : "border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]",
        selected && SELECTED,
      )}
    >
      <Handles />
      <OctagonX className="size-4 shrink-0" />
      <span className="truncate text-[13px] font-semibold">{node.text}</span>
    </div>
  );
}

export function FrameNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.box.node;
  return (
    <div className={cn("size-full rounded-[12px] border border-[#E4E4E7] bg-white/60", selected && "border-[#6366F1]")}>
      <div className="flex h-9 items-center gap-1 overflow-hidden px-4 text-[12px] whitespace-nowrap">
        <span className="font-semibold">{node.kind === "step" ? node.id : ""}</span>
        <span className="truncate text-[#71717A]">· {data.box.caption}</span>
      </div>
    </div>
  );
}

export function LoopNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div className={cn("relative size-full rounded-[12px] border border-dashed border-[#8B5CF6] bg-[#8B5CF6]/[0.03]", selected && "border-solid")}>
      <div className="absolute right-5 bottom-3 left-5 flex items-center gap-2 overflow-hidden text-[11px] whitespace-nowrap text-[#6D28D9]">
        <span className="rounded-full bg-[#EDE9FE] px-2 py-px font-medium">Loop</span>
        <span className="truncate">{data.box.caption}</span>
      </div>
    </div>
  );
}

export const nodeTypes = { agent: AgentNode, start: StartNode, gate: GateNode, stop: StopNode, frame: FrameNode, loop: LoopNode };
