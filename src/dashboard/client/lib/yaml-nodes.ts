/** The YAML node reads the workflow edits and the panels' forms share. Pure: no React, no DOM. */
import { isScalar, type Pair, type YAMLMap } from "yaml"

/** A node holding nothing: a missing value, or a null scalar (`key:`, `key: ~`, `key: null`). */
export const isNull = (node: unknown): boolean => node === null || (isScalar(node) && node.value === null)

/** A map's value node for `key`; `undefined` when absent. */
export const node = (map: YAMLMap, key: string): unknown => map.get(key, true) as unknown

/** The string a map key reads as. */
export const keyOf = (pair: Pair): string => String(isScalar(pair.key) ? pair.key.value : pair.key)
