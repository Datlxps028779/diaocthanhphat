import Link from 'next/link';
import type { Neighborhood, Property, PriceStat, PageBlock, ListingType, NewsArticle } from '../lib/supabase';
import { isHtmlContent } from '../lib/markdown';
import { sanitizeArticleHtml } from '../lib/sanitizeHtml';
import { pickOverallStat, formatPricePerSqm, buildPriceAnswer } from '../lib/priceStatsFormat';
import { PriceStatsBlock } from '../components/PriceStatsBlock';

// Server component (KHÔNG 'use client') — render toàn bộ entity page phía server để
// HTML tĩnh, sạch, dễ cho AI trích xuất (ưu tiên AIO). Nội dung mô tả/tiện ích/hạ
// tầng/pháp lý… đến từ page_blocks (admin soạn) — không hardcode, không bịa.

export type NeighborhoodFaq = { question: string; answer: string };

type Props = {
  neighborhood: Neighborhood;
  summary: string;
  sale: Property[];
  rent: Property[];
  activeCount: number;
  priceStats: PriceStat[];
  contentBlocks: PageBlock[];
  faq: NeighborhoodFaq[];
  relatedNews: NewsArticle[];
  indexable: boolean;
};

const DEFAULT_HERO = 'https://images.pexels.com/photos/1642125/pexels-photo-1642125.jpeg?auto=compress&w=1400';

function priceText(p: Pick<Property, 'price' | 'price_unit' | 'price_label'>): string {
  return p.price_label || `${p.price} ${p.price_unit}`;
}
function propertyHref(p: Pick<Property, 'id' | 'slug'>): string {
  return `/bat-dong-san/${(p.slug && p.slug.trim()) || p.id}`;
}

