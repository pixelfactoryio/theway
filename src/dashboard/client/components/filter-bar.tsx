import { cn } from "cn"
import { PlusIcon, SearchIcon, XIcon } from "lucide-react"
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react"
import { useLocation, useSearch } from "wouter"

import { EmptyNote } from "@/components/empty-note"
import {
  createFilterQuery,
  createFilterRule,
  FilterOperatorPopover,
  Filters,
  FilterValuePopover,
  flattenFilterRules,
  isFilterLocked,
  useFilterActions,
  useFilterChipFocused,
  useFilterFocusEmpty,
  useFilterFocusStore,
  useFilterRuleDisplay,
  useFilterState,
} from "@/components/reui/filters/filters"
import { getFilterField } from "@/components/reui/filters/filters-lib"
import { getFilterOperator } from "@/components/reui/filters/filters-operators"
import type {
  AnyFilterEditor,
  FilterEditorProps,
  FilterEditorRegistry,
  FilterField,
  FilterLabels,
  FilterOperator,
  FilterOption,
  FilterQuery,
  FilterRule,
  FilterValueDisplayContext,
} from "@/components/reui/filters/filters-types"
import { SearchField } from "@/components/list-grid"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { Checkbox } from "@/components/ui/checkbox"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import {
  type FieldRule,
  filterKey,
  filterText,
  isNarrowed,
  type ListFilter,
  listFilterSearch,
  parseListFilter,
  rememberedSearch,
  restoredSearch,
  resultText,
  rulesKey,
} from "@/lib/list-filter"
import { readStored, writeStored } from "@/shell/storage"

/** One value of a field's menu: what the address holds, what the menu and the chip read, and an optional mark. */
export type BarOption = { value: string; label: string; icon?: ReactNode }

/** A field of the bar: its menu's values, and how many of the list's rows each value keeps. */
export type BarField = {
  id: string
  label: string
  icon: ReactNode
  options: BarOption[]
  counts: ReadonlyMap<string, number>
}

/**
 * A list's filter in the address (`q`, and one key per rule on `fields`), and the navigation that changes it. The page
 * (`page`: `now`, `prompts`, `project:<key>`, …) remembers its last filter in this browser: opened with no filter in
 * its address, it takes the remembered one, written into the address in place; a filter the address holds wins and is
 * remembered; clearing it forgets it.
 */
