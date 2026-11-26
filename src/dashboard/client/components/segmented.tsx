import type { ReactNode } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

/** One choice of a `Segmented`: its value, its label, and an icon before the label. */
export type Segment<T extends string> = { value: T; label: string; icon?: ReactNode }

/**
 * A choice between views of one thing (a file's Source | Preview, the history's Unified | Split), the same on every
 * page: its segments on a muted track, the chosen one raised on the page's background with a hairline. Pressing the
 * chosen one keeps it.
 */
export function Segmented<T extends string>({
  label,
  value,
  segments,
  onChange,
  disabled = false,
  size = "default",
}: {
  label: string
  value: T
  segments: readonly Segment<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  /** `sm` for a 28px status bar: 20px segments on a 1px track. */
  size?: "default" | "sm"
}) {
  const sm = size === "sm"
  return (
    <ToggleGroup
      aria-label={label}
      spacing={0.5}
      value={[value]}
      disabled={disabled}
      className={sm ? "rounded-md bg-muted p-px" : "rounded-lg bg-muted p-0.5"}
      onValueChange={(next: string[]) => {
        const picked = segments.find((s) => s.value === next[0])
        if (picked !== undefined) onChange(picked.value)
      }}
    >
      {segments.map((s) => (
        <ToggleGroupItem
          key={s.value}
          value={s.value}
          className={`${sm ? "h-5 rounded-sm px-1.5" : "h-6 rounded-md px-2"} min-w-0 gap-1 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs aria-pressed:ring-1 aria-pressed:ring-foreground/10 dark:aria-pressed:bg-foreground/15 [&_svg:not([class*='size-'])]:size-3.5`}
        >
          {s.icon}
          {s.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
