import { type LucideIcon, SearchXIcon } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import { Link } from "wouter"

import { Button } from "@/components/ui/button"
import { StateBlock, StateLoading } from "@/shell/state"
import { type Crumb, PageBody, PageHeader } from "@/shell/top-bar"

/** A page while its data loads: its header (its path when given), and after 400ms a Loading line in the one state shape. */
export function PageLoading({
  title,
  icon,
  parents,
  mono,
}: {
  title: string
  icon?: LucideIcon | ReactElement
  parents?: readonly Crumb[]
  /** The title is an item's ID or file name, in mono as its page's header gives it. */
  mono?: boolean
}) {
  return (
    <>
      <PageHeader title={title} icon={icon} parents={parents} mono={mono} />
      <PageBody>
        <StateLoading size="page" />
      </PageBody>
    </>
  )
}

/**
 * A page whose subject does not exist, the same on every page: its header, then, in the one state shape, the
 * not-found icon, `message` (an ID in it in mono at 12px) and a button back to `back.href`.
 */
export function PageUnknown({
  title,
  icon,
  parents,
  mono,
  message,
  back,
}: {
  title: string
  icon?: LucideIcon | ReactElement
  /** The path before the title, as the page's own header gives it. */
  parents?: readonly Crumb[]
  /** The title is an item's ID or file name, in mono as its page's header gives it. */
  mono?: boolean
  message: ReactNode
  back: { label: string; href: string }
}) {
  return (
    <>
      <PageHeader title={title} icon={icon} parents={parents} mono={mono} />
      <PageBody>
        <StateBlock
          size="page"
          icon={<SearchXIcon aria-hidden="true" className="text-muted-foreground" />}
          title={<span className="[&_code]:text-xs">{message}</span>}
          action={
            <Button variant="outline" size="xs" nativeButton={false} render={<Link href={back.href} />}>
              {back.label}
            </Button>
          }
        />
      </PageBody>
    </>
  )
}
