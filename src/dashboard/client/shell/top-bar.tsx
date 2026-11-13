import { Fragment, type ReactNode } from "react"
import { Link } from "wouter"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ProjectSelector } from "@/shell/project-selector"

/** One breadcrumb entry: a link, the project selector, or the current page. */
export type TopBarItem = { label: string; href: string } | { selector: true } | { label: string }

const isLink = (item: TopBarItem): item is { label: string; href: string } => "href" in item

/** Whether an entry stays below 640px: the current page and the project selector do; a link is hidden with the separator after it. */
const keptOnPhone = (item: TopBarItem): boolean => !isLink(item)

/**
 * The top bar each page renders as the first child of `main`: the sidebar toggle, a separator, the breadcrumb, then the
 * page's actions. With `heading` (the default), the current page's item is the page's `h1`.
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
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-center" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {items.map((item, i) => {
            const hidden = keptOnPhone(item) ? "" : "max-sm:hidden"
            return (
              <Fragment key={i}>
                {i > 0 ? <BreadcrumbSeparator className={keptOnPhone(items[i - 1] as TopBarItem) ? "" : "max-sm:hidden"} /> : null}
                <BreadcrumbItem className={`min-w-0 ${hidden}`}>
                  {"selector" in item ? (
                    <ProjectSelector />
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
    </header>
  )
}

/** The page wrapper below the top bar: it never scrolls; the page's `data-scroll-root` element does. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
}
