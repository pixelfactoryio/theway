import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";

/** Copies the shipped config, standards and templates into `home`. */
export function init(src: string, home: string): number {
  try {
    mkdirSync(home, { recursive: true });
    copyFileSync(`${src}/config.yaml`, `${home}/config.default.yaml`);
    if (existsSync(`${home}/config.yaml`)) {
      process.stdout.write("Kept existing config.yaml (shipped defaults: config.default.yaml)\n");
    } else {
      copyFileSync(`${src}/config.yaml`, `${home}/config.yaml`);
    }
    cpSync(`${src}/data/standards`, `${home}/data/standards`, { recursive: true });
    cpSync(`${src}/templates`, `${home}/templates`, { recursive: true });
  } catch (e) {
    process.stderr.write(`theway: ${(e as Error).message}\n`);
    return 1;
  }
  process.stdout.write(`Initialized ${home}\n`);
  return 0;
}
