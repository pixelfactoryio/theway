'use client';
import { useRef, useSyncExternalStore, type ComponentProps, type MouseEvent } from 'react';
import Link from 'next/link';
import { useStaticSearch } from 'fumadocs-core/search/client';
import { basePath } from '@/lib/base-path.mjs';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogListItem,
  SearchDialogOverlay,
  useSearch,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';

type ItemProps = Parameters<NonNullable<ComponentProps<typeof SearchDialogList>['Item']>>[0];

/*
 * A result that goes to a page is a link, so Cmd/Ctrl-click, Shift-click and a middle click open it as a link does: the
 * option role, its id and its selected state move to the link, and Fumadocs' row inside it draws the result. A plain
 * click keeps Fumadocs' select (go to the page and close the dialog).
 */
function ResultItem({ item, table, onClick }: ItemProps) {
  const { getActive, subscribeActive } = useSearch();
  const isActive = () => getActive() === item.id;
  const active = useSyncExternalStore(subscribeActive, isActive, isActive);
  if (item.type === 'action' || !('url' in item)) return <SearchDialogListItem item={item} table={table} onClick={onClick} />;

  const select = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onClick();
  };
  return (
    <Link
      href={item.url}
      prefetch={false}
      role="option"
      id={`fd-search-option-${item.id}`}
      aria-selected={active}
      className="contents"
      onClick={select}
      {...(item.external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      <SearchDialogListItem item={item} table={table} role="none" id={undefined} aria-selected={undefined} />
    </Link>
  );
}

export default function StaticSearchDialog(props: SharedProps) {
  const search = useStaticSearch({ from: `${basePath}/api/search` });
  // Fumadocs opens the dialog from its own state, with no Radix trigger to return focus to: keep the element that had
  // the focus when it opened (read while rendering, before the dialog takes the focus) and give it back on close.
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (props.open && !wasOpen.current && typeof document !== 'undefined') {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpen.current = props.open;

  return (
    <SearchDialog {...search} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent
        onCloseAutoFocus={(event) => {
          if (!opener.current?.isConnected) return;
          event.preventDefault();
          opener.current.focus();
        }}
      >
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList Item={(props) => <ResultItem {...props} />} />
      </SearchDialogContent>
    </SearchDialog>
  );
}
