import { CHANGE_FILE, checkRead } from "./change";
import { thewayHome } from "./io";
import { resolveKey } from "./project";
import { fileStore } from "./store/files";

/** `theway list [--project <key>]`: the active and archived changes of the project. */
export function cmdList(override: string | undefined): number {
  const key = resolveKey(override);
  if (key === null) return 1;
  const store = fileStore(thewayHome());
  let text = `theway changes — ${key}\n\nActive changes\n\n`;

  const active = store.activeIds(key);
  for (const name of active) {
    const change = { kind: "active", id: name } as const;
    const files = store.fileCount(key, change);
    const c = checkRead(store.readFile(key, change, CHANGE_FILE));
    const state = "issues" in c ? `invalid: ${c.issues[0]}` : `${c.change.tasks.filter((t) => t.done).length}/${c.change.tasks.length} tasks done`;
    text += `  ${name.padEnd(20)} ${files} files   ${state}\n`;
  }
  if (active.length === 0) text += "  No active changes.\n";
  text += "\n";

  const archived = store.archived(key).map((e) => e.ref);
  text += `Archived changes (${archived.length})\n\n`;
  if (archived.length > 0) {
    for (const name of archived) text += `  ${name}\n`;
  } else {
    text += "  No archived changes.\n";
  }
  text += `\nSummary: ${active.length} active change(s), ${archived.length} archived.\n`;
  process.stdout.write(text);
  return 0;
}
