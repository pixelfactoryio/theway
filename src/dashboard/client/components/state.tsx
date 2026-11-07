import type { ReactNode } from "react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Status, Tasks } from "../../types";

/** A centered muted message: loading, empty or an error. */
export function Empty({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={cn("p-10 text-center", error ? "text-destructive" : "text-muted-foreground")}>{children}</div>;
}

const PILL: Record<Status, string> = {
  "In progress": "bg-[#EFF6FF] text-[#1D4ED8]",
  "Not started": "bg-[#F4F4F5] text-[#52525B]",
  "No tasks": "bg-[#F4F4F5] text-[#71717A]",
  "Ready to archive": "bg-[#F0FDF4] text-[#15803D]",
};

/** A status pill. */
export function StatusBadge({ status }: { status: Status }) {
  return <Badge className={cn("h-auto rounded-full px-2 py-0.5 text-[12px] font-normal", PILL[status])}>{status}</Badge>;
}

/** A task bar: green when every task is done, blue otherwise, on a light track. */
export function TaskBar({ tasks, className }: { tasks: Tasks; className?: string }) {
  const value = tasks.total === 0 ? 0 : Math.round((tasks.done / tasks.total) * 100);
  const complete = tasks.total > 0 && tasks.done === tasks.total;
  return (
    <Progress
      value={value}
      aria-label={`${tasks.done} of ${tasks.total} tasks done`}
      className={cn(
        "[&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-[#EFEFF1]",
        complete ? "[&_[data-slot=progress-indicator]]:bg-[#22C55E]" : "[&_[data-slot=progress-indicator]]:bg-[#3B82F6]",
        className,
      )}
    />
  );
}

/** The page header: the project, then the page's breadcrumb, then whatever goes on the right. */
export function PageHeader({ project, crumbs, children }: { project: string; crumbs: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex h-11 flex-wrap items-center gap-2.5 border-b px-4">
      <span className="text-muted-foreground" title={project}>
        {project}
      </span>
      <span className="text-muted-foreground/60">/</span>
      <span className="min-w-0 truncate font-medium">{crumbs}</span>
      <div className="grow" />
      {children}
    </header>
  );
}
