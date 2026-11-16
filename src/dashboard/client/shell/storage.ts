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
