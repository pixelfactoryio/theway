/**
 * The card a resolver error line points at, in the open file: a workflow entry by its `steps[i]`, a step construct by
 * its chain of `do[i]` indices. Pure: no DOM, no React.
 */

/** Where a line points: entry `entry` of a workflow, or the construct whose `do` indices start with `path`. */
export type Located = { entry: number } | { path: number[] };

/**
 * Where `line` points in the open file `rel` (its path relative to the home), `null` when it names another file or
 * no `steps[i]` or `do[i]` token. A line names the open file when it starts with `theway: <rel>: `, or with
 * `<label>: theway: <rel>: ` for one of `labels`.
 */
export function locate(line: string, rel: string, labels: string[]): Located | null {
  const own = `theway: ${rel}: `;
  let rest: string | null = null;
  if (line.startsWith(own)) rest = line.slice(own.length);
  else {
    for (const label of labels) {
      const prefixed = `${label}: ${own}`;
      if (line.startsWith(prefixed)) {
        rest = line.slice(prefixed.length);
        break;
      }
    }
  }
  if (rest === null) return null;
  const locator = rest.split(/[ :]/, 1)[0] ?? "";
  const workflow = /^(projects\/[^/]+\/)?workflows\//.test(rel);
  if (workflow) {
    const m = /^steps\[(\d+)\]/.exec(locator);
    return m === null ? null : { entry: Number(m[1]) };
  }
  const path = [...locator.matchAll(/do\[(\d+)\]/g)].map((m) => Number(m[1]));
  return path.length === 0 ? null : { path };
}

/** The `do` indices of a YAML path, in order: `["do", 0, "loop", "do", 1]` gives `[0, 1]`. */
export const chainOf = (yamlPath: (string | number)[]): number[] => yamlPath.filter((p): p is number => typeof p === "number");

/** Whether `chain` starts `path`. */
const starts = (chain: number[], path: number[]): boolean => chain.length <= path.length && chain.every((c, i) => c === path[i]);

/** Of `chains`, the index of the deepest one that starts `path`; `-1` when none does. */
export function deepest(chains: number[][], path: number[]): number {
  let best = -1;
  chains.forEach((chain, i) => {
    if (starts(chain, path) && (best === -1 || chain.length > (chains[best] as number[]).length)) best = i;
  });
  return best;
}

/** A line as the save bar shows it: the `theway: ` after an optional `<label>: ` removed. */
export function shownLine(line: string, labels: string[]): string {
  if (line.startsWith("theway: ")) return line.slice("theway: ".length);
  for (const label of labels) {
    const prefixed = `${label}: theway: `;
    if (line.startsWith(prefixed)) return `${label}: ${line.slice(prefixed.length)}`;
  }
  return line;
}
