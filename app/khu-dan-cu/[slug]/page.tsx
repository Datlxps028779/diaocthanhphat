import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteChrome } from '@/components/SiteChrome';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { buildBreadcrumbJsonLd } from '@/lib/seo';
import { buildFaqJsonLd } from '@/lib/propertyFaq';
import {
  serverGetNeighborhoodBySlug,
  serverGetNeighborhoodListings,
  serverGetNeighborhoodStats,
  serverGetPriceStats,
  serverGetPageBlocks,
  serverGetNewsByGeoEntity,
  serverGetLocationTaxonomy,
} from '@/lib/supabase-server';
import { resolveNeighborhoodLocation, formatLocationLabel } from '@/lib/neighborhoodLocation';
import {
  neighborhoodSummary,
  buildNeighborhoodMetadata,
  buildNeighborhoodCollectionJsonLd,
  evaluateNeighborhoodSeo,
} from '@/lib/neighborhoodSeo';
import { NeighborhoodEntityScreen, type NeighborhoodFaq, type NeighborhoodPlace } from '@/screens/NeighborhoodEntityScreen';

export const revalidate = 3600;

type Props = { params: { slug: string } };

// page_blocks namespace: 'khu-dan-cu:<slug>' — tách khỏi trang tĩnh /trang/*.
function blockSlug(slug: string): string {
  return `khu-dan-cu:${slug}`;
}

async function loadNeighborhood(slug: string) {
  const neighborhood = await serverGetNeighborhoodBySlug(slug);
  if (!neighborhood) return null;
  const [listings, stats, priceStats, blocks, relatedNews, taxonomy] = await Promise.all([
    serverGetNeighborhoodListings(slug, 24),
    serverGetNeighborhoodStats(slug),
    serverGetPriceStats('neighborhood', slug),
    serverGetPageBlocks(blockSlug(slug)),
    serverGetNewsByGeoEntity(neighborhood.name, 6),
    serverGetLocationTaxonomy(),
  ]);
  const loc = resolveNeighborhoodLocation(neighborhood, taxonomy);
  const place: NeighborhoodPlace = {
    areaName: loc.area?.name,
    areaSlug: loc.area?.slug,
    locationLabel: formatLocationLabel(loc) || undefined,
  };
  const summary = neighborhoodSummary(neighborhood);
  const evaluation = evaluateNeighborhoodSeo({
    neighborhood,
    activeListings: Array.from({ length: stats.activeCount }, (_, i) => listings[i] ?? { id: String(i) }),
    propertyTypes: stats.propertyTypes,
    hasDescription: Boolean(neighborhood.description?.trim()),
  });
  const contentBlocks = blocks.filter(b => b.section !== 'faq');
  const faq: NeighborhoodFaq[] = blocks
    .filter(b => b.section === 'faq' && b.label?.trim() && b.value?.trim())
    .map(b => ({ question: b.label.trim(), answer: b.value!.trim() }));
  const sale = listings.filter(p => p.listing_type !== 'cho_thue');
  const rent = listings.filter(p => p.listing_type === 'cho_thue');
  return { neighborhood, summary, place, evaluation, contentBlocks, faq, sale, rent, stats, priceStats, listings, relatedNews };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadNeighborhood(params.slug);
  if (!data) notFound();
  return buildNeighborhoodMetadata(data.neighborhood, data.summary, data.evaluation);
}

export default async function NeighborhoodPage({ params }: Props) {
  const data = await loadNeighborhood(params.slug);
  if (!data) notFound();
  const { neighborhood: n, summary, place, evaluation, contentBlocks, faq, sale, rent, stats, priceStats, listings, relatedNews } = data;

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'Trang chủ', path: '/' },
    { name: 'Khu dân cư', path: '/khu-dan-cu' },
    ...(place.areaName && place.areaSlug ? [{ name: place.areaName, path: `/khu-vuc/${place.areaSlug}` }] : []),
    { name: n.name, path: `/khu-dan-cu/${n.slug}` },
  ]);
  const collection = listings.length > 0 ? buildNeighborhoodCollectionJsonLd(n, listings) : null;
  const faqJsonLd = faq.length > 0 ? buildFaqJsonLd(faq) : null;

  return (
    <>
      <JsonLdScripts schemas={[breadcrumb, collection, faqJsonLd]} />
      <SiteChrome currentPage={{ name: 'regions' }}>
        <NeighborhoodEntityScreen
          neighborhood={n}
          summary={summary}
          place={place}
          sale={sale}
          rent={rent}
          activeCount={stats.activeCount}
          priceStats={priceStats}
          contentBlocks={contentBlocks}
          faq={faq}
          relatedNews={relatedNews}
          indexable={evaluation.indexable}
        />
      </SiteChrome>
    </>
  );
}
