/** What is selected in edit mode: a workflow entry, a step construct by its YAML path, or a step param. */
import type { YamlPath } from "./source";

export type Selection = { entry: number } | { node: YamlPath } | { param: string } | null;

/** A YAML path as a string key. */
export const pathKey = (path: YamlPath): string => path.join(".");

/** Whether `s` selects the construct at `path`. */
export const selectsNode = (s: Selection, path: YamlPath): boolean => s !== null && "node" in s && pathKey(s.node) === pathKey(path);

/** The outline of a card: 2px `--foreground` when selected, else 2px `--destructive` when an error line ties to it. */
export const outline = (selected: boolean, tied: boolean): string =>
  selected ? "outline-2 outline-foreground" : tied ? "outline-2 outline-destructive" : "";
