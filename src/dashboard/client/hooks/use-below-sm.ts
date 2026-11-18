import { useSyncExternalStore } from "react"

/** Below Tailwind's `sm` (640px): a phone. */
const BELOW_SM = "(width < 40rem)"

/** Whether the screen is below `sm`, following it as it changes. */
export function useBelowSm(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(BELOW_SM)
      query.addEventListener("change", onChange)
      return () => query.removeEventListener("change", onChange)
    },
    () => window.matchMedia(BELOW_SM).matches,
  )
}
