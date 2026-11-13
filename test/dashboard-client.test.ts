import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { byLabel, changesPath, currentKey, type Project } from "../src/dashboard/client/lib/projects";
import { locationAction } from "../src/dashboard/client/lib/location";
import { addressOf, ScrollMemory } from "../src/dashboard/client/lib/scroll";
import { dataTheme, themeOf } from "../src/dashboard/client/lib/theme";

const REPO = join(import.meta.dirname, "..");
const CLIENT = join(REPO, "src", "dashboard", "client");
/** The installed folders, kept as the shadcn CLI writes them. */
const INSTALLED = ["components/ui", "components/reui", "hooks"];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
}

/** The client's own source files: every `.ts`/`.tsx` outside the installed folders. */
const own = files(CLIENT)
  .filter((f) => /\.tsx?$/.test(f))
  .filter((f) => !INSTALLED.some((d) => relative(CLIENT, f).startsWith(`${d}/`)));

const SPACING = "-?(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)";
const PALETTE =
  "(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)";
const COLOR_UTILITIES = "(?:text|bg|border|border-[trblxyse]|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|accent|caret|shadow|placeholder)";

/** The style rules a class token breaks, empty when it breaks none. */
function violations(token: string): string[] {
  const utility = token.split(":").pop() as string;
  const found: string[] = [];
  if (new RegExp(`^${SPACING}-\\[`).test(utility)) found.push("arbitrary spacing");
  const step = new RegExp(`^${SPACING}-(\\d+\\.\\d+)$`).exec(utility)?.[1];
  if (step !== undefined && step !== "0.5") found.push("fractional spacing");
  if (/^text-\[[\d.]+(?:px|rem|em)\]$/.test(utility) || /^text-(?:2xs|xxs|3xs)$/.test(utility)) found.push("text size");
  if (new RegExp(`^${COLOR_UTILITIES}-(?:${PALETTE}-\\d{2,3}|black|white)(?:/\\d+)?$`).test(utility)) found.push("palette colour");
  if (utility === "transition-all") found.push("transition-all");
  return found;
}

/** Every class token of a source: the words of its string literals that look like utilities. */
const tokens = (text: string): string[] =>
  [...text.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)].flatMap((m) => (m[2] as string).split(/\s+/)).filter((t) => t !== "");

test("the style rules reject what they must", () => {
  for (const bad of ["p-[3px]", "-mt-[2px]", "gap-2.5", "py-3.5", "md:p-1.5", "text-[11px]", "text-[0.7rem]", "text-red-500", "hover:bg-blue-100", "transition-all", "border-zinc-200/50"]) {
    expect([bad, violations(bad).length > 0]).toEqual([bad, true]);
  }
  for (const good of ["p-0.5", "gap-2", "-mx-2", "text-xs", "text-muted-foreground", "bg-sidebar-accent", "transition-colors", "max-w-64"]) {
    expect([good, violations(good)]).toEqual([good, []]);
  }
});

test("the client's own files follow the style rules", () => {
  expect(own.length).toBeGreaterThan(5);
  const broken = own.flatMap((f) =>
    tokens(readFileSync(f, "utf-8"))
      .map((t) => ({ file: relative(REPO, f), token: t, rules: violations(t) }))
      .filter((v) => v.rules.length > 0),
  );
  expect(broken).toEqual([]);
});

