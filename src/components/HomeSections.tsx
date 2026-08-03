'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, MapPin, Sparkles, TrendingUp } from 'lucide-react';
import { pageToHref } from '../lib/router';
import type { Area } from '../lib/supabase';

// Khung các khối khám phá của trang chủ, dựng theo cấu trúc giao diện tham chiếu.
// Nguyên tắc: chỉ hiển thị số liệu có nguồn thật. Chỗ chưa đấu nối dữ liệu thì
// ghi rõ "Đang cập nhật" thay vì bịa số — không tạo dữ liệu giả.

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
