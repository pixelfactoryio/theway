/** Whether the platform is Apple's: ⌘ then, Ctrl elsewhere. Read from `navigator.platform`, as CodeMirror resolves `Mod-`. */
export const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
