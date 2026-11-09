/** A workflow in edit mode: its entries as written, a `+` before, between and after them, and a click that selects. */
import { cn } from "cn";
import { Fragment, useRef, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { FileItem } from "../../types";
import { Input } from "./fields";
import { outline, type Selection } from "./selection";
import type { EntrySource } from "./source";
import { PlusButton } from "./StepView";

/** A value of an entry as written: a list as `[a, b]`. */
export const entryValue = (v: unknown): string => (Array.isArray(v) ? `[${v.map(String).join(", ")}]` : String(v ?? ""));

/** What a step entry writes: `agents: <value>` when set, then each param, joined with ", ". */
const written = (e: Extract<EntrySource, { kind: "step" }>): string =>
  [...(e.agents === null ? [] : [`agents: ${e.agents}`]), ...Object.entries(e.params).map(([k, v]) => `${k}: ${entryValue(v)}`)].join(", ");

/** What a `+` of the workflow inserts: a step by name, or a gate. */
export type NewEntryChoice = { step: string } | { gate: true };

/** The `+` menu: a filter, Gate, each usable step with its description, and New step. */
function EntryPlus({ steps, onChoose, onNewStep }: { steps: FileItem[]; onChoose: (c: NewEntryChoice) => void; onNewStep: () => void }) {
  const [filter, setFilter] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const q = filter.trim().toLowerCase();
  const match = (name: string) => q === "" || name.toLowerCase().includes(q);
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setFilter("");
      }}
      onOpenChangeComplete={(open) => {
        if (open) input.current?.focus();
      }}
    >
      <DropdownMenuTrigger render={<PlusButton aria-label="Add" />} />
      <DropdownMenuContent className="w-[400px]">
        <div className="p-1">
          <Input
            ref={input}
            value={filter}
            placeholder="Filter"
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape" && e.key !== "ArrowDown" && e.key !== "ArrowUp") e.stopPropagation();
            }}
          />
        </div>
        {match("gate") && (
          <DropdownMenuItem onClick={() => onChoose({ gate: true })} className="flex-col items-start gap-0">
            <span>Gate</span>
            <span className="text-[12px] text-muted-foreground">Ask a question, and stop unless the answer is Continue</span>
          </DropdownMenuItem>
        )}
        {steps
          .filter((s) => match(s.name))
          .map((s) => (
            <DropdownMenuItem key={`${s.scope}/${s.name}`} onClick={() => onChoose({ step: s.name })} className="flex-col items-start gap-0">
              <span className="font-mono text-[13px]">{s.name}</span>
              {s.description !== null && <span className="text-[12px] text-muted-foreground">{s.description}</span>}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onNewStep}>New step</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The workflow's entries in edit mode; `tied` holds the indices of the entries an error line ties to. */
export function WorkflowEdit({
  entries,
  steps,
  selected,
  tied,
  select,
  insert,
  onNewStep,
}: {
  entries: EntrySource[];
  steps: FileItem[];
  selected: Selection;
  tied: ReadonlySet<number>;
  select: (s: Selection) => void;
  insert: (index: number, c: NewEntryChoice) => void;
  onNewStep: () => void;
}) {
  const plus = (index: number) => <EntryPlus steps={steps} onChoose={(c) => insert(index, c)} onNewStep={onNewStep} />;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      {plus(0)}
      {entries.map((e) => {
        const ring = outline(selected !== null && "entry" in selected && selected.entry === e.index, tied.has(e.index));
        return (
          <Fragment key={`${e.index}:${e.kind === "gate" ? "gate" : e.id}`}>
            <div
              className={cn("w-full max-w-[400px] cursor-pointer rounded-md border bg-background px-3 py-2.5", ring)}
              onClick={(ev) => {
                ev.stopPropagation();
                select({ entry: e.index });
              }}
            >
              {e.kind === "gate" ? (
                <div className="flex items-baseline justify-between gap-3">
                  <span>Gate</span>
                  <span className="text-muted-foreground">{e.question}</span>
                </div>
              ) : (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[13px]">{e.id}</span>
                  <span className="text-[12px] text-muted-foreground">{written(e)}</span>
                </div>
              )}
            </div>
            {plus(e.index + 1)}
          </Fragment>
        );
      })}
    </div>
  );
}
