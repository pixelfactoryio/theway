import '@fontsource-variable/inter/wght.css';
import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { GeistMono } from 'geist/font/mono';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import SearchDialog from '@/components/search';
import { openGraphBase, tagline, title } from '@/lib/site';

export const metadata: Metadata = {
  title: { default: title, template: '%s · theway' },
  description: tagline,
  openGraph: openGraphBase,
  twitter: { card: 'summary_large_image' },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={GeistMono.variable} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <RootProvider search={{ SearchDialog }}>{children}</RootProvider>
      </body>
    </html>
  );
}
