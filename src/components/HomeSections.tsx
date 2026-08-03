'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Compass, Map as MapIcon, MapPin, Sparkles, TrendingUp } from 'lucide-react';
import { pageToHref } from '../lib/router';
import type { Area, NewsArticle } from '../lib/supabase';

// Khung các khối khám phá của trang chủ, dựng theo cấu trúc giao diện tham chiếu.
// Nguyên tắc: chỉ hiển thị số liệu có nguồn thật. Chỗ chưa đấu nối dữ liệu thì
// ghi rõ "Đang cập nhật" thay vì bịa số — không tạo dữ liệu giả.

// Tiêu đề khối kiểu tham chiếu: vạch dọc gradient + nhãn hoa + tiêu đề gradient.
export function BlockHeading({ eyebrow, title, highlight, description, center = false }: {
  eyebrow: string;
  title: string;
  highlight?: string;
  description?: string;
  center?: boolean;
}) {
  return (
    <div className={center ? 'text-center' : ''}>
      <div className={`mb-4 inline-flex items-center gap-3 ${center ? 'justify-center' : ''}`}>
        <span className="h-8 w-1 rounded-full bg-gradient-to-b from-urban-500 to-urban-600" />
        <span className="text-xs font-bold uppercase tracking-wider text-urban-600 sm:text-sm">{eyebrow}</span>
        {center && <span className="h-8 w-1 rounded-full bg-gradient-to-b from-urban-500 to-urban-600" />}
      </div>
      <h2 className="text-2xl font-black leading-tight text-slate-900 sm:text-3xl">
        {title}
        {highlight && (
          <>
            {' '}
            <span className="bg-gradient-to-r from-urban-500 to-urban-700 bg-clip-text text-transparent">{highlight}</span>
          </>
        )}
      </h2>
      {description && <p className={`mt-3 text-sm leading-6 text-slate-500 sm:text-base ${center ? 'mx-auto max-w-2xl' : 'max-w-2xl'}`}>{description}</p>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, highlight, description, href, linkLabel = 'Xem tất cả' }: {
  eyebrow?: string;
  title: string;
  highlight?: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-urban-200 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-urban-700">
            {eyebrow}
          </span>
        )}
        <h2 className="mt-2 text-2xl font-black leading-tight text-slate-900 md:text-3xl">
          {title}{highlight && <span className="text-urban-500"> {highlight}</span>}
        </h2>
        {description && <p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {href && (
        <Link href={href} className="inline-flex flex-shrink-0 items-center gap-1 text-sm font-bold text-urban-600 transition-colors hover:text-urban-700">
          {linkLabel}<ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

// "Khu vực trọng điểm" — thẻ lớn cho các tỉnh/thành chính, kèm số tin thật.
export function KeyAreasSection({ areas, counts }: { areas: Area[]; counts?: Record<string, number> }) {
  if (areas.length === 0) return null;
  return (
    <section className="bg-gradient-to-br from-white via-urban-100 to-white py-10">
      <div className="mx-auto max-w-7xl px-4">
        <SectionHeading
          eyebrow="Khu vực trọng điểm"
          title="Thị trường"
          highlight="đang hoạt động"
          description="Chọn khu vực để xem toàn bộ bất động sản đang mở bán và cho thuê."
          href={pageToHref({ name: 'regions' })}
          linkLabel="Xem tất cả khu vực"
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {areas.slice(0, 5).map(area => {
            const count = counts?.[area.id];
            return (
              <Link key={area.id} href={pageToHref({ name: 'listings', areaId: area.id })}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:border-urban-300 hover:shadow-soft">
                <div className="relative h-28 overflow-hidden bg-slate-100">
                  {area.image_url ? (
                    <Image src={area.image_url} alt={area.name} fill sizes="(max-width: 768px) 50vw, 20vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-urban-200 to-urban-300">
                      <MapPin className="h-7 w-7 text-urban-500" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="truncate text-sm font-bold text-slate-900">{area.name}</h3>
                  <p className="mt-0.5 text-xs font-semibold text-urban-600">
                    {typeof count === 'number' ? `${count} tin đăng` : 'Đang cập nhật'}
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 transition-colors group-hover:text-urban-600">
                    Xem ngay<ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Dải thống kê nền tảng. Chỉ nhận số đã tính từ dữ liệu thật; thiếu thì để trống.
export function MarketStatsSection({ stats }: { stats: { label: string; value: string; hint?: string }[] }) {
  if (stats.length === 0) return null;
  return (
    <section className="border-y border-slate-200 bg-[#f7f7f8] py-6">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 md:grid-cols-4">
        {stats.map(stat => (
          <div key={stat.label} className="text-center">
            <p className="text-2xl font-black text-urban-500 md:text-3xl">{stat.value}</p>
            <p className="mt-0.5 text-xs font-bold text-slate-700">{stat.label}</p>
            {stat.hint && <p className="text-[11px] text-slate-400">{stat.hint}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

// Khối CTA "kênh phân phối" — mời đăng tin, không chứa số liệu nên an toàn.
export function DistributionCtaSection({ onPostListing }: { onPostListing?: () => void }) {
  return (
    <section className="py-10">
      <div className="mx-auto max-w-7xl px-4">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-urban-700 via-urban-500 to-amber-500 px-6 py-10 text-center md:px-12 md:py-14">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur">
            <Sparkles className="h-3 w-3" />Kênh phân phối
          </span>
          <h2 className="mx-auto mt-3 max-w-2xl text-2xl font-black leading-tight text-white md:text-4xl">
            Đưa bất động sản của bạn tới đúng người đang tìm
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/85">
            Đăng tin miễn phí, tin được kiểm duyệt trước khi hiển thị công khai.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href={pageToHref({ name: 'post-listing' })} onClick={onPostListing}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-urban-700 transition-transform hover:scale-[1.02]">
              Bắt đầu đăng tin<ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={pageToHref({ name: 'listings' })}
              className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10">
              <TrendingUp className="h-4 w-4" />Xem thị trường
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// "Map AI" — khung tìm BĐS theo vị trí. Bản đồ thật sẽ đấu nối sau; hiện chỉ là
// khung dẫn sang trang danh sách ở chế độ bản đồ (đã có sẵn viewMode='map').
export function MapDiscoverySection({ areas }: { areas: Area[] }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-white via-urban-100 to-white py-12">
      <div className="pointer-events-none absolute left-10 top-20 h-72 w-72 rounded-full bg-urban-200/40 blur-3xl" />
      <div className="pointer-events-none absolute bottom-20 right-10 h-96 w-96 rounded-full bg-urban-300/20 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-7xl px-4">
        <BlockHeading
          center
          eyebrow="Bản đồ bất động sản"
          title="Khám phá bất động sản"
          highlight="theo vị trí"
          description="Xem bất động sản trực tiếp trên bản đồ để nắm vị trí, khu vực lân cận và mức giá quanh đó."
        />
        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
          <div className="relative flex min-h-[240px] flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-50 via-white to-urban-100 px-6 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-urban-500 to-urban-700 shadow-soft">
              <MapIcon className="h-7 w-7 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Xem toàn bộ tin trên bản đồ</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
                Lọc theo khu vực rồi chuyển sang chế độ bản đồ để xem vị trí từng bất động sản.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href={pageToHref({ name: 'listings' })}
                className="inline-flex items-center gap-2 rounded-xl bg-urban-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-urban-600">
                <MapIcon className="h-4 w-4" />Mở bản đồ
              </Link>
              {areas.slice(0, 3).map(area => (
                <Link key={area.id} href={pageToHref({ name: 'listings', areaId: area.id })}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-urban-300 hover:text-urban-600">
                  <MapPin className="h-3.5 w-3.5 text-urban-500" />{area.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// "Tỉnh thành theo miền" — tab Bắc/Trung/Nam. Phân miền lấy từ cột region của
// areas khi có; area chưa gán miền dồn vào "Khác" để không bị mất khỏi danh sách.
const ZONE_TABS = [
  { key: 'bac', label: 'Miền Bắc' },
  { key: 'trung', label: 'Miền Trung' },
  { key: 'nam', label: 'Miền Nam' },
] as const;

export function AreasByZoneSection({ areas, zoneOf }: { areas: Area[]; zoneOf?: (area: Area) => string | null }) {
  const [zone, setZone] = useState<string>(ZONE_TABS[0].key);
  if (areas.length === 0) return null;

  // Chưa đấu nối dữ liệu miền: hiện toàn bộ tỉnh/thành để khung vẫn dùng được.
  const resolved = zoneOf ? areas.filter(area => zoneOf(area) === zone) : areas;
  const unmapped = !zoneOf;

  return (
    <section className="bg-white py-12">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-urban-600 to-urban-700">
            <Compass className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 sm:text-2xl">Tỉnh thành theo miền</h2>
            <p className="mt-0.5 text-sm font-medium text-slate-500">Khám phá bất động sản theo từng vùng miền</p>
          </div>
        </div>

        {!unmapped && (
          <div className="mb-5 flex w-full overflow-x-auto scrollbar-hide">
            <div className="flex min-w-max gap-1 rounded-2xl border border-slate-100 bg-white p-1 shadow-sm lg:min-w-0">
              {ZONE_TABS.map(tab => (
                <button key={tab.key} type="button" onClick={() => setZone(tab.key)}
                  className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-colors ${zone === tab.key ? 'bg-urban-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {resolved.map(area => (
            <Link key={area.id} href={pageToHref({ name: 'listings', areaId: area.id })}
              className="group flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 transition-all hover:-translate-y-0.5 hover:border-urban-300 hover:shadow-soft">
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-800">{area.name}</span>
                <span className="text-[11px] font-medium text-slate-400">Xem tin đăng</span>
              </span>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-300 transition-colors group-hover:text-urban-500" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// "Phong thủy & Kiến trúc" — khối nội dung chuyên mục. Nhận bài viết thật; không
// có bài thì hiện đúng thông báo trống như giao diện tham chiếu, không dựng bài giả.
export function FengShuiSection({ articles, href }: { articles: NewsArticle[]; href: string }) {
  return (
    <section className="bg-gradient-to-br from-white via-urban-100 to-white py-12">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <BlockHeading
            eyebrow="Phong thủy & Kiến trúc"
            title="Không gian"
            highlight="hài hòa"
            description="Kiến thức bố trí nhà cửa và tối ưu không gian sống."
          />
          <Link href={href} className="inline-flex flex-shrink-0 items-center gap-1 text-sm font-bold text-urban-600 transition-colors hover:text-urban-700">
            Xem thêm<ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6">
          {articles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-10 text-center text-sm text-slate-500">
              Hiện chưa có bài viết nào trong chuyên mục này.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {articles.slice(0, 3).map(article => (
                <Link key={article.id} href={`/tin-tuc/${article.slug}`}
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-soft">
                  <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
                    {article.image_url && (
                      <Image src={article.image_url} alt={article.title} fill sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105" />
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-2 text-sm font-bold leading-5 text-slate-900 group-hover:text-urban-600">{article.title}</h3>
                    {article.excerpt && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">{article.excerpt}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
