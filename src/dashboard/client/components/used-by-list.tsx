import { Link } from "wouter"

import { EmptyNote } from "@/components/empty-note"
import { describeUse, type Use } from "@/lib/files"
import { to } from "@/lib/routes"

/** The workflows that use a prompt, each linking to its page; a note when none does. */
export function UsedByList({ uses, label }: { uses: readonly Use[]; label: (key: string) => string }) {
  if (uses.length === 0) return <EmptyNote>No workflow uses this prompt.</EmptyNote>
  return (
    <ul className="flex flex-col py-1">
      {uses.map((use, i) => (
        <li key={i}>
          <Link
            href={to.file("workflows", use.project, use.workflow)}
            className="block px-4 py-2 text-sm transition-colors hover:bg-accent"
          >
            {describeUse(use, label)}
          </Link>
        </li>
      ))}
    </ul>
  )
}
