/** The words of a record page's panel toggle. Pure: no React, no DOM. */

/**
 * The toggle's accessible name and tooltip, the same on every page: `Hide panel` while the panel is open, else
 * `Show panel`.
 */
export const panelToggleLabel = (open: boolean): string => (open ? "Hide panel" : "Show panel")
