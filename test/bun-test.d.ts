declare module "bun:test" {
  export function test(name: string, fn: () => void | Promise<void>, timeout?: number): void;
  export namespace test {
    function skipIf(condition: boolean): (name: string, fn: () => void | Promise<void>, timeout?: number) => void;
  }
  export function afterEach(fn: () => void): void;
  export function expect(actual: unknown): any;
}

declare const Bun: {
  YAML: { parse(text: string): unknown };
};
