import { Kbd, KbdGroup } from "@/components/ui/kbd"

/** A shortcut's keys, one key cap each (`[MOD, "K"]`: ⌘ K on macOS, Ctrl K elsewhere). */
export function Shortcut({ keys, className }: { keys: readonly string[]; className?: string }) {
  return (
    <KbdGroup className={className}>
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </KbdGroup>
  )
}
