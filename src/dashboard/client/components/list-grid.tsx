import { SearchIcon, XIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "cn"

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"

export const cellSkeleton = (width: string): ReactNode => <Skeleton className={`h-5 ${width}`} />

/**
 * A grid's scroll root: the grid container, its scroll viewport padded by the header row's height. The scroll area's
 * own wrapper is made a flex column so the area takes the height left and its viewport scrolls under the header row.
 */
export function GridFrame({ children }: { children: ReactNode }) {
  return (
    <div
      data-scroll-root
      className="flex min-h-0 flex-1 flex-col [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col"
    >
      {children}
    </div>
  )
}

export const SCROLL_AREA = "min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:scroll-pt-10"

/** A table's search field: `label` is its placeholder and accessible name. */
export function SearchField({
  value,
  onChange,
  label = "Search changes",
  className,
}: {
  value: string
  onChange: (value: string) => void
  label?: string
  className?: string
}) {
  return (
    <InputGroup className={cn("w-full sm:w-64", className)}>
      <InputGroupAddon align="inline-start">
        <SearchIcon aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        placeholder={label}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value !== "" ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onChange("")}>
            <XIcon aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}
