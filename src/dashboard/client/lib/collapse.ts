/** Which groups of a grouped list are collapsed, as this browser keeps them per page. Pure: no React, no DOM. */

/** The `localStorage` key of a page's collapsed groups: `theway-collapsed:<page>` (`now`, `project:<key>`, …). */
export const collapsedKey = (page: string): string => `theway-collapsed:${page}`

/** A page's choices: per group ID, whether it is collapsed. A group with no choice takes its default. */
export type Collapsed = Record<string, boolean>

/** The choices a stored value holds: an object of booleans; anything else reads as none. */
export function parseCollapsed(raw: string | null): Collapsed {
  if (raw === null) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((e): e is [string, boolean] => typeof e[1] === "boolean"))
  } catch {
    return {}
  }
}

/** Whether `group` is collapsed: the choice made for it, else `byDefault`. */
export const isCollapsed = (choices: Collapsed, group: string, byDefault = false): boolean =>
  choices[group] ?? byDefault

/** The choices with `groups` all collapsed (`collapsed`) or all open. */
export const withCollapsed = (choices: Collapsed, groups: readonly string[], collapsed: boolean): Collapsed => ({
  ...choices,
  ...Object.fromEntries(groups.map((g) => [g, collapsed])),
})

/** The group ID of an archive month: `archive:YYYY-MM` of an archive date `YYYY-MM-DD…`. */
export const monthGroup = (date: string): string => `archive:${date.slice(0, 7)}`
