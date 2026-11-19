import { expect, test } from "bun:test"
import {
  type Codec,
  COLLAPSED,
  DIFF_LAYOUT,
  type DiffLayout,
  GROUP_OPEN,
  PANE_TAB,
  PANEL_DOCKED,
  panelWidthCodec,
  sidebarCodec,
} from "../src/dashboard/client/lib/preferences"

/** Each value written then read back gives it again. */
const roundTrips = <T>(codec: Codec<T>, values: readonly T[]) => {
  for (const v of values) expect(codec.parse(codec.format(v))).toEqual(v)
}

test("the sidebar is open by the window's width with nothing stored, else unless closed", () => {
  const wide = sidebarCodec(() => true)
  const narrow = sidebarCodec(() => false)
  expect(wide.parse(null)).toBe(true)
  expect(narrow.parse(null)).toBe(false)
  expect([wide.format(true), wide.format(false)]).toEqual(["open", "closed"])
  roundTrips(wide, [true, false])
  roundTrips(narrow, [true, false])
  expect(narrow.parse("x")).toBe(true)
})

test("the panel is docked unless hidden, and shown removes the key", () => {
  expect(PANEL_DOCKED.parse(null)).toBe(true)
  expect([PANEL_DOCKED.format(true), PANEL_DOCKED.format(false)]).toEqual([null, "hidden"])
  roundTrips(PANEL_DOCKED, [true, false])
  expect(PANEL_DOCKED.parse("x")).toBe(true)
})

test("the panel's width is kept in pixels, and a missing or out-of-range value gives the default", () => {
  const width = panelWidthCodec(320, 640, 420)
  expect(width.parse(null)).toBe(420)
  roundTrips(width, [320, 420, 521, 640])
  expect(width.format(520.6)).toBe("521")
  // A share of the window (an earlier layout), a width outside the range, and anything else.
  expect(["41.708", "200", "800", "wide", ""].map((raw) => width.parse(raw))).toEqual([420, 420, 420, 420, 420])
})

test("a sidebar group is unchosen with nothing stored, else open only when open", () => {
  expect(GROUP_OPEN.parse(null)).toBeNull()
  expect([GROUP_OPEN.format(null), GROUP_OPEN.format(true), GROUP_OPEN.format(false)]).toEqual([null, "open", "closed"])
  roundTrips(GROUP_OPEN, [null, true, false])
  expect(GROUP_OPEN.parse("x")).toBe(false)
})

test("a page's collapsed groups are none with nothing stored or a bad value, else as stored", () => {
  expect(COLLAPSED.parse(null)).toEqual({})
  roundTrips(COLLAPSED, [{}, { ready: true, "archive:2026-10": false }])
  expect(COLLAPSED.parse("x")).toEqual({})
})

test("the diff layout is unified unless split", () => {
  expect(DIFF_LAYOUT.parse(null)).toBe("unified")
  roundTrips<DiffLayout>(DIFF_LAYOUT, ["unified", "split"])
  expect(DIFF_LAYOUT.parse("x")).toBe("unified")
})

test("a pane's tab is the stored value", () => {
  expect(PANE_TAB.parse(null)).toBeNull()
  roundTrips(PANE_TAB, [null, "inputs", "details"])
  expect(PANE_TAB.parse("x")).toBe("x")
})
