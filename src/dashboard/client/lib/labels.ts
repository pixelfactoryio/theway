/** The short names of projects that the pages, the project switcher and the dialogs show. Pure: no DOM, no JSX. */

/**
 * A project's repository name from its label: the last segment of a `<parent>/<name>` label; the part after
 * `<host>-<tld>-<owner>-` of a label made from a path's key (`github-com-acme-tower` gives `tower`); else the label.
 */
export function repoName(label: string): string {
  const last = label.split("/").filter((s) => s !== "").pop() ?? label;
  return /^-?(?:.*-)?[a-z0-9]+-(?:com|org|net|io|dev)-[^-]+-(.+)$/.exec(last)?.[1] ?? last;
}

/** The heading of each label: its `repoName`, or the whole label when another label gives the same name. */
export function shortLabels(labels: readonly string[]): string[] {
  const names = labels.map(repoName);
  return labels.map((l, i) => (names.filter((n) => n === names[i]).length > 1 ? l : (names[i] as string)));
}

/** The short name of each project label: its repository name, or the whole label when two give the same. */
export function projectNames(labels: readonly string[]): Map<string, string> {
  const unique = [...new Set(labels)];
  const short = shortLabels(unique);
  return new Map(unique.map((l, i) => [l, short[i] ?? l]));
}
