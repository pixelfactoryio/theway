import { createContext, Fragment, type ReactNode, useContext } from "react"
import { createPortal } from "react-dom"
import { Link } from "wouter"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { ProjectSelector } from "@/shell/project-selector"

/** The site header's slot `TopBar` renders into: `null` until the header is mounted. Provided by the shell. */
export const TopBarSlot = createContext<HTMLElement | null>(null)

/** One breadcrumb entry: a link, the project selector, a section's name (plain text), or the current page. */
export type TopBarItem = { label: string; href: string } | { selector: true } | { section: string } | { label: string }

const isLink = (item: TopBarItem): item is { label: string; href: string } => "href" in item

/**
 * Whether an entry stays below 640px: the current page and the project selector do; a link or a section is hidden with
 * the separator after it.
 */
const keptOnPhone = (item: TopBarItem): boolean => !isLink(item) && !("section" in item)

/**
 * The page's part of the site header, rendered into its slot: the breadcrumb, then the page's actions. Each page renders
 * it as the first child of `main`. With `heading` (the default), the current page's item is the page's `h1`.
 */
export function TopBar({
  items,
  actions,
  heading = true,
}: {
  items: TopBarItem[]
  actions?: ReactNode
  heading?: boolean
}) {
  const slot = useContext(TopBarSlot)
  if (slot === null) return null

  return createPortal(
    <>
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {items.map((item, i) => {
            const hidden = keptOnPhone(item) ? "" : "max-sm:hidden"
            return (
              <Fragment key={i}>
                {i > 0 ? (
                  <BreadcrumbSeparator className={keptOnPhone(items[i - 1] as TopBarItem) ? "" : "max-sm:hidden"}>/</BreadcrumbSeparator>
                ) : null}
                <BreadcrumbItem className={`min-w-0 ${hidden}`}>
                  {"selector" in item ? (
                    <ProjectSelector />
                  ) : "section" in item ? (
                    <span className="truncate text-muted-foreground">{item.section}</span>
                  ) : isLink(item) ? (
                    <BreadcrumbLink render={<Link href={item.href} />} className="truncate">
                      {item.label}
                    </BreadcrumbLink>
                  ) : heading ? (
                    <h1 className="min-w-0">
                      <BreadcrumbPage className="block truncate font-medium">{item.label}</BreadcrumbPage>
                    </h1>
                  ) : (
                    <BreadcrumbPage className="block truncate font-medium">{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {actions !== undefined ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </>,
    slot,
  )
}

/** The page wrapper below the top bar: it never scrolls; the page's `data-scroll-root` element does. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
}
