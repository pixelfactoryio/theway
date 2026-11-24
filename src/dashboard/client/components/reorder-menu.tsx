import { MoreHorizontalIcon } from "lucide-react"
import type { ComponentProps, MouseEvent, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * One entry of a "…" menu: its icon and label, what choosing it does, and whether it is disabled (with `title` saying
 * why), red when `destructive`; or a separator.
 */
export type ReorderItem =
  | {
      label: string
      icon: ReactNode
      onSelect: () => void
      disabled?: boolean
      title?: string
      destructive?: boolean
    }
  | "separator"

/**
 * A row's or a card's "…" menu: a ghost icon button (`label` its accessible name) opening `items`, aligned to its end.
 * `open`, `onOpenChange` and `finalFocus` control it when given; `onTriggerClick` runs on a click of the button (a row
 * that opens on a click stops it there).
 */
export function ReorderMenu({
  label,
  items,
  size,
  triggerClassName,
  contentClassName,
  open,
  onOpenChange,
  finalFocus,
  onTriggerClick,
}: {
  label: string
  items: readonly ReorderItem[]
  size: "icon-xs" | "icon-sm"
  triggerClassName?: string
  contentClassName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  finalFocus?: ComponentProps<typeof DropdownMenuContent>["finalFocus"]
  onTriggerClick?: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        onClick={onTriggerClick}
        render={<Button variant="ghost" size={size} aria-label={label} className={triggerClassName} />}
      >
        <MoreHorizontalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={contentClassName} finalFocus={finalFocus}>
        {items.map((item, i) => {
          if (item === "separator") return <DropdownMenuSeparator key={`separator-${i}`} />
          const entry = (
            <DropdownMenuItem
              key={item.label}
              variant={item.destructive === true ? "destructive" : undefined}
              disabled={item.disabled}
              onClick={item.onSelect}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          )
          return item.title !== undefined ? (
            <span key={item.label} title={item.title}>
              {entry}
            </span>
          ) : (
            entry
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
