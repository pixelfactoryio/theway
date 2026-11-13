/** The words of a record page's panel toggle. Pure: no React, no DOM. */

/** A record page with a right panel: the change page, a prompt's, a workflow's, and the History tab of a file page. */
export type PanelPage = "change" | "prompt" | "workflow" | "history";

/** The word each page's toggle names its panel by. */
export const PANEL_WORD: Record<PanelPage, string> = {
  change: "details",
  prompt: "details",
  workflow: "settings",
  history: "versions",
};

/** The toggle's accessible name and tooltip: `Hide <word>` while the panel is open, else `Show <word>`. */
export const panelToggleLabel = (page: PanelPage, open: boolean): string => `${open ? "Hide" : "Show"} ${PANEL_WORD[page]}`;
