import { source } from '@/lib/source';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { inlineCode, plainText } from '@/lib/inline-code';
import { openGraphBase, pageUrl } from '@/lib/site';

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full} breadcrumb={{ enabled: false }}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description ? inlineCode(page.data.description) : null}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const description = page.data.description ? plainText(page.data.description) : undefined;
  const url = pageUrl(page.url);
  return {
    title: page.data.title,
    description,
    alternates: { canonical: url },
    openGraph: { ...openGraphBase, title: `${page.data.title} · theway`, description, url },
  };
}
