/** The error boundaries' reset rule. Pure: no React, no DOM. */

/** Whether a boundary showing an error clears it: only when its reset key changed (another path for the page boundary). */
export function resetOnKeyChange(prev: string | undefined, next: string | undefined, hasError: boolean): boolean {
  return hasError && prev !== next;
}
