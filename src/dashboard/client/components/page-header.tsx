import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * A list page's header: its title with its count, one line saying what the page holds, and its one action at the right.
 * Below `lg` the top bar names the page: the title is left to assistive technology, the line is not shown, and a header
 * without an action takes no room.
 */
export function PageHeader({ title, count, purpose, children }: { title: string; count?: number; purpose: string; children?: ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-3", children === undefined && "max-lg:sr-only")}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="flex flex-wrap items-baseline gap-x-2 text-[20px] leading-7 font-semibold max-lg:sr-only">
          {title}
          {count !== undefined && <span className="text-[14px] font-medium text-muted-foreground tabular-nums">{count}</span>}
        </h1>
        <p className="hidden text-[13px] text-muted-foreground lg:block">{purpose}</p>
      </div>
      {children}
    </div>
  );
}
