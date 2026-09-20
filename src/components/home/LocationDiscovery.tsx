'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronRight, List, MapPin } from 'lucide-react';
import { useAreas, useDistricts } from '../../lib/hooks/useTaxonomy';
import { useHomeLocationStats } from '../../lib/hooks/useHomeLocationStats';
import { readLocationDiscovery, resolveLocationSelection } from '../../lib/homeLocationDiscovery';
import { formatLocationPrice, formatLocationPricePerSqm } from '../../lib/homeLocationStats';
import { pageToHref } from '../../lib/router';
import { HomeSectionEmpty, getHomeSectionDisplayConfig } from '../HomeSectionState';

export function LocationDiscovery({ settings }: { settings: Record<string, unknown> }) {
  const areasQuery = useAreas();
  const areas = areasQuery.data ?? [];
  const items = readLocationDiscovery(settings, areas).items.filter(item => item.enabled);
  const [selected, setSelected] = useState('');
  const [expandedArea, setExpandedArea] = useState('');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const area = resolveLocationSelection(selected, items, areas);
  const districtsQuery = useDistricts(area?.id, { fetchAll: false });
  const districts = (districtsQuery.data ?? []).filter(district => district.area_id === area?.id);
  const statsQuery = useHomeLocationStats(areasQuery.isSuccess && items.length > 0);
  const stats = statsQuery.isError ? undefined : statsQuery.data;
  const expanded = expandedArea === area?.id;
  const config = getHomeSectionDisplayConfig(settings);
  const customTitle = typeof settings.title === 'string' ? settings.title.trim() : '';
  const cardColumns = items.length === 1 ? 'max-w-lg' : items.length === 2 ? 'sm:grid-cols-2'
    : items.length === 3 ? 'sm:grid-cols-2 lg:grid-cols-3'
      : items.length === 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5';

  useEffect(() => {
    const tab = tabRefs.current.find(element => element?.id === `location-tab-${area?.id}`);
    const viewport = tab?.parentElement?.parentElement;
    if (!tab || !viewport) return;
    const revealTab = () => {
      const target = tab.getBoundingClientRect();
      const bounds = viewport.getBoundingClientRect();
      viewport.scrollLeft += Math.min(0, target.left - bounds.left) + Math.max(0, target.right - bounds.right);
    };
    revealTab();
    const observer = new ResizeObserver(revealTab);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [area?.id, items.length, areasQuery.isSuccess]);

  const chooseArea = (id: string) => {
    setSelected(id);
    setExpandedArea('');
  };

  if (!areasQuery.isPending && !areasQuery.isError && !items.length && config.emptyBehavior !== 'empty_state') return null;

  return (
    <section data-testid="location-discovery" className="overflow-hidden bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <header className="mx-auto mb-10 max-w-3xl text-center sm:mb-12">
          <p className="inline-flex items-center gap-3 text-xs font-bold tracking-[0.12em] text-red-700 sm:text-sm">
            <span aria-hidden="true" className="h-7 w-1 rounded-full bg-red-700" />
            KHÁM PHÁ KHU VỰC
            <span aria-hidden="true" className="h-7 w-1 rounded-full bg-red-700" />
          </p>
          <h2 className="mt-5 text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
            {customTitle || <>Khám phá bất động sản <span className="text-red-700">theo vị trí</span></>}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
            Tìm bất động sản theo địa phương, tham khảo giá chào bán và khám phá quận / huyện phù hợp với bạn.
          </p>
        </header>

        {areasQuery.isPending ? <p role="status" className="py-10 text-center text-sm text-slate-500">Đang tải khu vực…</p>
          : areasQuery.isError ? <div role="alert" className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">
            Không tải được khu vực. <button type="button" onClick={() => void areasQuery.refetch()} className="min-h-11 px-2 font-bold underline">Thử lại</button>
          </div>
            : !items.length ? <HomeSectionEmpty config={config} />
              : <>
                <div className="relative">
                  <div aria-hidden="true" className="pointer-events-none absolute -inset-x-4 top-20 h-64 opacity-40 [background-image:radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:9px_9px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
                  <div className="relative mb-5 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Khu vực nổi bật</h3>
                      <p className="mt-1.5 text-sm text-slate-500">{items.length} địa phương để bạn khám phá</p>
                    </div>
                    <Link href={pageToHref({ name: 'regions' })} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-red-700 hover:underline">
                      Tất cả khu vực<ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  </div>
                  <div data-testid="location-featured-grid" className={`relative grid grid-cols-1 gap-4 lg:gap-5 ${cardColumns}`}>
                    {items.map(item => {
                      const province = areas.find(value => value.id === item.area_id)!;
                      const image = item.image_url || province.image_url;
                      const isSelected = item.area_id === area?.id;
                      const values = stats?.areas[item.area_id];
                      const count = stats ? values?.count ?? 0 : null;
                      return <article key={item.id} data-testid="location-featured-card" className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white transition-shadow hover:shadow-lg">
                        <button type="button" aria-label={`Chọn ${province.name}`} aria-pressed={isSelected} aria-controls="home-location-districts" onClick={() => chooseArea(item.area_id)}
                          className="group relative block aspect-[16/11] w-full shrink-0 overflow-hidden bg-slate-700 text-left text-white focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white">
                          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center"><MapPin className="h-14 w-14 text-slate-500" /></span>
                          {image && <img key={image} src={image} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; }} className="absolute inset-0 h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105" />}
                          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-900/15 to-transparent" />
                          {isSelected && <span aria-hidden="true" className="absolute right-3 top-3 rounded-full bg-white p-1.5 text-red-700 shadow"><Check className="h-4 w-4" /></span>}
                          <span className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                            <span className="line-clamp-2 block text-xl font-bold leading-tight tracking-tight sm:text-2xl">{province.name}</span>
                            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-white/95 sm:text-sm">
                              <span data-testid="location-card-count">{count === null ? 'Chưa có số liệu' : `${count} tin`}</span>
                              {values?.minSalePriceVnd != null && <span className="border-l border-white/40 pl-3">Giá bán từ {formatLocationPrice(values.minSalePriceVnd)}</span>}
                            </span>
                          </span>
                        </button>
                        <div className="flex flex-1 flex-col p-4 sm:p-5">
                          <p className="text-[11px] font-semibold uppercase leading-5 text-slate-500 sm:text-xs">Giá chào bán trung bình</p>
                          <div className="mt-2 flex min-h-8 flex-wrap items-baseline gap-x-2 gap-y-1" data-testid="location-card-price">
                            {values?.avgSalePriceVnd != null ? <>
                              <span className="text-xl font-bold tracking-tight text-red-600">≈{formatLocationPrice(values.avgSalePriceVnd)}</span>
                              {values.avgSalePricePerSqmVnd != null && <>
                                <span aria-hidden="true" className="text-slate-300">•</span>
                                <span className="text-sm font-semibold text-slate-700" title={`Trung bình đơn giá của ${values.sqmSampleCount} tin bán có giá và diện tích hợp lệ`}>{formatLocationPricePerSqm(values.avgSalePricePerSqmVnd)}</span>
                              </>}
                            </> : <span className="text-sm text-slate-400">{statsQuery.isError ? 'Chưa tải được số liệu' : stats ? 'Đang cập nhật' : 'Đang tải số liệu…'}</span>}
                          </div>
                          <p className="mt-2 min-h-5 text-xs leading-5 text-slate-500">
                            {values && values.pricedSaleCount > 0 ? `${values.pricedSaleCount} tin bán có giá${values.avgSalePriceVnd === null ? ' · Chưa đủ mẫu tính trung bình' : ''}` : 'Chỉ tính trên tin mua bán có giá hợp lệ'}
                          </p>
                          {item.subtitle && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{item.subtitle}</p>}
                          <div className="flex-1" />
                          <Link href={`/khu-vuc/${province.slug}`} aria-label={`Khám phá ${province.name}`} className="mt-5 flex min-h-11 items-center justify-center gap-3 rounded-lg border border-slate-100 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600">
                            Khám phá {province.name}<ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
                          </Link>
                        </div>
                      </article>;
                    })}
                  </div>
                  <div className="relative mt-4 flex flex-wrap items-start justify-between gap-x-5 gap-y-2 text-xs leading-5 text-slate-500">
                    <p>Giá chào bán tham khảo, không phải giá giao dịch. Trung bình từ ít nhất 3 mẫu hợp lệ.</p>
                    {stats && <time dateTime={stats.computedAt}>Cập nhật {new Date(stats.computedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>}
                  </div>
                  {statsQuery.isError && <div role="alert" className="mt-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
                    Chưa tải được số liệu khu vực. Bạn vẫn có thể xem tin theo địa phương.
                    <button type="button" disabled={statsQuery.isFetching} onClick={() => void statsQuery.refetch()} className="ml-1 min-h-11 px-2 font-bold underline disabled:opacity-50">{statsQuery.isFetching ? 'Đang thử lại…' : 'Thử lại số liệu'}</button>
                  </div>}
                </div>

                {area && <div className="mt-12 border-t border-slate-100 pt-10 sm:mt-16 sm:pt-12" data-testid="location-directory">
                  <div className="mb-6 flex items-center gap-4 sm:mb-8">
                    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-red-800 text-white sm:h-14 sm:w-14"><List className="h-6 w-6" /></span>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Khám phá theo địa phương</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500 sm:text-base">Chọn tỉnh / thành phố để xem bất động sản theo quận / huyện</p>
                    </div>
                  </div>
                  <div className="max-w-full overflow-x-auto pb-3">
                    <div role="tablist" aria-label="Chọn địa phương" className="inline-flex min-w-max rounded-2xl border border-slate-100 bg-white p-1 shadow-sm">
                      {areas.map((province, index) => {
                        const active = province.id === area.id;
                        return <button key={province.id} ref={element => { tabRefs.current[index] = element; }} id={`location-tab-${province.id}`} type="button" role="tab" aria-selected={active} aria-controls="home-location-districts" tabIndex={active ? 0 : -1} onClick={() => chooseArea(province.id)}
                          onKeyDown={event => {
                            const target = event.key === 'ArrowRight' ? (index + 1) % areas.length
                              : event.key === 'ArrowLeft' ? (index - 1 + areas.length) % areas.length
                                : event.key === 'Home' ? 0 : event.key === 'End' ? areas.length - 1 : -1;
                            if (target < 0) return;
                            event.preventDefault();
                            chooseArea(areas[target].id);
                            tabRefs.current[target]?.focus({ preventScroll: true });
                            tabRefs.current[target]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                          }}
                          className={`relative flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:min-h-16 sm:px-5 sm:text-base ${active ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-50'}`}>
                          <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span>
                          {province.name}
                          {active && <span aria-hidden="true" className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-blue-600" />}
                        </button>;
                      })}
                    </div>
                  </div>

                  <div id="home-location-districts" role="tabpanel" aria-labelledby={`location-tab-${area.id}`} tabIndex={0} className="mt-5 outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-600">Quận / huyện tại {area.name}</h4>
                      <Link href={pageToHref({ name: 'listings', areaId: area.id })} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-red-700 hover:underline">Xem tất cả tin tại {area.name}<ChevronRight aria-hidden="true" className="h-4 w-4" /></Link>
                    </div>
                    {districtsQuery.isPending ? <p role="status" className="rounded-2xl border border-slate-100 p-8 text-sm text-slate-500">Đang tải quận / huyện…</p>
                      : districtsQuery.isError ? <div role="alert" className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-900">Không tải được quận / huyện. <button type="button" onClick={() => void districtsQuery.refetch()} className="min-h-11 px-2 font-bold underline">Thử lại</button></div>
                        : !districts.length ? <p className="rounded-2xl border border-slate-100 p-8 text-sm text-slate-500">Chưa có quận / huyện trong cấu hình khu vực này.</p>
                          : <>
                            <div data-testid="location-district-grid" className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-200/70 md:grid-cols-2 lg:grid-cols-3">
                              {(expanded ? districts : districts.slice(0, 12)).map((district, index) => {
                                const count = stats ? stats.areas[area.id]?.districtCounts[district.id] ?? 0 : null;
                                return <Link key={district.id} href={pageToHref({ name: 'listings', areaId: area.id, district: district.name })} className="group flex min-w-0 items-center gap-3 bg-white px-4 py-6 transition-colors hover:bg-blue-50/60 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 xl:gap-4 xl:px-5">
                                  <span aria-hidden="true" className="flex h-12 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-600 sm:h-14 sm:w-12">{index + 1}</span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-base font-semibold leading-6 text-slate-800 group-hover:text-blue-700">{district.name}</span>
                                    <span data-testid="location-district-count" className="mt-1 block text-xs leading-5 text-slate-500">{count === null ? (statsQuery.isError ? 'Chưa tải được số tin' : 'Đang tải số tin…') : `${count} tin đăng bất động sản`}</span>
                                  </span>
                                  <span aria-hidden="true" className="flex shrink-0 items-center gap-2">
                                    {count !== null && <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-slate-600">{count}</span>}
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors group-hover:bg-blue-600 group-hover:text-white"><ChevronRight className="h-4 w-4" /></span>
                                  </span>
                                </Link>;
                              })}
                            </div>
                            {districts.length > 12 && <div className="mt-5 text-center"><button type="button" aria-expanded={expanded} aria-controls="home-location-districts" onClick={() => setExpandedArea(expanded ? '' : area.id)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">{expanded ? 'Thu gọn' : `Xem thêm quận / huyện (${districts.length - 12})`}<ChevronDown aria-hidden="true" className={`h-4 w-4 ${expanded ? 'rotate-180' : ''}`} /></button></div>}
                          </>}
                  </div>
                </div>}
              </>}
      </div>
    </section>
  );
}
