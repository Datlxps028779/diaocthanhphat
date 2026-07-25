import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo } from '@/lib/routeSeo';
import { serverGetManagedPage, serverGetPageBlocks } from '@/lib/supabase-server';
import { StaticPageClient } from '../../_clients/pageClients';

export const revalidate = 3600;

type Props = { params: { slug: string } };

async function loadPage(slug: string) {
  const page = await serverGetManagedPage(decodeURIComponent(slug));
  if (!page) return null;
  const blocks = await serverGetPageBlocks(page.slug);
  return { page, blocks };
}

function pagePath(slug: string) {
  return `/trang/${slug}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadPage(params.slug);
  if (!data) return { title: 'Không tìm thấy trang' };
  const path = pagePath(data.page.slug);
  const { metadata } = await loadRouteSeo(path, {
    title: data.page.title,
    description: data.page.description || data.page.title,
    path,
    ogImage: data.page.hero_image || undefined,
    routeType: 'WebPage',
    breadcrumb: [
      { name: 'Trang chủ', path: '/' },
      { name: data.page.title, path },
    ],
  });
  return metadata;
}

export default async function Page({ params }: Props) {
  const data = await loadPage(params.slug);
  if (!data) notFound();
  const path = pagePath(data.page.slug);
  const { jsonLd } = await loadRouteSeo(path, {
    title: data.page.title,
    description: data.page.description || data.page.title,
    path,
    ogImage: data.page.hero_image || undefined,
    routeType: 'WebPage',
    breadcrumb: [
      { name: 'Trang chủ', path: '/' },
      { name: data.page.title, path },
    ],
  });
  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <StaticPageClient page={data.page} blocks={data.blocks} />
    </>
  );
}
