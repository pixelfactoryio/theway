/** Edit mode's centre for a workflow: its steps as written, on a timeline whose cards are dragged by a handle, with a `+` on the line. */
import { cn } from "cn";
import { GripVertical, Plus } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { Sortable, SortableItem, SortableItemHandle } from "@/components/reui/sortable";
import { Timeline, TimelineContent, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator } from "@/components/reui/timeline";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PromptContext } from "./context";
import type { StepSource } from "./source";
import { promptName } from "./source";
import { Card, indicator, LINE, StepBadge } from "./WorkflowView";

/** The `+` button on the timeline's line and its menu: every step prompt, by name with its description. */
function AddStep({ ctx, onPick, className }: { ctx: PromptContext; onPick: (name: string) => void; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon-xs" aria-label="Add a step" className={cn("rounded-full bg-card", className)}>
            <Plus />
          </Button>
        }
      />
      <DropdownMenuContent className="w-[360px]">
        {ctx.steps.length === 0 ? (
          <div className="px-2 py-1.5 text-muted-foreground">No step prompt</div>
        ) : (
          ctx.steps.map(({ item }) => (
            <DropdownMenuItem key={`${item.scope}/${item.name}`} onClick={() => onPick(item.name)} className="flex-col items-start gap-0">
              <span className="font-mono text-[13px]">{item.name}</span>
              {item.description !== null && <span className="text-[12px] text-muted-foreground">{item.description}</span>}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A step's compact card: its prompt, its copies, its on fail, and `agent · <model>` or "your session"; then its matrix values. */
function StepCard({ step, runsOn, ctx, selected, tied }: { step: StepSource; runsOn: string; ctx: PromptContext; selected: boolean; tied: boolean }) {
  const tries = Number(step.tries ?? 1);
  const model = step.model ?? ctx.info(step.name)?.header?.model ?? null;
  return (
    <Card className={cn("flex flex-col gap-1.5 py-2.5 pl-2", selected ? "ring-2 ring-primary" : tied && "ring-2 ring-destructive")}>
      <div className="flex flex-wrap items-center gap-2">
        <SortableItemHandle
          className="flex items-center text-muted-foreground"
          aria-label="Drag to move"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-4" />
        </SortableItemHandle>
        <span className="font-mono text-[14px] font-medium">{step.name ?? (step.uses || "no prompt")}</span>
        {step.matrix !== null && <Badge variant="primary-light">{step.matrix.values.length} copies at once</Badge>}
        {step.onFail !== null && (
          <Badge variant="warning-light">
            on fail: {step.onFail.name ?? step.onFail.uses} · {Number.isFinite(tries) ? tries : step.tries} {tries > 1 ? "tries" : "try"}
          </Badge>
        )}
        <span className="ml-auto">
          <StepBadge runsOn={step.runsOn ?? runsOn} model={model} />
        </span>
      </div>
      {step.matrix !== null && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          <span className="font-mono text-[12px] text-muted-foreground">{step.matrix.key}</span>
          {step.matrix.values.map((v, i) => (
            <Badge key={`${i}:${v}`} variant="secondary">
              {promptName(v) ?? v}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}

/** What the workflow editor's centre reads and does. */
export type WorkflowEditing = {
  steps: StepSource[];
  runsOn: string;
  ctx: PromptContext;
  selected: number | null;
  tied: ReadonlySet<number>;
  select: (index: number | null) => void;
  insert: (index: number, name: string) => void;
  move: (from: number, to: number) => void;
};

/** The ID of the sortable item of step `i`. */
const idOf = (i: number) => `step-${i}`;

/** The workflow's steps on a timeline: each card selectable and dragged by its handle, a `+` between two cards and after the last. */
export function WorkflowEdit({ steps, runsOn, ctx, selected, tied, select, insert, move }: WorkflowEditing) {
  const ids = steps.map((_, i) => idOf(i));
  return (
    <div className="flex w-full max-w-[640px] flex-col">
      <Timeline value={0} className="w-full pl-1">
        <Sortable
          value={ids}
          getItemValue={(id) => id}
          strategy="vertical"
          // A drop is one move from the old index to the new one; the draft's text then orders the cards.
          onMove={({ activeIndex, overIndex }) => move(activeIndex, overIndex)}
          onValueChange={() => {}}
        >
          {steps.map((step, i) => (
            <SortableItem key={idOf(i)} value={idOf(i)} render={<TimelineItem step={i + 1} />}>
              <TimelineHeader>
                <TimelineSeparator className={LINE} />
                <TimelineIndicator className={indicator(selected === i)}>{i + 1}</TimelineIndicator>
              </TimelineHeader>
              <TimelineContent className="text-foreground">
                {/* A div, not a button: the card holds the drag handle. */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === i}
                  aria-label={`Step ${i + 1}: ${step.name ?? step.uses}`}
                  className="cursor-pointer rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={(e) => {
                    e.stopPropagation();
                    select(i);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      select(i);
                    }
                  }}
                >
                  <StepCard step={step} runsOn={runsOn} ctx={ctx} selected={selected === i} tied={tied.has(i)} />
                </div>
              </TimelineContent>
              {i < steps.length - 1 && (
                // Shown while the gap is hovered, without Tailwind's `(hover: hover)` query, or while the + has focus.
                <div className="group/gap absolute bottom-0 left-[-2.25rem] flex h-6 w-[calc(100%+2.25rem)] items-center">
                  <AddStep
                    ctx={ctx}
                    onPick={(name) => insert(i + 1, name)}
                    className="opacity-0 focus-visible:opacity-100 aria-expanded:opacity-100 [.group\/gap:hover_&]:opacity-100"
                  />
                </div>
              )}
            </SortableItem>
          ))}
        </Sortable>
      </Timeline>
      <div className="mt-2 flex items-center">
        <AddStep ctx={ctx} onPick={(name) => insert(steps.length, name)} />
      </div>
    </div>
  );
}
