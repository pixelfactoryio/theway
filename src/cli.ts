#!/usr/bin/env node
import { buildProgram } from "./program";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  process.stderr.write(`theway requires Node.js 22.12 or later (found v${process.versions.node})\n`);
  process.exit(1);
}
buildProgram().parse();
