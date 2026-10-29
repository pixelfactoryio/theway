import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { ReactNode } from 'react';
import { SiteNav } from '@/components/site-nav';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout {...baseOptions()} nav={{ enabled: false }} className="landing">
      <SiteNav />
      {children}
    </HomeLayout>
  );
}
