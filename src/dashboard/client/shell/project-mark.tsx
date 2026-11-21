import { cn } from "cn"
import { FolderIcon, FoldersIcon } from "lucide-react"

import { projectHue } from "@/lib/project-hue"

/**
 * A project's mark: its folder (a group's folders), filled with a tint of the project's hue and drawn in it, the same
 * hue wherever the project shows.
 */
export function ProjectMark({
  label,
  group = false,
  className,
}: {
  label: string
  group?: boolean
  className?: string
}) {
  const Icon = group ? FoldersIcon : FolderIcon
  return (
    <Icon
      aria-hidden="true"
      fill="currentColor"
      fillOpacity={0.18}
      className={cn("size-3.5 shrink-0", projectHue(label), className)}
    />
  )
}
