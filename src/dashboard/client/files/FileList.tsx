/**
 * The file list of the Workflows pages: New workflow, a filter, then the workflows. From the `lg` breakpoint it is the
 * left column; below it, the Files button of the title row opens it in a sheet.
 */
import { cn } from "cn";
import { Files } from "lucide-react";
import { createContext, type ReactNode, type Ref, useContext, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { type FileRef, fileHref, fileKey, useFiles } from "@/lib/api";
import type { WorkflowItem } from "../../types";
import { isDirty } from "./draft";
import { useDrafts } from "./drafts";
import { Input } from "./fields";
import { GROUP_LIMIT, matches, visibleItems } from "./list";
import { SMALL_CAPS } from "./WorkflowView";

const sameFile = (a: FileRef, b: FileRef): boolean => a.scope === b.scope && a.key === b.key && a.kind === b.kind && a.name === b.name;

/** The list's filter and its expanded groups, kept while you move between files. */
type ListState = { filter: string; setFilter: (f: string) => void; expanded: ReadonlySet<string>; toggle: (group: string) => void };

const ListStateContext = createContext<ListState | null>(null);

export function FileListStateProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (group: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(group)) next.add(group);
      return next;
    });
  return <ListStateContext.Provider value={{ filter, setFilter, expanded, toggle }}>{children}</ListStateContext.Provider>;
}

function useListState(): ListState {
  const state = useContext(ListStateContext);
  if (state === null) throw new Error("useListState outside FileListStateProvider");
  return state;
}

/** An item of the list: its name, then the `edited` badge of a dirty draft, the `default` badge, its error mark, or the project it belongs to. */
function Item({ item, selected, edited, onPick }: { item: WorkflowItem; selected: boolean; edited: boolean; onPick?: () => void }) {
  const error = item.error;
  return (
    <Link
      href={fileHref(item)}
      aria-current={selected ? "page" : undefined}
      onClick={onPick}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2.5",
        selected ? "bg-primary/10 text-primary" : "hover:bg-accent",
      )}
    >
      <span className="max-w-full shrink-0 truncate font-mono text-[13px]">{item.name}</span>
      <span className="flex min-w-0 items-center gap-1.5 [&>*]:shrink-0">
        {item.scope === "project" && <span className="min-w-0 shrink! truncate text-[12px] text-muted-foreground">{item.label ?? item.key} only</span>}
        {edited ? (
          <Badge variant="warning-light">edited</Badge>
        ) : error !== null ? (
          <span className="text-[12px] text-destructive" title={error}>
            error
          </span>
        ) : (
          item.default && <Badge variant="outline">default</Badge>
        )}
      </span>
    </Link>
  );
}

/**
 * A group of the list: its heading in small capitals with its count on the right, an optional subtitle, then its items:
 * 8 until expanded, all matches of a filter; hidden when a filter matches none of them.
 */
function Group({
  heading,
  subtitle,
  items,
  selected,
  first,
  onPick,
}: {
  heading: string;
  subtitle?: string;
  items: WorkflowItem[];
  selected: FileRef | null;
  first: boolean;
  onPick?: () => void;
}) {
  const { drafts } = useDrafts();
  const { filter, expanded, toggle } = useListState();
  const edited = (item: WorkflowItem) => {
    const d = drafts.get(fileKey(item))?.draft;
    return d !== undefined && isDirty(d);
  };
  const open = expanded.has(heading);
  const at = selected === null ? -1 : items.findIndex((i) => sameFile(i, selected));
  const { shown, hidden } = visibleItems(items, { filter, expanded: open, selected: at, name: (i) => i.name });
  if (filter.trim() !== "" && shown.length === 0) return null;
  return (
    <section aria-label={heading} className={cn("flex flex-col gap-px", first ? "" : "pt-4")}>
      <div className={cn("flex items-baseline justify-between px-2.5", SMALL_CAPS, subtitle === undefined && "pb-1")}>
        <span>{heading}</span>
        <span className="tabular-nums">{items.length}</span>
      </div>
      {subtitle !== undefined && <span className="px-2.5 pb-1 text-[12px] text-muted-foreground">{subtitle}</span>}
      {shown.map((item) => (
        <Item key={fileKey(item)} item={item} selected={selected !== null && sameFile(item, selected)} edited={edited(item)} onPick={onPick} />
      ))}
      {filter.trim() === "" && (hidden > 0 || (open && items.length > Math.max(GROUP_LIMIT, at + 1))) && (
        <Button variant="ghost" size="sm" className="self-start text-muted-foreground" aria-expanded={open} onClick={() => toggle(heading)}>
          {open ? "Show less" : `Show ${hidden} more`}
        </Button>
      )}
    </section>
  );
}

