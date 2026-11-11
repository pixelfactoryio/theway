import type { ReactNode } from "react";
import { FilesButton } from "./FileList";

/** A title row: the title and its badges, with `actions` on its line at the right, then the lines under it. */
export function TitleRow({ title, actions, children }: { title: ReactNode; actions: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-4 lg:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:flex-nowrap">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{title}</div>
        <div className="flex min-w-0 flex-wrap gap-2 lg:shrink-0">
          <FilesButton />
          {actions}
        </div>
      </div>
      {children}
    </div>
  );
}
