import type { HTMLAttributes } from 'react'
import './Bar.css'

/* Copied from Stageshow's kit/window.tsx (MIT): Bar alone, the skeleton line. */

const INK = ['var(--ss-ink-1)', 'var(--ss-ink-2)', 'var(--ss-ink-3)', 'var(--ss-ink-4)', 'var(--ss-ink-5)']

export interface BarProps extends HTMLAttributes<HTMLSpanElement> {
  w: number | string
  h?: number
  /** 1 (faintest) to 5. */
  tone?: 1 | 2 | 3 | 4 | 5
  r?: number
  /** A line gives way in a narrow row as text would. Defaults to on for lines (w > 3h); a dot or a percentage width keeps its size. */
  shrink?: boolean
}

/** A placeholder: a line of text, a value, an icon slot or a pill. A line
 * gives way in a narrow row as text would; where it fits, it is exactly `w`. */
export function Bar({ w, h = 6, tone = 3, r = 2, shrink, className, style, ...rest }: BarProps) {
  const gives = shrink ?? (typeof w === 'number' && w > h * 3)
  return <span {...rest} className={`ss-bar${className ? ` ${className}` : ''}`} data-shrink={gives || undefined} style={{ width: w, height: h, borderRadius: r, background: INK[tone - 1], ...style }} />
}