export function useListFilter(
  page: string,
  fields: readonly string[],
): [ListFilter, (next: ListFilter, replace?: boolean) => void] {
  const search = useSearch()
  const [path, navigate] = useLocation()
  const key = fields.join(",")
  const stored = filterKey(page)
  const restored = restoredSearch(search, readStored(stored), fields)
  const current = restored ?? search
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filter = useMemo(() => parseListFilter(current, fields), [current, key])
  useEffect(() => {
    if (restored !== null) navigate(`${path}?${restored}`, { replace: true })
    else {
      const own = rememberedSearch(search, fields)
      if (own !== null) writeStored(stored, own)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, search, stored, path, key])
  const set = (next: ListFilter, replace = false) => {
    writeStored(stored, isNarrowed(next) ? listFilterSearch(next, fields) : null)
    navigate(`${path}?${listFilterSearch(next, fields, current)}`, { replace })
  }
  return [filter, set]
}

/** Each condition reads "is" or "is not", and keeps any of the values it holds. */
const OPERATORS: FilterOperator[] = [
  { value: "is", label: "is", arity: "many", inverse: "is_not" },
  { value: "is_not", label: "is not", arity: "many", inverse: "is" },
]

/** The bar's query for the address' rules. */
const queryOf = (rules: readonly FieldRule[]): FilterQuery<string[]> =>
  createFilterQuery<string[]>(
    rules.map((r, i) =>
      createFilterRule<string[]>({
        id: `address-${i}`,
        path: [r.field],
        operator: r.not ? "is_not" : "is",
        value: r.values,
      }),
    ),
  )

/** The address' rules for the bar's query: its complete conditions, those with a condition and a value. */
const rulesOf = (query: FilterQuery<string[]>): FieldRule[] =>
  flattenFilterRules(query).flatMap((r) => {
    const field = r.path[0]
    const values = Array.isArray(r.value) ? r.value.filter((v) => typeof v === "string" && v !== "") : []
    if (field === undefined || r.operator === "" || values.length === 0) return []
    return [{ field, not: (r.operator === "is_not") !== (r.negated === true), values }]
  })

/** Each field's per-value counts, for its value menu. */
const CountsContext = createContext<ReadonlyMap<string, ReadonlyMap<string, number>>>(new Map())

/**
 * A field's value menu: a search, then one checkbox per value with the number of rows it keeps. Each tick commits and
 * leaves the menu open, as the shipped multi-select does.
 */
function CountedValues({ field, value, onValueChange, commit, autoFocusProps, labels }: FilterEditorProps<string[]>) {
  const counts = useContext(CountsContext).get(field.id)
  const [q, setQ] = useState("")
  const picked = Array.isArray(value) ? value : []
  const needle = q.trim().toLowerCase()
  const shown = (field.options ?? []).filter((o) => needle === "" || o.label.toLowerCase().includes(needle))
  const write = (next: string[]) => {
    onValueChange(next)
    commit(next, { close: false })
  }
  return (
    <div className="flex w-64 flex-col">
      <div className="border-b p-1">
        <InputGroup className="h-7 border-0 dark:bg-transparent">
          <InputGroupAddon align="inline-start">
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            {...autoFocusProps}
            placeholder={`${field.label}…`}
            aria-label={`Search ${field.label}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </InputGroup>
      </div>
      <div role="group" aria-label={field.label} className="flex max-h-72 flex-col overflow-y-auto p-1">
        {shown.map((o) => (
          <Label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 leading-normal font-normal hover:bg-accent"
          >
            <Checkbox
              checked={picked.includes(o.value)}
              onCheckedChange={(on) => write(on ? [...picked, o.value] : picked.filter((v) => v !== o.value))}
            />
            {o.icon}
            <span className="min-w-0 flex-1 truncate text-sm">{o.label}</span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{counts?.get(o.value) ?? 0}</span>
          </Label>
        ))}
        {shown.length === 0 ? <p className="px-2 py-1 text-sm text-muted-foreground">{labels.empty}</p> : null}
      </div>
    </div>
  )
}

const EDITORS: FilterEditorRegistry = { counted: CountedValues as unknown as AnyFilterEditor }

/** A chip's segment: no surface of its own, the hairline outline only, 26px, 13px. */
const SEGMENT = "h-6.5 bg-transparent text-sm dark:bg-transparent"

/**
 * A condition as a chip, `Field is value ×`: the shipped chip's field, condition and value segments (the ReUI
 * popovers that edit them), with a remove button in place of its menu. It keeps the row's roving focus: one chip is a
 * tab stop, the arrows move between chips, Delete removes one and Enter opens the step it has not reached.
 */
function Chip({ rule }: { rule: FilterRule<string[]> }) {
  const actions = useFilterActions<string[]>()
  const { query } = useFilterState<string[]>()
  const focusStore = useFilterFocusStore()
  const focused = useFilterChipFocused(rule.id)
  const noFocus = useFilterFocusEmpty()
  const index = flattenFilterRules(query).findIndex((r) => r.id === rule.id)
  const field = getFilterField(actions.index, rule.path)
  const operator = field === undefined ? undefined : getFilterOperator(actions.resolveOperators(field), rule.operator)
  const display = useFilterRuleDisplay(rule, field, operator)
  if (field === undefined) return null
  const focus = (segment: "operator" | "value" | null) => focusStore.set({ id: rule.id, segment, autoOpen: false })
  return (
    <ButtonGroup
      data-slot="filter-chip"
      role="group"
      aria-label={actions.labels.filterLabel(
        `${display.pathText} ${display.operatorLabel}${rule.operator !== "" ? ` ${display.valueText}` : ""}`,
      )}
      data-focused={focused || undefined}
      data-rule-id={rule.id}
      data-index={index}
      tabIndex={focused || (noFocus && index === 0) ? 0 : -1}
      onFocusCapture={() => {
        if (!focused) focus(null)
      }}
    >
      <ButtonGroupText className={cn(SEGMENT, "cursor-default gap-2 font-normal text-muted-foreground")}>
        {field.icon}
        {field.label}
      </ButtonGroupText>
      <FilterOperatorPopover
        rule={rule}
        field={field}
        trigger={
          <ButtonGroupText
            render={<button type="button" />}
            className={cn(
              SEGMENT,
              "cursor-default hover:bg-accent",
              rule.operator === "" ? "text-foreground" : "text-muted-foreground",
            )}
            onPointerDown={() => focus("operator")}
          >
            {display.operatorLabel}
          </ButtonGroupText>
        }
      />
      {rule.operator !== "" ? (
        <FilterValuePopover
          rule={rule}
          field={field}
          operator={operator}
          trigger={
            <ButtonGroupText
              render={<button type="button" />}
              aria-label={display.valueText}
              className={cn(SEGMENT, "cursor-default hover:bg-accent", display.valueEmpty && "text-muted-foreground")}
              onPointerDown={() => focus("value")}
            >
              {display.valueLabel}
            </ButtonGroupText>
          }
        />
      ) : null}
      <Button
        variant="outline"
        size="icon-sm"
        className={cn(SEGMENT, "w-6.5 text-muted-foreground")}
        aria-label={`Remove the ${field.label} filter`}
        disabled={isFilterLocked(actions)}
        onClick={() => actions.removeNode(rule.id)}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </ButtonGroup>
  )
}

const renderChip = (rule: FilterRule<string[]>): ReactNode => <Chip rule={rule} />

/** The bar's words in place of the shipped ones: a filter's field and condition, as the chips and the docs say them. */
const LABELS: Partial<FilterLabels> = {
  addFilter: "Filter",
  searchFields: "Filter by…",
  searchOperators: "Condition…",
  filtersLabel: "Filters",
  fieldsLabel: "Filter fields",
  stepAnnouncement: (step, label) =>
    step === "field"
      ? `Choose a filter field. ${label}`
      : step === "operator"
        ? `Choose a condition for ${label}`
        : `Enter a value for ${label}`,
}

/** A chip's value: the values' marks, then their labels. */
function chipValue({ options, values }: FilterValueDisplayContext<string[], unknown>): ReactNode {
  if (values.length === 0) return "Select…"
  const icons = options.flatMap((o) => (o.icon === undefined ? [] : [<span key={o.value}>{o.icon}</span>]))
  return (
    <span className="flex max-w-60 items-center gap-2">
      {icons.length > 0 ? <span className="flex items-center gap-0.5">{icons}</span> : null}
      <span className="truncate">{chipText({ options, values })}</span>
    </span>
  )
}

/** A chip's value as text: the values' labels, joined. */
const chipText = ({ options, values }: { options: FilterOption<unknown>[]; values: unknown[] }): string =>
  values.map((v) => options.find((o) => o.value === v)?.label ?? String(v)).join(", ")

/**
 * A list's filter bar, one row under the page's header ending on a hairline: the search, then the ReUI filter chips
 * (`Field is value`), "Filter" to add one through a searchable menu of the fields and a menu of their values with
 * counts, and Clear; at its right, while the list is narrowed, the result (`N of M <noun>s`) in a status region. The
 * filter lives in the address (`useListFilter`).
 */
export function FilterBar({
  fields,
  filter,
  onChange,
  searchLabel,
  shown,
  total,
  noun,
}: {
  fields: BarField[]
  filter: ListFilter
  onChange: (next: ListFilter, replace?: boolean) => void
  searchLabel: string
  /** The rows kept and the rows of the list, `null` while it loads. */
  shown: number | null
  total: number | null
  /** The rows' noun, singular. */
  noun: string
}) {
  const key = rulesKey(filter.rules)
  // The bar's own query holds the conditions still being built (no condition or value yet), which the address cannot.
  const [query, setQuery] = useState(() => queryOf(filter.rules))
  // The address' rules last seen: when they change from outside (Back, Clear filters), the bar takes them.
  const [seen, setSeen] = useState(key)
  if (seen !== key) {
    setSeen(key)
    if (rulesKey(rulesOf(query)) !== key) setQuery(queryOf(filter.rules))
  }
  const counts = useMemo(() => new Map(fields.map((f) => [f.id, f.counts])), [fields])
  const schema: FilterField<string[]>[] = fields.map((f) => ({
    id: f.id,
    label: f.label,
    icon: f.icon,
    type: "select",
    operators: OPERATORS,
    editor: "counted",
    // A value the address holds that no row has (a typed address, a renamed file) stays in the menu to be unticked.
    options: [
      ...f.options,
      ...[...new Set(filter.rules.filter((r) => r.field === f.id).flatMap((r) => r.values))]
        .filter((v) => !f.options.some((o) => o.value === v))
        .map((v): BarOption => ({ value: v, label: v })),
    ].map((o) => ({ value: o.value, label: o.label, icon: o.icon })),
    renderValue: chipValue,
    valueText: chipText,
  }))
  const narrowed = isNarrowed(filter)
  const result = narrowed && shown !== null && total !== null ? resultText(shown, total, noun) : ""
  return (
    <div className="flex shrink-0 items-start gap-2 border-b px-4 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
        <SearchField
          label={searchLabel}
          value={filter.q}
          onChange={(q) => onChange({ ...filter, q }, true)}
          className="h-7 sm:w-52"
        />
        {fields.length > 0 ? (
          <CountsContext.Provider value={counts}>
            <Filters<string[]>
              fields={schema}
              query={query}
              onQueryChange={(next) => {
                setQuery(next)
                const rules = rulesOf(next)
                if (rulesKey(rules) !== key) onChange({ ...filter, rules })
              }}
              editors={EDITORS}
              renderChip={renderChip}
              size="sm"
              showClear
              labels={LABELS}
              trigger={
                <Button variant="outline" size="sm">
                  <PlusIcon aria-hidden="true" />
                  Filter
                </Button>
              }
              className="min-w-0 flex-1"
            />
          </CountsContext.Provider>
        ) : null}
      </div>
      <p
        role="status"
        className={result === "" ? "sr-only" : "flex h-7 shrink-0 items-center text-muted-foreground tabular-nums"}
      >
        {result}
      </p>
    </div>
  )
}

/**
 * The empty state of a list its filter keeps nothing of, in the one empty state: one line naming the active filters,
 * with Clear filters. `nouns` is the rows' plural noun.
 */
export function NoMatch({
  nouns,
  filter,
  fields,
  onClear,
}: {
  nouns: string
  filter: ListFilter
  fields: readonly BarField[]
  onClear: () => void
}) {
  const field = (id: string) => fields.find((f) => f.id === id)
  const text = filterText(filter, {
    field: (id) => field(id)?.label ?? id,
    value: (id, v) => field(id)?.options.find((o) => o.value === v)?.label ?? v,
  })
  return (
    <EmptyNote
      size="page"
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      }
    >
      No {nouns} match {text}
    </EmptyNote>
  )
}
