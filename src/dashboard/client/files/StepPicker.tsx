/** The step picker: the step prompts, filtered by a text, each inserting a step where the picker was opened; or a new prompt. */
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { PromptContext } from "./context";

/** The ID of the filter field, which has the focus when the picker opens. */
const FIND_ID = "step-picker-find";

/** The step prompts whose name or description holds `text`, ignoring case. */
const matching = (ctx: PromptContext, text: string) => {
  const t = text.trim().toLowerCase();
  return ctx.steps.filter(({ item }) => t === "" || item.name.toLowerCase().includes(t) || (item.description ?? "").toLowerCase().includes(t));
};

/** The picker's list, mounted while it is open. */
function Picker({ ctx, onPick, onWrite }: { ctx: PromptContext; onPick: (name: string) => void; onWrite: () => void }) {
  const [text, setText] = useState("");
  const shown = matching(ctx, text);
  const row = "flex w-full cursor-pointer items-baseline gap-3 rounded-md px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <>
      <DialogTitle className="sr-only">Add a step</DialogTitle>
      <label className="flex items-center gap-2 border-b border-divider px-4 py-3">
        <Search aria-hidden="true" className="size-4 text-muted-foreground" />
        <input
          id={FIND_ID}
          value={text}
          placeholder="Find a prompt"
          aria-label="Find a prompt"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="flex max-h-[min(420px,60vh)] flex-col overflow-auto p-1.5">
        {shown.length === 0 ? (
          <p className="px-3 py-2.5 text-muted-foreground">No prompt matches.</p>
        ) : (
          shown.map(({ item }) => (
            <button key={`${item.scope}/${item.key ?? ""}/${item.name}`} type="button" className={row} onClick={() => onPick(item.name)}>
              <span className="font-semibold">{item.name}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.description ?? ""}</span>
              {item.model !== null && <span className="shrink-0 text-muted-foreground">{item.model}</span>}
            </button>
          ))
        )}
      </div>
      <div className="border-t border-divider p-1.5">
        <button type="button" className={`${row} items-center font-medium text-primary`} onClick={onWrite}>
          <Plus className="size-4" /> Write a new prompt
        </button>
      </div>
    </>
  );
}

/** The picker in a dialog, open while `open`; `onPick` gets the chosen prompt's name, `onWrite` asks for a new prompt. */
export function StepPicker({
  open,
  ctx,
  onPick,
  onWrite,
  onClose,
}: {
  open: boolean;
  ctx: PromptContext;
  onPick: (name: string) => void;
  onWrite: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-[520px]" showCloseButton={false} initialFocus={() => document.getElementById(FIND_ID)}>
        {open && <Picker ctx={ctx} onPick={onPick} onWrite={onWrite} />}
      </DialogContent>
    </Dialog>
  );
}
