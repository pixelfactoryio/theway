/** A list page's search and field filters, as its address holds them, and what they keep. Pure: no React, no DOM. */

/** One field filter: the values it keeps (`not`: the values it drops), in the order they were picked. */
export type FieldRule = { field: string; not: boolean; values: string[] }

/** A list's search text and its field filters, joined by AND. */
export type ListFilter = { q: string; rules: FieldRule[] }

export const NO_FILTER: ListFilter = { q: "", rules: [] }

/** The value a filter keeps for a row with no value in the field (no model, no workflow using it…). */
export const NONE = "(none)"

/** Whether the filter narrows the list at all. */
export const isNarrowed = (filter: ListFilter): boolean => filter.q.trim() !== "" || filter.rules.length > 0

/** `s` decoded, `+` read as a space, as a form writes it; `s` as is when it is not valid percent-encoding. */
function decode(s: string): string {
  try {
    return decodeURIComponent(s.replaceAll("+", " "))
  } catch {
    return s
  }
}

/** One `key=value` pair of a search part, its key decoded. */
function pairs(search: string): { raw: string; key: string; value: string }[] {
  return search
    .replace(/^\?/, "")
    .split("&")
    .filter((p) => p !== "")
    .map((raw) => {
      const at = raw.indexOf("=")
      const key = at === -1 ? raw : raw.slice(0, at)
      return { raw, key: decode(key), value: at === -1 ? "" : raw.slice(at + 1) }
    })
}

/** A pair's values: comma-separated, each decoded, the empty ones dropped. */
const valuesOf = (value: string): string[] =>
  value
    .split(",")
    .map(decode)
    .filter((v) => v !== "")

/** The field and negation a key names among `fields`: `kind` keeps, `kind!` drops; `null` for any other key. */
function ruleKey(key: string, fields: readonly string[]): { field: string; not: boolean } | null {
  const not = key.endsWith("!")
  const field = not ? key.slice(0, -1) : key
  return fields.includes(field) ? { field, not } : null
}

/**
 * The filter a search part holds (with or without its `?`): `q`, and per field of `fields` `<field>=a,b` (is any of)
 * or `<field>!=a,b` (is none of), each in its own rule, in the address' order. Other keys and empty rules are ignored.
 */
export function parseListFilter(search: string, fields: readonly string[]): ListFilter {
  let q = ""
  const rules: FieldRule[] = []
  for (const p of pairs(search)) {
    if (p.key === "q") {
      q = valuesOf(p.value).join(",")
      continue
    }
    const named = ruleKey(p.key, fields)
    if (named === null) continue
    const values = valuesOf(p.value)
    if (values.length > 0) rules.push({ ...named, values })
  }
  return { q, rules }
}

/**
 * The search part of `filter`, without its `?`: the keys of `current` that are not the filter's kept as they are (the
 * scope page's `archive`), then `q`, then one key per rule. Each value is URI-encoded, so `,` separates values only.
 */
export function listFilterSearch(filter: ListFilter, fields: readonly string[], current = ""): string {
  const kept = pairs(current)
    .filter((p) => p.key !== "q" && ruleKey(p.key, fields) === null)
    .map((p) => p.raw)
  const own = [
    ...(filter.q === "" ? [] : [`q=${encodeURIComponent(filter.q)}`]),
    ...filter.rules
      .filter((r) => r.values.length > 0)
      .map((r) => `${encodeURIComponent(r.field)}${r.not ? "!" : ""}=${r.values.map(encodeURIComponent).join(",")}`),
  ]
  return [...kept, ...own].join("&")
}

/** A rule list's identity, to tell whether two lists filter the same way. */
export const rulesKey = (rules: readonly FieldRule[]): string =>
  rules.map((r) => `${r.field}${r.not ? "!" : ""}=${r.values.join(",")}`).join("&")

/** Whether a row whose field holds `values` passes `rule`: one of them picked, or (`not`) none of them. */
export function passes(values: readonly string[], rule: FieldRule): boolean {
  const hit = values.some((v) => rule.values.includes(v))
  return rule.not ? !hit : hit
}

