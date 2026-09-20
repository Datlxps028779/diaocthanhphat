import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { SiteChrome } from '@/components/SiteChrome';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { LocalityHeader, LocalityLandingFooter, LocalityReportBody, LocalitySubnav } from '@/components/area/LocalityPageContent';
import { AreaListingClient } from '../../../app/_clients/pageClients';
import styles from '@/components/area/localityVisual.module.css';
import { buildLocalityPageData, buildLocalitySchemas } from '../localityPageData';
import { getLocalitySnapshot } from './localitySnapshot';
import { loadLocalityListings } from './localityListings';
import { buildLocalityGeoAreaAllowlist } from '../localityNewsMatch';
import { serverGetLocalityNews } from '../supabase-server';
import { parseListingParams } from '../router';

export const loadLocalityPage = cache(async (path: string) => {
  const snapshot = await getLocalitySnapshot();
  return buildLocalityPageData(path, snapshot);
});

export async function renderLocalityOverview(
  path: string,
  dynamicQuery = false,
  searchParams?: Record<string, string | string[] | undefined>,
) {
  const data = await loadLocalityPage(path);
  if (!data) notFound();
  if (data.context.path !== path) redirect(data.context.path);
  const isReport = data.context.mode === 'report';
  const [news, properties] = await Promise.all([
    serverGetLocalityNews({
      areaId: data.area.id,
      geoAreaAllowlist: buildLocalityGeoAreaAllowlist(data.area.name),
    }),
    isReport ? Promise.resolve([]) : loadLocalityListings({ areaId: data.context.areaId }),
  ]);
  const newsPath = news.available && news.indexable ? `/khu-vuc/${data.area.slug}/tin-tuc` : null;
  const localitySubnav = <LocalitySubnav data={data} newsPath={newsPath} />;
  if (isReport) return <>
    <JsonLdScripts schemas={dynamicQuery ? [] : buildLocalitySchemas(data)} />
    <SiteChrome currentPage={{ name: 'regions' }} localityActions localitySubnav={localitySubnav}>
      <main id="main-content" className={`${styles.scope} bg-white`}>
        <LocalityHeader data={data} newsPath={newsPath} newsArticles={news.available && news.indexable ? news.data : []} />
        <LocalityReportBody data={data} />
      </main>
    </SiteChrome>
  </>;

  const queryFilters = dynamicQuery ? parseListingParams(searchParams) : {};
  const filters = { ...queryFilters, areaId: data.context.areaId };
  return <>
    <JsonLdScripts schemas={dynamicQuery ? [] : buildLocalitySchemas(data, properties)} />
    <AreaListingClient
      listingType={data.context.listingType ?? undefined}
      filters={filters}
      initialData={dynamicQuery ? undefined : { data: properties, total: data.report.counts.total }}
      initialDataScope={{ areaId: data.context.areaId, listingType: data.context.listingType ?? undefined }}
      localityScope={{ path: data.context.path, areaId: data.context.areaId, listingType: data.context.listingType ?? undefined }}
      localityTransactionPaths={{ sale: `/mua-ban/${data.area.slug}`, rent: `/cho-thue/${data.area.slug}` }}
      localitySubnav={localitySubnav}
      header={<LocalityHeader data={data} newsPath={newsPath} newsArticles={news.available && news.indexable ? news.data : []} />}
      footer={<LocalityLandingFooter data={data} latestListings={properties} news={news.available && news.indexable ? { path: newsPath!, articles: news.data } : null} />}
    />
  </>;
}
