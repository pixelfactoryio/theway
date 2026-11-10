import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Overlay } from "../src/core/io";
import { resolveWorkflowFile } from "../src/core/language";
import { parse, textOf } from "../src/dashboard/client/editor/ops";

const FIXTURE_HOME = join(import.meta.dirname, "fixtures", "home");

/** A home holding the fixture's workflows and prompts, and a project `p`. */
const HOME = (() => {
  const dir = mkdtempSync(join(tmpdir(), "theway-ops-"));
  for (const folder of ["workflows", "prompts"]) cpSync(join(FIXTURE_HOME, folder), join(dir, folder), { recursive: true });
  mkdirSync(join(dir, "projects", "p"), { recursive: true });
  return dir;
})();
afterAll(() => rmSync(HOME, { recursive: true, force: true }));

/** `text` with a full-line comment above each step and a comment at the end of each step's first line. */
function commented(text: string): string {
  let n = 0;
  return text
    .split("\n")
    .flatMap((line) => {
      const m = /^(\s*)- uses: /.exec(line);
      if (m === null) return [line];
      n += 1;
      return [`${m[1]}# before step ${n}`, `${line} # on step ${n}`];
    })
    .join("\n");
}

test("each fixture workflow, as is and commented, round-trips byte for byte and resolves through an overlay", () => {
  const names = readdirSync(join(FIXTURE_HOME, "workflows")).map((f) => f.slice(0, -".yaml".length));
  expect(names.length).toBe(4);
  for (const name of names) {
    const text = readFileSync(join(FIXTURE_HOME, "workflows", `${name}.yaml`), "utf-8");
    const copy = commented(text);
    expect(copy).toContain("# before step 1\n");
    expect(copy).toMatch(/- uses: prompts\/[a-z-]+\.md # on step 1\n/);
    for (const t of [text, copy]) {
      expect([name, textOf(parse(t))]).toEqual([name, t]);
      const overlay: Overlay = new Map([[join(HOME, "projects", "p", "workflows", `${name}.yaml`), t]]);
      const r = resolveWorkflowFile(HOME, "p", name, {}, overlay);
      expect([name, "errors" in r ? r.errors : []]).toEqual([name, []]);
    }
  }
});
