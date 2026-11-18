/** Whether the platform is Apple's: ⌘ then, Ctrl elsewhere. Read from `navigator.platform`, as CodeMirror resolves `Mod-`. */
export const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

/** The modifier key's name, for shortcut hints. */
export const MOD = MAC ? "⌘" : "Ctrl"

/** Whether a key event holds the modifier key: ⌘ on macOS, Ctrl elsewhere. */
export const modKey = (event: { metaKey: boolean; ctrlKey: boolean }): boolean => (MAC ? event.metaKey : event.ctrlKey)

/** A shortcut as one line of text: `⌘S` on macOS, `Ctrl+S` elsewhere, for keys given as `[MOD, "S"]`. */
export const shortcutText = (keys: readonly string[]): string => keys.join(MAC ? "" : "+")
