import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverGetPropertyByIdOrSlug } from '@/lib/supabase-server';
import { buildPropertyMetadata } from '@/lib/seo';

// Route cũ giữ lại làm ĐÍCH FALLBACK cho tin CHƯA có public_code. Link cũ đã share/index
// (/bat-dong-san/{slug|uuid}) → middleware.ts 308 hard sang URL mới /{lt}/{areaSlug}/
// {districtSlug?}/{slug}-pr{code} TRƯỚC khi tới route này (middleware chạy trước stream;
// redirect page-level vô hiệu vì root loading.tsx flush shell 200 sớm). Route này chỉ
// còn nhận request khi buildProductPath fallback = chính path cũ (thiếu public_code).
export const revalidate = 3600;

type Params = { params: { slug: string } };

function legacyPathOf(p: { id: string; slug?: string | null }): string {
  return `/bat-dong-san/${(p.slug && p.slug.trim()) || p.id}`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const property = await serverGetPropertyByIdOrSlug(decodeURIComponent(params.slug));
  if (!property) return { title: 'Không tìm thấy bất động sản' };
  return buildPropertyMetadata(property);
}

export default async function PropertyPage({ params }: Params) {
  const slug = decodeURIComponent(params.slug);
  const property = await serverGetPropertyByIdOrSlug(slug);
  if (!property) notFound();

  const legacyPath = legacyPathOf(property);

  // Fallback (chưa có public_code): render như cũ để không vỡ trang.
  const { buildPropertyJsonLd, buildBreadcrumbJsonLd } = await import('@/lib/seo');
  const { buildPropertyFaq, buildFaqJsonLd } = await import('@/lib/propertyFaq');
  const { JsonLdScripts } = await import('@/components/JsonLdScripts');
  const { PropertyDetailClient } = await import('./PropertyDetailClient');

  const jsonLd = buildPropertyJsonLd(property);
  const listingHref = property.listing_type === 'cho_thue' ? '/cho-thue' : '/mua-ban';
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Trang chủ', path: '/' },
    { name: property.listing_type === 'cho_thue' ? 'Cho thuê' : 'Mua bán', path: listingHref },
    { name: property.title, path: legacyPath },
  ]);
  const faqItems = property.faq && property.faq.length > 0 ? property.faq : buildPropertyFaq(property);
  const faqJsonLd = buildFaqJsonLd(faqItems);
  const schemas = [jsonLd, breadcrumbJsonLd, ...(faqJsonLd ? [faqJsonLd] : [])];

  return (
    <>
      <JsonLdScripts schemas={schemas} />
      <PropertyDetailClient propertyId={slug} initialData={property} />
    </>
  );
}
