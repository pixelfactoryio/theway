/**
 * A resize handle's look: its line in the input border and its grip in the muted text colour, seen at rest (3:1 or
 * more on both themes), tinted on hover and while dragged.
 */
export const HANDLE =
  "bg-input [&>div]:bg-muted-foreground transition-colors data-[separator=active]:bg-foreground/60 data-[separator=hover]:bg-foreground/40"

/**
 * A tab of an underlined row (a document's tabs, a panel pane's): the row's full height, dim until chosen, then ink at
 * 500 over a 2px underline on the row's rule; a 2px inset ring on focus, inside the row so a scrolling row cannot clip
 * it.
 */
export const LINE_TAB =
  "h-full flex-none gap-2 rounded-none border-0 text-sm font-normal text-muted-foreground transition-colors after:bottom-0! after:h-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset data-active:font-medium data-active:text-foreground"

/** A dialog's title: the interface's heading, 14px at 600, in place of the shipped 16px. */
export const DIALOG_TITLE = "text-sm font-semibold"
