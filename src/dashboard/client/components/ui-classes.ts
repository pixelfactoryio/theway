/**
 * A resize handle's look: the 1px hairline between the two sides, which is the handle itself (its hit area is wider),
 * tinted blue on hover, while dragged and with the focus. No grip is drawn on it.
 */
export const HANDLE =
  "bg-border transition-colors data-[separator=active]:bg-ring data-[separator=hover]:bg-ring/60 focus-visible:bg-ring"

/**
 * The sidebar's edge while it is expanded: a resize handle with no width of its own, on the work area's left edge,
 * nothing drawn at rest. Its 10px hit area (the separator's own minimum) stands over its neighbours, so a click on it
 * reaches it; a 2px line in the middle of the 8px between the sidebar's rows and the work area shows on hover in the
 * sidebar's border ink, blue while dragged and with the focus. Its `col-resize` cursor holds over the whole page while
 * it is hovered or dragged (`globals.css`).
 */
export const SIDEBAR_HANDLE =
  "w-0 cursor-col-resize bg-transparent after:z-10 after:w-[10px] focus-visible:ring-0 [&>div]:absolute [&>div]:inset-y-0 [&>div]:right-[calc(0.25rem-1px)] [&>div]:h-auto [&>div]:w-0.5 [&>div]:rounded-none [&>div]:bg-transparent [&>div]:transition-colors data-[separator=hover]:[&>div]:bg-sidebar-border data-[separator=active]:[&>div]:bg-ring focus-visible:[&>div]:bg-ring"

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
