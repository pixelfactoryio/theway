import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import type { ReactNode } from 'react';
import { DocsChrome } from '@/components/docs-chrome';
import { collapsedAttribute, collapsedKey } from '@/lib/docs-sidebar';

/*
 * Run while the page is parsed, before its first paint: a collapse kept by this browser marks `<html>`, and global.css
 * lays the docs out collapsed under that mark until DocsChrome has given Fumadocs' sidebar the same state.
 */
const restoreCollapse = `try{if(localStorage.getItem(${JSON.stringify(collapsedKey)})==='true')document.documentElement.setAttribute(${JSON.stringify(collapsedAttribute)},'')}catch(e){}`;

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: restoreCollapse }} />
      <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
        <DocsChrome />
        {children}
      </DocsLayout>
    </>
  );
}
