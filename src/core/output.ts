/**
 * The CLI's only writer to stdout and stderr in `src/core` and `src/install.ts`. Helpers return their results, errors
 * and warnings; only the command functions print them, through these functions.
 */

/** Writes `text` to stdout as given. */
export function print(text: string): void {
  process.stdout.write(text);
}

/** Writes `theway: <message>` to stderr and returns the exit code 1, so a command can `return error(…)`. */
export function error(message: string): number {
  process.stderr.write(`theway: ${message}\n`);
  return 1;
}

/** Writes `theway: warning: <message>` to stderr. */
export function warning(message: string): void {
  process.stderr.write(`theway: warning: ${message}\n`);
}

/** Writes `line` to stderr without a prefix: a line that follows an `error` or `warning` message and belongs to it. */
export function detail(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** Receives a warning about `file`. */
export type Warn = (file: string, text: string) => void;

/** Writes a warning line, `theway: warning: <file>: <text>; ignored`. */
export const warnLoud: Warn = (file, text) => {
  warning(`${file}: ${text}; ignored`);
};

/** Drops every warning. */
export const warnQuiet: Warn = () => {};
