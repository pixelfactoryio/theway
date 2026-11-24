import { cn } from "cn"
import { ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "wouter"

import { nameTail } from "@/lib/name-tail"
import { CutName } from "@/shell/cut-name"
import { ProjectMark } from "@/shell/project-mark"

/**
 * The lists of the dashboard (Now, a project's and a group's page, the archive, All projects), one kit for all: a
 * sticky column head, sections (`SectionBand`), and one-line 40px rows with no rule between them (the hover fill keeps the place), no
 * box, no zebra, no vertical rule. A row reads left to right: a 16px margin slot (a series' or a group's chevron, so
 * every name starts on one edge), the status icon, the human-readable name, its ID in grey mono and its chips, then
 * fixed columns at the right (`ListColumn`), the last one ending on the 16px gutter.
 */

/** A fixed column at a row's right: its title in the head, its width, its alignment, from which width it shows. */
export type ListColumn = {
  id: string
  title: string
  /** Width and visibility classes, the same on the head's title and on every row's cell (`w-32 hidden lg:flex`). */
  className: string
  align?: "start" | "end"
}

/** The widths of the columns the change lists and All projects share. */
export const COLUMN = {
  project: "w-32 hidden lg:flex xl:w-48",
  progress: "w-24",
  /** An age (`5m`, `3d`). */
  updated: "w-16 tabular-nums",
  /** An age or a date (`2026-11-03`), on a list that holds archived changes. */
  date: "w-28 tabular-nums",
  count: "w-24 hidden sm:flex tabular-nums",
  actions: "w-20",
} as const

const cell = (column: ListColumn) =>
  cn(
    "flex shrink-0 items-center whitespace-nowrap",
    column.align === "end" && "justify-end text-right",
    column.className,
  )

/**
 * A list's column head: 32px, its titles in `text-xs` (14px) secondary ink over a hairline, sticky at the top of the list's scroll
 * root (the sections' bands stick under it). `name` titles the name column, which starts where rows' names do.
 */
export function ListHead({ name, columns }: { name: string; columns: readonly ListColumn[] }) {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 z-20 flex h-8 items-center gap-3 border-b bg-background px-4 text-xs text-muted-foreground"
    >
      <span className="w-4 shrink-0" />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="w-3.5 shrink-0" />
        <span className="truncate">{name}</span>
      </span>
      {columns.map((c) => (
        <span key={c.id} className={cell(c)}>
          {c.title}
        </span>
      ))}
    </div>
  )
}

/**
 * The rows of a list (a section's, or a list without sections), named `label` for assistive technology. On its own it
 * is walked by J/K and the arrows (`data-nav-list`); inside a `NavList` (`nav={false}`), the walk is the page's.
 */
export function ListRows({ label, nav = true, children }: { label: string; nav?: boolean; children: ReactNode }) {
  return (
    <ul data-nav-list={nav ? "" : undefined} aria-label={label} className="flex flex-col">
      {children}
    </ul>
  )
}

/**
 * The walk of a page's whole list across its sections: J/K and the arrows move from a section's last row to the next
 * section's first, skipping closed sections.
 */
export function NavList({ children }: { children: ReactNode }) {
  return <div data-nav-list="">{children}</div>
}

/**
 * A row's head: what opens it, the row's whole surface (its `::after` covers the row), carrying `data-nav-item` for
 * J/K and Enter. A link to `href`, or, with `onToggle`, a button that opens or closes the row's members
 * (`expanded`). Its focus shows on the whole row (`ListRow`).
 */
export type RowHead = { href: string } | { onToggle: () => void; expanded: boolean }

/**
 * What holds a row's lead (a link): a lead that is an ID's chip (`IdName`) keeps room for the chip's least characters
 * (`idChipLeast`, at most a 16-character tail, 3 of the head and the ellipsis).
 */
export const ID_LEAD = "has-[[data-id-chip]]:min-w-[calc(20ch+1rem)]"

const HEAD = `min-w-0 truncate font-medium text-foreground outline-none after:absolute after:inset-0 lg:max-w-[60ch] ${ID_LEAD}`

/**
 * One row of a list: 40px, its name at 500, the hover fill and the focus ring on the whole row; `head` opens it
 * (the name, `children`, is its text). `lead` stands in the margin slot (a chevron); `icon` is the status icon;
 * `member` indents a member of an opened row by 24px. `meta` follows the name (an ID, chips); `cells` are the fixed
 * columns, in the head's order; `actions` (buttons) stand above the head's surface, at most two. A `current` row (the
 * page shown, in a list of its siblings) is on the selection's tint, its link marked as the current page.
 */