/**
 * The file list: New workflow, the filter, then the workflows in the response's order, a new workflow's draft last.
 * `onPick` runs when a file is chosen.
 */
export function FileList({
  selected,
  onNew,
  onPick,
  filterRef,
}: {
  selected: FileRef | null;
  onNew: () => void;
  onPick?: () => void;
  filterRef?: Ref<HTMLInputElement>;
}) {
  const files = useFiles();
  const { drafts } = useDrafts();
  const { filter, setFilter } = useListState();
  if (files.data === undefined) return <Empty error={files.isError}>{files.isError ? files.error.message : "Loading…"}</Empty>;
  const { workflows, projects } = files.data;
  const labels = new Map(projects.map((p) => [p.key, p.label]));
  const fresh: WorkflowItem[] = [...drafts.values()]
    .filter((e) => e.draft.isNew && e.file.kind === "workflows")
    .map((e) => ({
      ...e.file,
      kind: "workflows",
      label: e.file.key === null ? null : (labels.get(e.file.key) ?? null),
      path: "",
      description: null,
      default: false,
      error: null,
      errors: 0,
      steps: null,
      runsOn: null,
    }));
  const groups = [{ heading: "Workflows", items: [...workflows, ...fresh] }];
  const none = filter.trim() !== "" && groups.every((g) => !g.items.some((i) => matches(i.name, filter)));
  return (
    <nav aria-label="Files" className="flex flex-col gap-px">
      <div className="flex gap-1.5 pb-3">
        <Button variant="outline" size="sm" onClick={onNew}>
          New workflow
        </Button>
      </div>
      <Input
        ref={filterRef}
        type="search"
        aria-label="Filter files"
        placeholder="Filter files"
        className="mb-3 bg-card"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && filter !== "") {
            e.preventDefault();
            e.stopPropagation();
            setFilter("");
          }
        }}
      />
      {none ? (
        <p className="px-2.5 text-muted-foreground">No file matches</p>
      ) : (
        groups.map((g, i) => <Group key={g.heading} {...g} selected={selected} first={i === 0} onPick={onPick} />)
      )}
    </nav>
  );
}

/** The left column from `lg`: sticky under the top bar, as tall as the window below it, scrolled on its own; the open file kept in view. */
export function FilesColumn({ selected, onNew }: { selected: FileRef | null; onNew: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const key = selected === null ? "" : fileKey(selected);
  // `key` stands for `selected`, a new object on every render; `ref` is set once mounted.
  useEffect(() => {
    const list = ref.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (list === null || item === null || item === undefined) return;
    const top = item.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight / 3;
  }, [key]);
  return (
    <aside
      ref={ref}
      aria-label="Files"
      className="hidden border-divider py-4 lg:sticky lg:top-(--topbar-h) lg:block lg:h-[calc(100dvh-var(--topbar-h))] lg:w-[260px] lg:shrink-0 lg:overflow-auto lg:border-r lg:pr-4"
    >
      <FileList selected={selected} onNew={onNew} />
    </aside>
  );
}

/** Opens the file list's sheet below the `lg` breakpoint. */
const SheetContext = createContext<(() => void) | null>(null);

/** The file list in a sheet from the left, below the `lg` breakpoint; choosing a file closes it. */
export function FilesSheet({
  selected,
  onNew,
  children,
}: {
  selected: FileRef | null;
  onNew: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const filter = useRef<HTMLInputElement>(null);
  return (
    <SheetContext.Provider value={() => setOpen(true)}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          // The filter has the focus when the sheet opens.
          initialFocus={filter}
          className="top-0 left-0 block h-dvh max-w-[min(340px,calc(100%-3rem))] translate-x-0 translate-y-0 overflow-auto rounded-none p-4 pt-3 sm:max-w-[340px]"
        >
          <DialogTitle className="mb-3 py-2">Files</DialogTitle>
          <FileList
            selected={selected}
            onNew={() => {
              setOpen(false);
              onNew();
            }}
            onPick={() => setOpen(false)}
            filterRef={filter}
          />
        </DialogContent>
      </Dialog>
    </SheetContext.Provider>
  );
}

/** The Files button of a title row, below the `lg` breakpoint: opens the file list's sheet. */
export function FilesButton() {
  const open = useContext(SheetContext);
  if (open === null) return null;
  return (
    <Button variant="outline" className="lg:hidden" onClick={open}>
      <Files /> Files
    </Button>
  );
}