test("the client's helpers import neither React, the DOM nor the @/ alias", () => {
  for (const f of files(join(CLIENT, "lib"))) {
    const imports = [...readFileSync(f, "utf-8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect([relative(REPO, f), imports.filter((i) => i === "react" || i?.startsWith("react-") || i?.startsWith("@/"))]).toEqual([relative(REPO, f), []]);
  }
});

const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf-8")) as {
  dependencies?: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** The packages the dashboard adds, at the versions the spec pins. */
const ADDED: Record<string, string> = {
  hono: "4.13.18",
  "@hono/node-server": "2.1.8",
  react: "19.3.1",
  "react-dom": "19.3.1",
  wouter: "3.13.0",
  "@tanstack/react-query": "5.107.1",
  tailwindcss: "4.3.5",
  "@tailwindcss/cli": "4.3.5",
  "tw-animate-css": "1.4.0",
  "@base-ui/react": "1.9.0",
  "class-variance-authority": "0.7.1",
  cn: "0.5.2",
  "lucide-react": "1.72.0",
  shadcn: "4.23.0",
  "@fontsource-variable/inter": "5.3.0",
  "@fontsource-variable/jetbrains-mono": "5.3.0",
  "@types/react": "19.3.0",
  "@types/react-dom": "19.3.0",
  cmdk: "1.1.1",
  "@tanstack/react-table": "9.3.1",
  "react-resizable-panels": "4.21.0",
  "react-markdown": "10.1.0",
  "remark-gfm": "4.0.1",
  "@tailwindcss/typography": "0.5.20",
  "@codemirror/state": "6.7.6",
  "@codemirror/view": "6.43.15",
  "@codemirror/language": "6.13.1",
  "@codemirror/commands": "6.11.1",
  "@codemirror/search": "6.7.2",
  "@codemirror/lang-yaml": "6.1.3",
  "@codemirror/lang-markdown": "6.5.2",
  "@codemirror/lint": "6.9.7",
  "@lezer/highlight": "1.2.5",
  "@panzoom/panzoom": "4.6.2",
  diff: "9.0.0",
  "@codemirror/merge": "6.12.3",
  "@dnd-kit/core": "6.3.1",
  "@dnd-kit/sortable": "10.0.0",
  "@dnd-kit/utilities": "3.2.2",
};

test("every package the dashboard adds is a devDependency at its exact version, none a dependency", () => {
  expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  // The code view builds its own extension set: no `codemirror` package, so no `basicSetup`.
  expect(pkg.devDependencies.codemirror).toBeUndefined();
  // `sortable` imports no modifiers.
  expect(pkg.devDependencies["@dnd-kit/modifiers"]).toBeUndefined();
  for (const [name, version] of Object.entries(ADDED)) expect([name, pkg.devDependencies[name]]).toEqual([name, version]);
  // Every other devDependency predates the dashboard.
  const others = Object.keys(pkg.devDependencies).filter((n) => !(n in ADDED));
  expect(others.sort()).toEqual(["@clack/prompts", "@types/node", "commander", "markdownlint-cli2", "typescript", "yaml"]);
});

test("every runtime package the client adds is imported by a kept file", () => {
  const sources = files(CLIENT)
    .filter((f) => /\.(tsx?|css)$/.test(f))
    .map((f) => readFileSync(f, "utf-8"))
    .join("\n");
  for (const name of ["react", "react-dom", "wouter", "@tanstack/react-query", "@base-ui/react", "class-variance-authority", "cn", "lucide-react", "cmdk", "tw-animate-css", "shadcn", "tailwindcss", "@tanstack/react-table", "react-resizable-panels", "react-markdown", "remark-gfm", "@tailwindcss/typography", "@codemirror/state", "@codemirror/view", "@codemirror/language", "@codemirror/commands", "@codemirror/search", "@codemirror/lang-yaml", "@codemirror/lang-markdown", "@codemirror/lint", "@lezer/highlight", "@panzoom/panzoom", "@codemirror/merge", "@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"]) {
    expect([name, new RegExp(`["']${name.replace("/", "\\/")}(?:/[^"']*)?["']`).test(sources)]).toEqual([name, true]);
  }
});

const p = (key: string, label: string, active = 0): Project => ({ key, label, active });

test("projects sort by label with localeCompare en base, ties by key", () => {
  const list = [p("-b", "Tower"), p("-z", "theway"), p("-a", "theway"), p("-c", "alpha")];
  expect(byLabel(list).map((x) => x.key)).toEqual(["-c", "-a", "-z", "-b"]);
});

test("the current project is the route's, else the stored, else start, else the first by label", () => {
  const list = { projects: [p("-t", "Tower"), p("-w", "theway"), p("-s", "start")], start: "-s" };
  expect(currentKey(list, "-t", "-w")).toBe("-t");
  expect(currentKey(list, "-gone", "-w")).toBe("-w");
  expect(currentKey(list, null, "-gone")).toBe("-s");
  expect(currentKey({ ...list, start: null }, null, null)).toBe("-s");
  expect(currentKey({ projects: [p("-t", "Tower"), p("-w", "theway")], start: null }, null, null)).toBe("-w");
  expect(currentKey({ projects: [], start: null }, "-x", "-y")).toBeNull();
  expect(changesPath("-w")).toBe("/-w/changes?");
});

test("the theme is light or dark when stored, else System with no data-theme", () => {
  expect([themeOf("light"), themeOf("dark"), themeOf(null), themeOf("blue")]).toEqual(["light", "dark", "system", "system"]);
  expect([dataTheme("light"), dataTheme("dark"), dataTheme("system")]).toEqual(["light", "dark", null]);
});

test("scroll offsets are kept per address and restored only on Back and Forward", () => {
  const memory = new ScrollMemory();
  const a = addressOf("?q=foo", "#/k/changes");
  memory.save(a, 120);
  memory.navigate(addressOf("", "#/workflows"), false);
  expect(memory.pending).toBeNull();
  memory.navigate(a, true);
  expect(memory.pending).toEqual({ address: a, top: 120 });
  memory.navigate(addressOf("", "#/prompts"), false);
  expect(memory.pending).toBeNull();
  memory.navigate(addressOf("", "#/unseen"), true);
  expect(memory.pending).toEqual({ address: "#/unseen", top: 0 });
});

test("the router takes its own navigation, each Back or Forward once, with or without a search part, and asks before leaving unsaved changes", () => {
  const at = "http://h/?view=archived#/k/changes";
  const row = "http://h/#/k/changes/archive/2026-01-01-a";
  // A search part differs: Back fires popstate alone, which renders the address.
  expect(locationAction({ own: false, href: at, acceptedHref: row, blocked: false })).toBe("accept");
  // The fragment alone differs: popstate, then hashchange on the address already taken.
  expect(locationAction({ own: false, href: "http://h/#/k/changes", acceptedHref: row, blocked: false })).toBe("accept");
  expect(locationAction({ own: false, href: "http://h/#/k/changes", acceptedHref: "http://h/#/k/changes", blocked: false })).toBe("seen");
  expect(locationAction({ own: true, href: row, acceptedHref: at, blocked: true })).toBe("own");
  expect(locationAction({ own: false, href: at, acceptedHref: row, blocked: true })).toBe("ask");
  // Undone to the accepted address, the traversal's later hashchange finds nothing to do.
  expect(locationAction({ own: false, href: row, acceptedHref: row, blocked: false })).toBe("seen");
  const guard = readFileSync(join(CLIENT, "shell", "guard.ts"), "utf-8");
  expect(guard).toContain('addEventListener("popstate", onLocationEvent)');
  expect(guard).toContain('addEventListener("hashchange", onLocationEvent)');
  const scroll = readFileSync(join(CLIENT, "shell", "scroll.tsx"), "utf-8");
  expect(scroll).not.toMatch(/addEventListener\("(popstate|hashchange)"/);
});

test("the lint gutter's error mark is a destructive dot drawn in CSS, with no image", () => {
  const text = readFileSync(join(CLIENT, "components", "code-view.tsx"), "utf-8");
  expect(text).toContain('".cm-lint-marker-error": { content: "normal", borderRadius: "50%", backgroundColor: "var(--destructive)" }');
  expect(text).not.toMatch(/data:image|url\(/);
});

test("the code view holds its own extension set, read-only through EditorState.readOnly, with the page's nonce", () => {
  const text = readFileSync(join(CLIENT, "components", "code-view.tsx"), "utf-8");
  expect(text).not.toMatch(/basicSetup|minimalSetup|from "codemirror"|EditorView\.editable/);
  expect(text).toContain("EditorState.readOnly.of(true)");
  expect(text).toContain("EditorView.cspNonce.of(nonce())");
  expect(text).toContain('meta[name="theway-nonce"]');
});

test("the five syntax colours are defined light and dark", () => {
  const css = readFileSync(join(CLIENT, "styles", "globals.css"), "utf-8");
  const light = { keyword: "#cf222e", string: "#0a3069", constant: "#0550ae", property: "#116329", comment: "#6e7781" };
  const dark = { keyword: "#ff7b72", string: "#a5d6ff", constant: "#79c0ff", property: "#7ee787", comment: "#8b949e" };
  for (const [k, v] of Object.entries(light)) expect(css.split(`--code-${k}: ${v};`).length - 1).toBe(1);
  for (const [k, v] of Object.entries(dark)) expect(css.split(`--code-${k}: ${v};`).length - 1).toBe(2);
});