function renderContentBlock(block: PageBlock) {
  const value = block.value?.trim() ?? '';
  if (!value) return null;
  if (block.type === 'html' || isHtmlContent(value)) {
    return <div key={block.id} className="prose max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(value) }} />;
  }
  if (block.type === 'list') {
    return (
      <ul key={block.id} className="space-y-2 text-sm leading-7 text-gray-700">
        {value.split('\n').filter(Boolean).map(item => <li key={item} className="flex gap-2"><span className="mt-3 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />{item}</li>)}
      </ul>
    );
  }
  if (block.type === 'image') {
    return <img key={block.id} src={value} alt={block.label} className="w-full rounded-2xl object-cover shadow-sm" />;
  }
  return <p key={block.id} className="whitespace-pre-line text-sm leading-7 text-gray-700">{value}</p>;
}

function PropertyCard({ property }: { property: Property }) {
  const specs = [
    property.area_sqm ? `${property.area_sqm} m²` : null,
    property.bedrooms ? `${property.bedrooms} PN` : null,
    property.legal_status || null,
  ].filter(Boolean);
  return (
    <Link href={propertyHref(property)} className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative h-44 overflow-hidden bg-gray-100">
        <img src={property.image_url || DEFAULT_HERO} alt={property.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${property.listing_type === 'cho_thue' ? 'bg-blue-600' : 'bg-red-600'}`}>
          {property.listing_type === 'cho_thue' ? 'Cho thuê' : 'Mua bán'}
        </span>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-2 text-sm font-bold text-gray-900 transition-colors group-hover:text-red-600">{property.title}</h3>
        <p className="text-base font-black text-red-600">{priceText(property)}</p>
        {specs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {specs.map(s => <span key={s} className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600">{s}</span>)}
          </div>
        )}
      </div>
    </Link>
  );
}

// Bảng giá cho 1 loại giao dịch — chỉ hiện khi có dữ liệu thật.
export function NeighborhoodEntityScreen(props: Props) {
  const { neighborhood: n, summary, sale, rent, activeCount, priceStats, contentBlocks, faq, relatedNews, indexable } = props;
  const heroImage = n.image_url || DEFAULT_HERO;
  const saleStat = pickOverallStat(priceStats, 'mua_ban' as ListingType);
  const answer = buildPriceAnswer(n.name, priceStats, 'mua_ban') ?? buildPriceAnswer(n.name, priceStats, 'cho_thue');

  return (
    <main className="bg-gray-50">
      <section className="overflow-hidden bg-gray-950 bg-cover bg-center text-white"
        style={{ backgroundImage: `linear-gradient(115deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.86) 42%, rgba(69,10,10,0.82) 100%), url(${heroImage})` }}>
        <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
          <nav className="mb-6 text-xs text-white/70">
            <Link href="/" className="hover:text-white">Trang chủ</Link>
            <span className="mx-2">/</span>
            <Link href="/khu-dan-cu" className="hover:text-white">Khu dân cư</Link>
            <span className="mx-2">/</span>
            <span className="text-white">{n.name}</span>
          </nav>
          <div className="max-w-3xl border border-white/15 p-5 shadow-2xl shadow-black/40 backdrop-blur-sm md:p-7" style={{ backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: '1.5rem' }}>
            <p className="mb-3 inline-flex rounded-full bg-red-600/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white ring-1 ring-white/20">Khu dân cư</p>
            <h1 className="text-3xl font-black leading-tight text-white drop-shadow-[0_3px_8px_rgba(0,0,0,0.85)] md:text-5xl">Khu dân cư {n.name}</h1>
            {/* Answer Block — câu trả lời trực tiếp đầu trang cho AIO/AEO. */}
            {answer && <p className="mt-4 rounded-xl bg-white/10 p-3 text-sm font-semibold leading-7 text-white ring-1 ring-white/20">{answer}</p>}
            <p className="mt-4 text-sm font-medium leading-7 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] md:text-base">{summary}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:py-10">
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-red-600">Tổng quan khu dân cư</p>
                <h2 className="mt-1 text-2xl font-black text-gray-900">{n.name}</h2>
              </div>
              {!indexable && <span className="w-fit rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">Dữ liệu đang cập nhật</span>}
            </div>
            <p className="mt-4 text-sm leading-7 text-gray-600">{summary}</p>
          </div>

          {/* Nội dung pillar do admin soạn: vị trí, tiện ích, hạ tầng, pháp lý, tiềm năng… */}
          {contentBlocks.length > 0 && (
            <div className="space-y-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
              {contentBlocks.map(renderContentBlock)}
            </div>
          )}

          {/* Dữ liệu giá — component dùng chung; tự ẩn khi không đủ mẫu. Answer đã ở hero. */}
          <PriceStatsBlock entityName={n.name} priceStats={priceStats} showAnswer={false} />

          {/* Nhà đang bán */}
          {sale.length > 0 && (
            <div>
              <h2 className="mb-4 text-2xl font-black text-gray-900">Nhà đang bán tại {n.name}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {sale.map(p => <PropertyCard key={p.id} property={p} />)}
              </div>
            </div>
          )}

          {/* Nhà cho thuê */}
          {rent.length > 0 && (
            <div>
              <h2 className="mb-4 text-2xl font-black text-gray-900">Nhà cho thuê tại {n.name}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rent.map(p => <PropertyCard key={p.id} property={p} />)}
              </div>
            </div>
          )}

          {/* FAQ — cấu trúc câu hỏi/trả lời, khớp 1:1 FAQPage JSON-LD (tốt cho AIO). */}
          {faq.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
              <h2 className="text-2xl font-black text-gray-900">Câu hỏi thường gặp</h2>
              <div className="mt-4 divide-y divide-gray-100">
                {faq.map((f, i) => (
                  <details key={i} className="group py-3">
                    <summary className="cursor-pointer list-none text-sm font-bold text-gray-800 marker:hidden">{f.question}</summary>
                    <p className="mt-2 text-sm leading-7 text-gray-600">{f.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Bài viết liên quan (topic cluster) — bài vệ tinh trỏ về entity pillar. */}
          {relatedNews.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
              <h2 className="text-2xl font-black text-gray-900">Bài viết về {n.name}</h2>
              <div className="mt-4 divide-y divide-gray-100">
                {relatedNews.map(a => (
                  <Link key={a.id} href={`/tin-tuc/${a.slug || a.id}`} className="group flex gap-3 py-3">
                    {a.image_url && <img src={a.image_url} alt={a.title} className="h-16 w-24 flex-shrink-0 rounded-lg object-cover" />}
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-sm font-bold text-gray-800 transition-colors group-hover:text-red-600">{a.title}</h3>
                      {a.excerpt && <p className="mt-1 line-clamp-2 text-xs leading-6 text-gray-500">{a.excerpt}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-black text-gray-900">Dữ liệu khu dân cư</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-red-50 p-4">
                <p className="text-xs text-red-500">Tin đang hiển thị</p>
                <p className="mt-1 text-2xl font-black text-red-700">{activeCount}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs text-gray-500">Giá TV (mua bán)</p>
                <p className="mt-1 text-sm font-black text-gray-900">{formatPricePerSqm(saleStat?.median_price_per_sqm ?? null)}</p>
              </div>
            </div>
          </div>
          {/* Internal link ngược lên khu vực + pillar (mục 8 doc). */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-black text-gray-900">Khu vực liên quan</h2>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link href="/khu-dan-cu" className="font-semibold text-red-600 hover:underline">Tất cả khu dân cư</Link>
              <Link href="/khu-vuc" className="font-semibold text-gray-700 hover:text-red-600">Khu vực bất động sản</Link>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
