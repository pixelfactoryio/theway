import { Route } from 'lucide-react';

/* theway's logo, as the dashboard draws it: the route mark on a solid ink tile, then "theway" at 600. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-ui">
      <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-md bg-ink text-panel">
        <Route className="size-3" />
      </span>
      <span className="font-semibold text-ink">theway</span>
    </span>
  );
}
