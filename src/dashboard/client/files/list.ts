/** What a group of the file list shows: its items matching the filter, and how many a "Show more" hides. Pure: no DOM, no React. */

/** The most items a group shows before "Show N more". */
export const GROUP_LIMIT = 8;

/** Whether `name` matches the filter: its text contains the filter's, trimmed, ignoring case; an empty filter matches all. */
export const matches = (name: string, filter: string): boolean => name.toLowerCase().includes(filter.trim().toLowerCase());

/**
 * The items a group shows and how many it hides: with a filter, every match; else all of them when `expanded`, else
 * the first `limit`, or as many as reach the open file's item (`selected`, its index in `items`, `-1` for none).
 */
export function visibleItems<T>(
  items: readonly T[],
  { filter, expanded, selected, name, limit = GROUP_LIMIT }: { filter: string; expanded: boolean; selected: number; name: (item: T) => string; limit?: number },
): { shown: T[]; hidden: number } {
  if (filter.trim() !== "") return { shown: items.filter((i) => matches(name(i), filter)), hidden: 0 };
  if (expanded) return { shown: [...items], hidden: 0 };
  const count = Math.max(limit, selected + 1);
  return { shown: items.slice(0, count), hidden: Math.max(0, items.length - count) };
}
