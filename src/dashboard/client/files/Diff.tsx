import { cn } from "cn";
import { useMemo } from "react";
import { diffRows } from "./version-info";

/**
 * The diff from one text to another: 3 context lines, each line with its old and new numbers, added and removed lines
 * on their colours, a rule between two hunks.
 */
export function Diff({ from, to, className }: { from: string; to: string; className?: string }) {
  const rows = useMemo(() => diffRows(from, to), [from, to]);
  return (
    <div className={cn("max-h-[200px] overflow-auto rounded-md border bg-card font-mono text-[12px]", className)}>
      {rows.map((r, i) =>
        "gap" in r ? (
          <hr key={i} className="border-divider" />
        ) : (
          <div
            key={i}
            className={cn("flex w-max min-w-full", r.text.startsWith("+") && "bg-(--diff-added)", r.text.startsWith("-") && "bg-(--diff-removed)")}
          >
            <span className="w-9 shrink-0 pr-1.5 text-right text-muted-foreground select-none">{r.old ?? ""}</span>
            <span className="w-9 shrink-0 pr-1.5 text-right text-muted-foreground select-none">{r.new ?? ""}</span>
            <span className="px-2 whitespace-pre">{r.text}</span>
          </div>
        ),
      )}
    </div>
  );
}
