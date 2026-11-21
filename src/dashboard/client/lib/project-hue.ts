/**
 * A project's colour: one of seven hues, picked from its label so it is the same wherever the project shows (its chip
 * in a row, its sidebar row, its row in All projects). None is the blue (selection) or a status colour (red, amber,
 * green). The classes are written out whole so the stylesheet keeps them.
 */
const HUES = [
  "text-project-1",
  "text-project-2",
  "text-project-3",
  "text-project-4",
  "text-project-5",
  "text-project-6",
  "text-project-7",
] as const

export function projectHue(label: string): (typeof HUES)[number] {
  let h = 0
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return HUES[h % HUES.length] ?? HUES[0]
}
