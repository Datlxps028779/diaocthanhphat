import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { SiteChrome } from '@/components/SiteChrome';
import { LocalityHeader } from '@/components/area/LocalityPageContent';
import { LocalityNewsSection } from '@/components/area/LocalityNewsSection';
import { buildLocalityGeoAreaAllowlist } from '@/lib/localityNewsMatch';
import { loadLocalityPage } from '@/lib/server/localityPage';
import { serverGetLocalityNews } from '@/lib/supabase-server';
import { absoluteUrl } from '@/lib/siteUrl';

export const revalidate = 60;

type Props = { params: { slug: string }; searchParams?: Record<string, string | string[] | undefined> };

async function loadNewsPageData(slug: string) {
  const data = await loadLocalityPage(`/khu-vuc/${slug}`);
  if (!data) return null;
  const newsPath = `/khu-vuc/${data.area.slug}/tin-tuc`;
  const news = await serverGetLocalityNews({
    areaId: data.area.id,
    geoAreaAllowlist: buildLocalityGeoAreaAllowlist(data.area.name),
  });
  if (!news.available || !news.indexable) return null;
  return { data, news, newsPath };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await loadNewsPageData(params.slug);
  if (!result) notFound();
  const title = `Tin tức ${result.data.area.name}`;
  const description = `Các bài viết đã được gắn với ${result.data.area.name} từ dữ liệu tin tức công khai của Chọn Nhà Việt.`;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: result.newsPath },
    openGraph: { title, description, url: result.newsPath, type: 'website', locale: 'vi_VN' },
  };
}

export default async function LocalityNewsPage({ params, searchParams }: Props) {
  const result = await loadNewsPageData(params.slug);
  if (!result) notFound();
  const { data, news, newsPath } = result;
  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${absoluteUrl(newsPath)}#page`,
    url: absoluteUrl(newsPath),
    name: `Tin tức ${data.area.name}`,
    description: `Tin tức khu vực ${data.area.name}`,
    inLanguage: 'vi-VN',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: news.data.length,
      itemListElement: news.data.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: absoluteUrl(`/tin-tuc/${article.slug}`),
        name: article.title,
      })),
    },
  }];
  return <>
    <JsonLdScripts schemas={Object.keys(searchParams ?? {}).length ? [] : schema} />
    <SiteChrome currentPage={{ name: 'regions' }} localityActions>
      <main id="main-content" className="bg-white">
        <LocalityHeader data={data} newsPath={newsPath} activePath={newsPath} titleOverride={`Tin tức ${data.area.name}`} breadcrumbTitle={`Tin tức ${data.area.name}`} />
        <div className="mx-auto max-w-[1280px] px-4 pb-12">
          <LocalityNewsSection areaName={data.area.name} articles={news.data} variant="magazine" />
        </div>
      </main>
    </SiteChrome>
  </>;
}
