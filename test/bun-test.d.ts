declare module "bun:test" {
  export function test(name: string, fn: () => void | Promise<void>, timeout?: number): void
  export namespace test {
    function skipIf(condition: boolean): (name: string, fn: () => void | Promise<void>, timeout?: number) => void
  }
  export function afterEach(fn: () => void): void
  export function afterAll(fn: () => void): void
  export function expect(actual: unknown): Matchers
  /** The matchers the tests use. */
  interface Matchers {
    not: Matchers
    toBe(expected: unknown): void
    toBeDefined(): void
    toBeGreaterThan(expected: number | bigint): void
    toBeInstanceOf(expected: unknown): void
    toBeLessThan(expected: number | bigint): void
    toBeNull(): void
    toBeUndefined(): void
    toContain(expected: unknown): void
    toEndWith(expected: string): void
    toEqual(expected: unknown): void
    toHaveLength(expected: number): void
    toMatch(expected: string | RegExp): void
    toMatchObject(expected: object): void
    toStartWith(expected: string): void
  }
}

declare const Bun: {
  YAML: { parse(text: string): unknown }
}
