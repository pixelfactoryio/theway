#!/usr/bin/env node
import { escaped } from "./core/text";
import { buildProgram } from "./program";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  process.stderr.write(`theway requires Node.js 22.12 or later (found v${process.versions.node})\n`);
  process.exit(1);
}
// An error a command's action did not catch: one line, no stack.
buildProgram()
  .parseAsync()
  .catch((e: unknown) => {
    process.stderr.write(`theway: ${escaped(e instanceof Error ? e.message : String(e))}\n`);
    process.exitCode = 1;
  });
