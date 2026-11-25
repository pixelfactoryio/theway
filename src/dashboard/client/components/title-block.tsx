import { CopyButton } from "@/components/copy"

/** A path in the code font, cut at the start when long, then its copy button (`CopyButton`, copying `what`). */
export function CopyPath({ value, what }: { value: string; what: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 flex-1 truncate font-mono text-xs [direction:rtl] text-left" title={value}>
        <bdi>{value}</bdi>
      </span>
      <CopyButton value={value} what={what} />
    </div>
  )
}
