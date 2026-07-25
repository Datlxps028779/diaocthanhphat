import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteChrome } from '@/components/SiteChrome';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { loadRouteSeo, type RouteFallback } from '@/lib/routeSeo';
import { serverGetAllPriceStats, serverGetAreas, serverGetNeighborhoods } from '@/lib/supabase-server';
import { pickOverallStat, formatPricePerSqm, formatUpdateDate, PRICE_DISCLAIMER } from '@/lib/priceStatsFormat';
import type { PriceStat, PriceStatScope } from '@/lib/supabase';

// Hub dữ liệu giá (mục 6 updateweb.md) — lợi thế cạnh tranh chính: tổng hợp giá/m²
// trung vị theo khu vực + khu dân cư từ tin đăng thật (RPC refresh_price_stats).
// Server-render HTML sạch cho AIO. Quality-gate: chưa có mẫu → empty state, không bịa.
export const revalidate = 1800;

const PATH = '/du-lieu-gia';
const fallback: RouteFallback = {
  title: 'Dữ liệu giá nhà đất Bình Dương',
  description: 'Bảng giá nhà đất trung vị theo khu vực và khu dân cư tại Bình Dương, tổng hợp từ tin đăng thực tế: giá/m², số mẫu, ngày cập nhật.',
  path: PATH,
  routeType: 'CollectionPage',
  breadcrumb: [
    { name: 'Trang chủ', path: '/' },
    { name: 'Dữ liệu giá', path: PATH },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const { metadata } = await loadRouteSeo(PATH, fallback);
  return metadata;
}

type PriceRow = {
  key: string; name: string; href: string;
  sale: PriceStat | null; rent: PriceStat | null;
  updatedAt: string; samples: number;
};

// Nhóm price_stats theo scope_key, chỉ giữ dòng tổng (property_type_id=null), map
// sang tên hiển thị. Bỏ scope_key không map được tên (dữ liệu rác) hoặc thiếu giá.
function buildRows(
  stats: PriceStat[], scope: PriceStatScope,
  nameOf: (slug: string) => string | null, hrefOf: (slug: string) => string,
): PriceRow[] {
  const bySlug = new Map<string, PriceStat[]>();
  for (const s of stats) {
    if (s.scope !== scope) continue;
    const arr = bySlug.get(s.scope_key) ?? [];
    arr.push(s);
    bySlug.set(s.scope_key, arr);
  }
  const rows: PriceRow[] = [];
  for (const [slug, arr] of bySlug) {
    const name = nameOf(slug);
    if (!name) continue;
    const sale = pickOverallStat(arr, 'mua_ban');
    const rent = pickOverallStat(arr, 'cho_thue');
    if (!sale?.median_price_per_sqm && !rent?.median_price_per_sqm) continue;
    rows.push({
      key: slug, name, href: hrefOf(slug),
      sale: sale ?? null, rent: rent ?? null,
      updatedAt: formatUpdateDate(sale?.computed_at || rent?.computed_at),
      samples: (sale?.sample_count ?? 0) + (rent?.sample_count ?? 0),
    });
  }
  return rows.sort((a, b) => b.samples - a.samples);
}

function PriceTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: PriceRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-red-600">{title}</p>
      <h2 className="mt-1 text-xl font-black text-gray-900">{subtitle}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="pb-2 pr-4 font-semibold">Khu vực</th>
              <th className="pb-2 pr-4 font-semibold">Giá bán (TV)</th>
              <th className="pb-2 pr-4 font-semibold">Giá thuê (TV)</th>
              <th className="pb-2 pr-4 font-semibold">Số mẫu</th>
              <th className="pb-2 font-semibold">Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-t border-gray-100">
                <td className="py-2 pr-4 font-semibold text-red-600"><Link href={r.href} className="hover:underline">{r.name}</Link></td>
                <td className="py-2 pr-4 text-gray-900">{formatPricePerSqm(r.sale?.median_price_per_sqm ?? null)}</td>
                <td className="py-2 pr-4 text-gray-900">{formatPricePerSqm(r.rent?.median_price_per_sqm ?? null)}</td>
                <td className="py-2 pr-4 text-gray-500">{r.samples} tin</td>
                <td className="py-2 text-gray-500">{r.updatedAt || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function PriceDataHubPage() {
  const [{ jsonLd }, stats, areas, neighborhoods] = await Promise.all([
    loadRouteSeo(PATH, fallback),
    serverGetAllPriceStats(),
    serverGetAreas(),
    serverGetNeighborhoods(),
  ]);

  const areaName = new Map(areas.map(a => [a.slug, a.name]));
  const nbName = new Map(neighborhoods.map(n => [n.slug, n.name]));

  const areaRows = buildRows(stats, 'area', s => areaName.get(s) ?? null, s => `/khu-vuc/${s}`);
  const nbRows = buildRows(stats, 'neighborhood', s => nbName.get(s) ?? null, s => `/khu-dan-cu/${s}`);
  const hasData = areaRows.length > 0 || nbRows.length > 0;

  const totalSamples = [...areaRows, ...nbRows].reduce((sum, r) => sum + r.samples, 0);
  const answer = hasData
    ? `Dữ liệu giá nhà đất Bình Dương tổng hợp từ ${totalSamples} tin đăng thực tế trên ${areaRows.length} khu vực và ${nbRows.length} khu dân cư. Giá là trung vị giá/m², cập nhật liên tục theo tin mới.`
    : null;

  return (
    <>
      <JsonLdScripts schemas={jsonLd} />
      <SiteChrome currentPage={{ name: 'regions' }}>
        <main className="bg-gray-50">
          <section className="bg-gray-950 text-white">
            <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
              <nav className="mb-6 text-xs text-white/70">
                <Link href="/" className="hover:text-white">Trang chủ</Link>
                <span className="mx-2">/</span>
                <span className="text-white">Dữ liệu giá</span>
              </nav>
              <p className="mb-3 inline-flex rounded-full bg-red-600/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white ring-1 ring-white/20">Cơ sở dữ liệu giá</p>
              <h1 className="max-w-3xl text-3xl font-black leading-tight md:text-5xl">Dữ liệu giá nhà đất Bình Dương</h1>
              {answer && <p className="mt-4 max-w-3xl rounded-xl bg-white/10 p-3 text-sm font-semibold leading-7 ring-1 ring-white/20">{answer}</p>}
            </div>
          </section>

          <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:py-10">
            {hasData ? (
              <>
                <PriceTable title="Theo khu vực" subtitle="Giá nhà đất trung vị theo khu vực" rows={areaRows} />
                <PriceTable title="Theo khu dân cư" subtitle="Giá nhà đất trung vị theo khu dân cư" rows={nbRows} />
                <p className="text-xs italic leading-6 text-gray-400">{PRICE_DISCLAIMER}</p>
              </>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                <h2 className="text-lg font-black text-gray-900">Dữ liệu giá đang được tổng hợp</h2>
                <p className="mt-2 text-sm text-gray-500">Bảng giá sẽ hiển thị khi có đủ tin đăng thực tế theo từng khu vực. Vui lòng quay lại sau.</p>
                <Link href="/khu-vuc" className="mt-5 inline-flex rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">Xem khu vực bất động sản</Link>
              </div>
            )}
          </section>
        </main>
      </SiteChrome>
    </>
  );
}
