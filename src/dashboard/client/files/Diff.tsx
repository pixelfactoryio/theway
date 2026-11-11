import { cn } from "cn";
import { structuredPatch } from "diff";
import { useMemo } from "react";

/** The diff from one text to another: 3 context lines, added and removed lines on their colours. */
export function Diff({ from, to, className }: { from: string; to: string; className?: string }) {
  const patch = useMemo(() => structuredPatch("a", "b", from, to, "", "", { context: 3 }), [from, to]);
  return (
    <div className={cn("max-h-[200px] overflow-auto rounded-md border bg-card font-mono text-[12px]", className)}>
      {patch.hunks.map((h) => (
        <div key={`${h.oldStart}:${h.newStart}`}>
          <div className="px-2 text-muted-foreground">{`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`}</div>
          {h.lines.map((l, i) => (
            <div key={i} className={cn("px-2 whitespace-pre", l.startsWith("+") && "bg-[#E9F7EC]", l.startsWith("-") && "bg-[#FDECEC]")}>
              {l}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
