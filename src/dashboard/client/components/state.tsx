import type { ReactNode } from "react";
import { cn } from "cn";

/** A centered muted message: loading, empty or an error. */
export function Empty({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={cn("p-10 text-center", error ? "text-destructive" : "text-muted-foreground")}>{children}</div>;
}

/** A 4px progress bar: the divider colour behind, the foreground for the done part. */
export function Bar({ done, total }: { done: number; total: number }) {
  const width = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <span className="block h-1 bg-divider" role="img" aria-label={`${done} of ${total}`}>
      <span className="block h-1 bg-primary" style={{ width: `${width}%` }} />
    </span>
  );
}
