import { CHANGE_FILE, checkRead, issueLines } from "./change";
import { thewayHome } from "./io";
import { invalidChangeId } from "./path";
import { resolveKey } from "./project";
import { StoreError } from "./store";
import { fileStore } from "./store/files";

function localDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `theway archive <change-id> [--project <key>] [--force]`: moves a change to `changes/archive/<date>-<change-id>`. */
export function cmdArchive(changeId: string, override: string | undefined, force: boolean): number {
  const key = resolveKey(override);
  if (key === null) return 1;
  if (invalidChangeId(changeId)) return 1;
  const store = fileStore(thewayHome());
  const change = { kind: "active", id: changeId } as const;
  const date = localDate();
  const target = { kind: "archived", ref: store.archiveRef(key, changeId, date) } as const;
  const taken = (): number => {
    process.stderr.write(`Error: ${store.dirOf(key, target)} already exists — not archiving.\n`);
    return 1;
  };
  if (!store.exists(key, change)) {
    process.stderr.write(`Error: ${store.dirOf(key, change)} not found\n`);
    return 1;
  }
  if (store.exists(key, target)) return taken();

  const c = checkRead(store.readFile(key, change, CHANGE_FILE));
  if ("issues" in c) {
    if (force) {
      process.stderr.write("WARNING: archiving with an invalid change.yaml (--force)\n");
    } else {
      process.stderr.write(`Error: ${changeId} has an invalid change.yaml — not archiving.\n`);
      for (const line of issueLines(changeId, c.issues)) process.stderr.write(`${line}\n`);
      process.stderr.write("Fix it, or re-run with --force.\n");
      return 1;
    }
  } else {
    const open = c.change.tasks.flatMap((t, i) => (t.done ? [] : [`${i + 1}. ${t.text.split("\n")[0]}\n`]));
    if (open.length > 0) {
      if (force) {
        process.stderr.write(`WARNING: archiving with open tasks (--force):\n${open.join("")}`);
      } else {
        process.stderr.write(`Error: ${changeId} has open tasks — not archiving.\n${open.join("")}`);
        process.stderr.write("Tick them with theway task done, or re-run with --force.\n");
        return 1;
      }
    }
  }

  let ref: string;
  try {
    ref = store.archive(key, changeId, date);
  } catch (e) {
    if (e instanceof StoreError && e.code === "exists") return taken();
    process.stderr.write(`mv: ${(e as Error).message}\n`);
    return 1;
  }
  process.stdout.write(`Archived: ${store.dirOf(key, { kind: "archived", ref })}\n`);
  return 0;
}
