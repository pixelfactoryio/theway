import type { ReactNode } from "react"
import { Link } from "wouter"

import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { PageBody, PageHeader } from "@/shell/top-bar"

/** A page while its data loads: its header over an empty body. */
export function PageLoading({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <PageBody>{null}</PageBody>
    </>
  )
}

/** A page whose subject does not exist: its header, then `message` and a button back to `back.href`. */
export function PageUnknown({
  title,
  message,
  back,
}: {
  title: string
  message: ReactNode
  back: { label: string; href: string }
}) {
  return (
    <>
      <PageHeader title={title} />
      <PageBody>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{message}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" render={<Link href={back.href} />}>
              {back.label}
            </Button>
          </EmptyContent>
        </Empty>
      </PageBody>
    </>
  )
}