export function ListRow({
  head,
  children,
  icon,
  meta,
  cells,
  member = false,
  current = false,
  title,
}: {
  head: RowHead
  children: ReactNode
  icon?: ReactNode
  meta?: ReactNode
  cells: readonly { column: ListColumn; content: ReactNode }[]
  member?: boolean
  current?: boolean
  title?: string
}) {
  const toggle = "onToggle" in head
  return (
    <li
      className={cn(
        "relative flex h-10 items-center gap-3 px-4 transition-colors hover:bg-accent has-[[data-nav-item]:focus-visible]:bg-accent has-[[data-nav-item]:focus-visible]:ring-2 has-[[data-nav-item]:focus-visible]:ring-ring has-[[data-nav-item]:focus-visible]:ring-inset",
        current && "bg-selected hover:bg-selected",
      )}
    >
      <span aria-hidden="true" className="flex w-4 shrink-0 items-center justify-center text-muted-foreground">
        {toggle ? (
          <ChevronRightIcon className={cn("size-3.5 transition-transform", head.expanded && "rotate-90")} />
        ) : null}
      </span>
      <span className={cn("flex min-w-0 flex-1 items-center gap-2", member && "pl-6")}>
        {icon}
        {toggle ? (
          <button
            type="button"
            data-nav-item=""
            aria-expanded={head.expanded}
            onClick={head.onToggle}
            title={title}
            className={cn(HEAD, "text-left")}
          >
            {children}
          </button>
        ) : (
          <Link
            href={head.href}
            data-nav-item=""
            title={title}
            aria-current={current ? "page" : undefined}
            className={HEAD}
          >
            {children}
          </Link>
        )}
        {meta}
      </span>
      {cells.map(({ column, content }) => (
        <span key={column.id} className={cn(cell(column), "text-xs text-muted-foreground")}>
          {content}
        </span>
      ))}
    </li>
  )
}

/** The fewest characters a chip shows: an ID this long or shorter is never cut. */
const SHORT_ID = 10

/** The characters of an ID's head a cut chip keeps before its ellipsis and its tail. */
const HEAD_KEPT = 3

/**
 * The fewest characters of `id` its chip shows: the whole ID when it is short, else at least 10, and enough for its
 * tail (`nameTail`), the head's first characters and the ellipsis, so a cut ID still names itself.
 */
export const idChipLeast = (id: string): number =>
  Math.min(id.length, Math.max(SHORT_ID, nameTail(id).length + HEAD_KEPT + 1))

/**
 * An ID, the one chip of every ID set inline (a row's, a row led by its ID, the panel's Details and Series): Geist Mono
 * `text-xs` (14px) at 400 in the ink, on the band's tint, 6px corners, 24px tall, as every other ID in mono. When it does not fit
 * it is cut in the middle (`CutName`), its distinct tail kept, so `add-agent-runner` and `add-agent-store` still differ
 * when cut; it never shows fewer characters than `idChipLeast`: under 1024px the name beside it gives way first; from
 * 1024px, where a name stops at 60 characters, it shows whole.
 */
export function IdChip({ children, className }: { children: string; className?: string }) {
  // An ID that fits in 10 characters is never cut, and its chip is no wider than it.
  const short = children.length <= SHORT_ID
  return (
    <span
      data-id-chip=""
      style={short ? undefined : { minWidth: `calc(${idChipLeast(children)}ch + 1rem)` }}
      className={cn(
        "inline-flex h-6 max-w-full items-center overflow-hidden rounded-md bg-band px-2 align-middle font-mono text-xs font-normal text-foreground",
        short && "shrink-0",
        className,
      )}
    >
      <CutName name={children} />
    </span>
  )
}

/** An ID after a row's name (`IdChip`): under 1024px it is cut down to 10 characters as the name gives way. */
export function RowId({ children }: { children: string }) {
  return <IdChip className="lg:max-w-none lg:shrink-0">{children}</IdChip>
}

/**
 * A row whose name is its ID (a series, an archived change, a file with no description): the ID's chip (`IdChip`) in
 * the name's place, so the names of a list still start on one edge.
 */
export function IdName({ children }: { children: string }) {
  return <IdChip>{children}</IdChip>
}

/**
 * A small label after a row's name (`series · 7`, `default`): plain `text-xs` (14px) text in the secondary ink. A `wide` label shows
 * from 1024px only, leaving its room to the name and the ID below that.
 */
export function RowChip({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <span className={cn("shrink-0 text-xs whitespace-nowrap text-muted-foreground", wide && "hidden lg:inline")}>
      {children}
    </span>
  )
}

/** A project in a row's project column: its coloured mark and its name, `text-xs` (14px) in the ink, 22px tall, no outline. */
export function ProjectChip({ label }: { label: string }) {
  return (
    <span className="inline-flex h-5.5 max-w-full min-w-0 items-center gap-1 text-xs text-foreground">
      <ProjectMark label={label} className="size-3" />
      <CutName name={label} />
    </span>
  )
}

/** A row's actions, above its head's surface so their clicks stay theirs: at most two buttons, seen at rest. */
export function RowActions({ children }: { children: ReactNode }) {
  return <span className="relative z-10 flex items-center justify-end gap-0.5">{children}</span>
}
