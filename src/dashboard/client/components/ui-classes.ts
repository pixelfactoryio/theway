/**
 * A resize handle's look: its line in the input border and its grip in the muted text colour, seen at rest (3:1 or
 * more on both themes), tinted on hover and while dragged.
 */
export const HANDLE =
  "bg-input [&>div]:bg-muted-foreground transition-colors data-[separator=active]:bg-foreground/60 data-[separator=hover]:bg-foreground/40"
