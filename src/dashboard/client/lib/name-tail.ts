/** The most characters a name's tail keeps whole. */
const TAIL = 12

/**
 * The tail of `name` kept whole when the name is cut in the middle: its last part after its last `-`, `_`, `.` or `/`, or its
 * last 10 characters when that part is longer than 12. `""` when the name has no separator or is only its tail.
 */
export function nameTail(name: string): string {
  const cut = Math.max(name.lastIndexOf("-"), name.lastIndexOf("_"), name.lastIndexOf("."), name.lastIndexOf("/"))
  if (cut <= 0 || cut === name.length - 1) return ""
  const part = name.slice(cut + 1)
  return part.length <= TAIL ? part : name.slice(-10)
}