/** A row's values in a field, `[NONE]` when it has none. */
export type ValuesOf<T> = (row: T, field: string) => readonly string[]

/** Whether `row` passes every rule of `rules`, except those on the field `except`. */
export const passesAll = <T>(row: T, rules: readonly FieldRule[], valuesOf: ValuesOf<T>, except?: string): boolean =>
  rules.every((r) => r.field === except || passes(valuesOf(row, r.field), r))

/**
 * The number of `rows` per value of `field`, among the rows every other field's rule keeps: what each value of the
 * field's menu would show if it were picked alone.
 */
export function valueCounts<T>(
  rows: readonly T[],
  field: string,
  rules: readonly FieldRule[],
  valuesOf: ValuesOf<T>,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!passesAll(row, rules, valuesOf, field)) continue
    for (const v of new Set(valuesOf(row, field))) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return counts
}

/** The distinct values `rows` hold in `field`, by `label`, `NONE` last. */
export function fieldValues<T>(
  rows: readonly T[],
  field: string,
  valuesOf: ValuesOf<T>,
  label: (value: string) => string,
): string[] {
  const values = [...new Set(rows.flatMap((r) => valuesOf(r, field)))]
  return values.sort((a, b) => Number(a === NONE) - Number(b === NONE) || label(a).localeCompare(label(b)))
}

/** A rule as a sentence: `Kind is Step prompt`, `Runs on is any of agents, mixed`, `Status is not Valid`. */
export function ruleText(rule: FieldRule, fieldLabel: string, valueLabel: (value: string) => string): string {
  const values = rule.values.map(valueLabel).join(", ")
  const many = rule.values.length > 1
  const verb = rule.not ? (many ? "is none of" : "is not") : many ? "is any of" : "is"
  return `${fieldLabel} ${verb} ${values}`
}

/**
 * The active filters as one phrase, for the empty state: `“text” and Kind is Step prompt and Status is Has errors`.
 * `labels` gives a field's label and a value's label; an unknown field reads as its ID.
 */
export function filterText(
  filter: ListFilter,
  labels: { field: (field: string) => string; value: (field: string, value: string) => string },
): string {
  const q = filter.q.trim()
  return [
    ...(q === "" ? [] : [`“${q}”`]),
    ...filter.rules.map((r) => ruleText(r, labels.field(r.field), (v) => labels.value(r.field, v))),
  ].join(" and ")
}

/** `n` and `noun`, plural unless `n` is 1: `1 project`, `3 projects`. */
export const countOf = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`

/** The result line: `N of M <noun>s` (`1 of 1 <noun>`). */
export const resultText = (shown: number, all: number, noun: string): string => `${shown} of ${countOf(all, noun)}`

/** The `localStorage` key of a list page's remembered filter: `theway-filter:<page>` (`now`, `project:<key>`, …). */
export const filterKey = (page: string): string => `theway-filter:${page}`

/** The filter `search` holds as a page remembers it (`q`, then one key per rule); `null` when it narrows nothing. */
export function rememberedSearch(search: string, fields: readonly string[]): string | null {
  const filter = parseListFilter(search, fields)
  return isNarrowed(filter) ? listFilterSearch(filter, fields) : null
}

/**
 * The search of a list page opened with no filter in its address: its other keys, then the filter `stored` holds.
 * `null` when the address has a filter of its own (it wins) or nothing that narrows is remembered.
 */
export function restoredSearch(search: string, stored: string | null, fields: readonly string[]): string | null {
  if (stored === null || isNarrowed(parseListFilter(search, fields))) return null
  const filter = parseListFilter(stored, fields)
  return isNarrowed(filter) ? listFilterSearch(filter, fields, search) : null
}

/** Whether `rules` pick `value` in `field`: an "is" rule on the field names it (Now lists the archive for Archived). */
export const picks = (rules: readonly FieldRule[], field: string, value: string): boolean =>
  rules.some((r) => r.field === field && !r.not && r.values.includes(value))
