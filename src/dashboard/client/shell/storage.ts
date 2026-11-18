import { useCallback, useState } from "react"

import type { Codec } from "@/lib/preferences"

/**
 * This browser's `localStorage`, never throwing: without storage (a private window, blocked site data) a read gives
 * `null` and a write does nothing, so a choice still applies to the page.
 */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Keeps `value` under `key`; `null` removes the key. */
export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Without storage the choice still applies to this page.
  }
}

/**
 * A choice kept in this browser under `key`, read through `codec` when the component mounts and again when `key`
 * changes; the setter applies a choice and keeps it (a `null` format removes the key).
 */
export function useStored<T>(key: string, codec: Codec<T>): [T, (next: T) => void] {
  const [state, setState] = useState<{ key: string; value: T }>(() => ({ key, value: codec.parse(readStored(key)) }))
  // Another key in the same component: read that key's choice.
  const value = state.key === key ? state.value : codec.parse(readStored(key))
  if (state.key !== key) setState({ key, value })
  const set = useCallback(
    (next: T) => {
      setState({ key, value: next })
      writeStored(key, codec.format(next))
    },
    [key, codec],
  )
  return [value, set]
}
