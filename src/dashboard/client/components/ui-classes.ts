/**
 * A resize handle's look: the 1px hairline between the two sides, which is the handle itself (its hit area is wider),
 * tinted blue on hover, while dragged and with the focus. No grip is drawn on it.
 */
export const HANDLE =
  "bg-border transition-colors data-[separator=active]:bg-ring data-[separator=hover]:bg-ring/60 focus-visible:bg-ring"

/**
 * A pill tab (a page's view, a panel pane's tab): 26px, 12px across, a hairline outline at rest in the secondary ink;
 * the chosen one on the blue tint in the ink, without outline; a 2px focus ring.
 */
export const PILL_TAB =
  "h-6.5 flex-none rounded-full border-border px-3 py-0 text-sm font-normal text-muted-foreground transition-colors after:hidden hover:text-foreground focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-active:border-transparent data-active:bg-selected data-active:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-none dark:text-muted-foreground dark:data-active:border-transparent dark:data-active:bg-selected"

/** The list of pill tabs: no surface of its own, the pills 8px apart, scrolling sideways when they overflow. */
export const PILL_LIST =
  "h-full min-w-0 justify-start gap-2 overflow-x-auto rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-full [scrollbar-width:none]"

/** A dialog's title: the interface's heading, 15px at 600, in place of the shipped 16px. */
export const DIALOG_TITLE = "text-heading font-semibold"
