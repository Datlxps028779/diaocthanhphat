import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ListingsClient } from '../../_clients/pageClients';
import {
  serverGetPropertyTypeBySlug,
  serverGetAllPropertyTypes,
  serverGetPropertyTypeListings,
  serverGetPropertyTypeStats,
} from '@/lib/supabase-server';
import { evaluatePropertyTypeSeo } from '@/lib/propertyTypeSeo';
import { loadRouteSeo, type RouteFallback } from '@/lib/routeSeo';
import { JsonLdScripts } from '@/components/JsonLdScripts';

export const revalidate = 1800; // 30 phút

// Pre-render tất cả property types từ DB
export async function generateStaticParams() {
  const types = await serverGetAllPropertyTypes();
  return types.filter(t => t.slug).map(t => ({ slug: t.slug }));
}

type Params = { params: { slug: string } };

function propertyTypeFallback(slug: string, typeName: string): RouteFallback {
  const path = `/loai-nha-dat/${slug}`;
  return {
    title: `${typeName} tại Bình Dương`,
    description: `Tìm ${typeName.toLowerCase()} mua bán và cho thuê tại Bình Dương. Cập nhật liên tục, thông tin xác thực.`,
    path,
    routeType: 'CollectionPage',
    breadcrumb: [
      { name: 'Trang chủ', path: '/' },
      { name: 'Loại nhà đất', path: '/loai-nha-dat' },
      { name: typeName, path },
    ],
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const propertyType = await serverGetPropertyTypeBySlug(params.slug);
  if (!propertyType) return { title: 'Không tìm thấy loại bất động sản' };

  const path = `/loai-nha-dat/${params.slug}`;
  const { metadata } = await loadRouteSeo(path, propertyTypeFallback(params.slug, propertyType.name));

  // Quality gate: noindex nếu không đủ data
  const stats = await serverGetPropertyTypeStats(propertyType.id);
  const evaluation = evaluatePropertyTypeSeo({
    propertyType,
    activeListings: stats.activeCount,
    distinctAreas: stats.distinctAreas,
    distinctDistricts: stats.distinctDistricts,
  });

  return {
    ...metadata,
    robots: evaluation.robots.index
      ? { index: true, follow: true }
      : { index: false, follow: true },
  };
}

export default async function PropertyTypePage({ params }: Params) {
  const propertyType = await serverGetPropertyTypeBySlug(params.slug);
  if (!propertyType) notFound();

  const path = `/loai-nha-dat/${params.slug}`;
  const [listings, stats, { jsonLd }] = await Promise.all([
    serverGetPropertyTypeListings(propertyType.id, 12),
    serverGetPropertyTypeStats(propertyType.id),
    loadRouteSeo(path, propertyTypeFallback(params.slug, propertyType.name)),
  ]);

  const evaluation = evaluatePropertyTypeSeo({
    propertyType,
    activeListings: stats.activeCount,
    distinctAreas: stats.distinctAreas,
    distinctDistricts: stats.distinctDistricts,
  });

  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Hero Section */}
        <div className="mb-8">
          <h1 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">
            {propertyType.name} tại Bình Dương
          </h1>
          <p className="text-lg text-gray-600">
            Tìm {propertyType.name.toLowerCase()} mua bán và cho thuê tại Bình Dương.
            {stats.activeCount > 0 && ` Hiện có ${stats.activeCount} tin đăng đang hoạt động.`}
          </p>
        </div>

        {/* Stats Section */}
        {stats.activeCount > 0 && (
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-sm font-medium text-gray-500">Tổng tin đăng</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{stats.activeCount}</div>
            </div>
            {stats.avgPrice !== null && (
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-sm font-medium text-gray-500">Giá trung bình</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">
                  {stats.avgPrice.toFixed(1)} tỷ
                </div>
              </div>
            )}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-sm font-medium text-gray-500">Khu vực</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{stats.distinctAreas}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-sm font-medium text-gray-500">Quận/Huyện</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{stats.distinctDistricts}</div>
            </div>
          </div>
        )}

        {/* Top Areas */}
        {stats.topAreas.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Khu vực phổ biến</h2>
            <div className="flex flex-wrap gap-2">
              {stats.topAreas.map((area, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2"
                >
                  <span className="font-medium text-gray-900">{area.name}</span>
                  <span className="ml-2 text-sm text-gray-500">({area.count} tin)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quality Gate Warning */}
        {!evaluation.indexable && (
          <div className="mb-8 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm text-yellow-800">
              Trang này đang trong giai đoạn thu thập dữ liệu. Nội dung sẽ được cập nhật khi có đủ tin đăng.
            </p>
          </div>
        )}

        {/* Listings */}
        {listings.length > 0 ? (
          <ListingsClient
            initialData={{ data: listings, total: stats.activeCount }}
            filters={{ typeIds: [propertyType.id] }}
          />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
            <p className="text-gray-600">
              Hiện chưa có tin đăng {propertyType.name.toLowerCase()} nào. Vui lòng quay lại sau.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
