/** The editor's palette: the blocks and the project's steps, filtered by a search box, dragged onto a `+` point. */
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StepItem } from "../../../core/schema";
import { BLOCKS, DRAG_ITEM, type Item } from "./items";

function PaletteButton({ item, children }: { item: Item; children: ReactNode }) {
  return (
    <Button
      variant="outline"
      size="sm"
      draggable
      title="Drag onto a + point"
      className="h-auto min-h-7 w-full cursor-grab justify-start gap-2 py-1 font-normal"
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_ITEM, JSON.stringify(item));
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      {children}
    </Button>
  );
}

/** The 224px palette on the left of the canvas. */
export function Palette({ steps, onNewStep }: { steps: StepItem[]; onNewStep: () => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const blocks = BLOCKS.filter((b) => b.label.toLowerCase().includes(q));
  const shown = steps.filter((s) => s.name.includes(q));
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-white" aria-label="Palette">
      <div className="border-b p-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search blocks and steps" aria-label="Search the palette" />
      </div>
      <ScrollArea className="min-h-0 grow">
        <div className="flex flex-col gap-4 p-3">
          <section className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-medium text-muted-foreground uppercase">Blocks</h3>
            {blocks.map((b) => (
              <PaletteButton key={b.type} item={{ type: b.type }}>
                {b.label}
              </PaletteButton>
            ))}
          </section>
          <section className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-medium text-muted-foreground uppercase">Steps</h3>
            {shown.map((s) => (
              <PaletteButton key={s.name} item={{ type: "step", name: s.name }}>
                <span className="min-w-0 grow truncate text-left font-mono">{s.name}</span>
                <Badge variant="secondary" className="shrink-0">
                  {s.origin}
                </Badge>
              </PaletteButton>
            ))}
            <Button variant="ghost" size="sm" className="justify-start" onClick={onNewStep}>
              New step
            </Button>
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}
