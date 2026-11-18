/** The UI choices this browser keeps, each as a codec of its stored string. Pure: no React, no DOM. */
import { type Collapsed, parseCollapsed } from "./collapse"

/** How a choice is kept: `parse` reads a stored value (`null` when none), `format` writes one (`null` removes it). */
export type Codec<T> = { parse: (raw: string | null) => T; format: (value: T) => string | null }

/** The sidebar open: `open` or `closed`; with nothing stored, `wide()` (open on a wide window). */
export const sidebarCodec = (wide: () => boolean): Codec<boolean> => ({
  parse: (raw) => (raw === null ? wide() : raw !== "closed"),
  format: (open) => (open ? "open" : "closed"),
})

/** The panel docked open: `hidden` when hidden, nothing stored when shown. */
export const PANEL_DOCKED: Codec<boolean> = {
  parse: (raw) => raw !== "hidden",
  format: (docked) => (docked ? null : "hidden"),
}

/** A sidebar group open (`open`) or closed (`closed`); `null` when never chosen. */
export const GROUP_OPEN: Codec<boolean | null> = {
  parse: (raw) => (raw === null ? null : raw === "open"),
  format: (open) => (open === null ? null : open ? "open" : "closed"),
}

/** A page's collapsed groups, as JSON. */
export const COLLAPSED: Codec<Collapsed> = { parse: parseCollapsed, format: (choices) => JSON.stringify(choices) }

/** The History tab's difference layout. */
export type DiffLayout = "unified" | "split"

/** The difference layout: `split`, else Unified. */
export const DIFF_LAYOUT: Codec<DiffLayout> = {
  parse: (raw) => (raw === "split" ? "split" : "unified"),
  format: (layout) => layout,
}

/** A pane's chosen tab, as stored. */
export const PANE_TAB: Codec<string | null> = { parse: (raw) => raw, format: (tab) => tab }
