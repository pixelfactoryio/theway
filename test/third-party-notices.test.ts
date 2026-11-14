import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectPackages } from "../scripts/third-party-notices";

const ROOT = join(import.meta.dirname, "..");
const notices = readFileSync(join(ROOT, "dist", "licenses", "THIRD-PARTY-NOTICES.txt"), "utf-8");
const blocks = notices.split(`\n${"-".repeat(80)}\n`);
const packages = collectPackages();

/** The notice block of a package, found by its header line. */
const blockOf = (name: string) => blocks.find((b) => b.trimStart().startsWith(`${name}@`));

test("the collected packages include the stylesheet's imports and plugin", () => {
  const imports = ["tailwindcss", "tw-animate-css", "shadcn", "@tailwindcss/typography"];
  expect(imports.filter((name) => !packages.includes(name))).toEqual([]);
});

test("every collected package has its header line", () => {
  const missing = packages.filter((name) => {
    const { version, license } = JSON.parse(readFileSync(join(ROOT, "node_modules", name, "package.json"), "utf-8"));
    return !notices.split("\n").includes(`${name}@${version} — ${license}`);
  });
  expect(missing).toEqual([]);
});

test("packages that ship no licence file say so", () => {
  for (const name of ["wouter", "react-remove-scroll-bar"]) {
    expect(blockOf(name)?.split("\n")).toContain("No licence file is included in the package.");
  }
});
