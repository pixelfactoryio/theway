import { useSyncExternalStore } from "react"

/**
 * The root's size over the 16px it is at up to 1280px wide (`html` in `globals.css`): 1 there, 1.0625 at 1920, 1.125
 * from 2560. Sizes given in pixels at the 16px root (a grid's column, the canvas's cards) are multiplied by it, so they
 * grow with the text they hold, as a size in rem does. 1 without a DOM.
 */
export function rootScale(): number {
  if (typeof document === "undefined") return 1
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(size) && size > 0 ? size / 16 : 1
}

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener("resize", onChange)
  return () => window.removeEventListener("resize", onChange)
}

/** `rootScale()`, following the window as it resizes (the root's size follows the window's width). */
export function useRootScale(): number {
  return useSyncExternalStore(subscribe, rootScale, () => 1)
}
