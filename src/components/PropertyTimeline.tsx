'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MapPin, X } from 'lucide-react';
import { getPropertyTimelinePage, type TimelineProperty } from '../lib/api/propertyTimeline';
import { buildPropertyPath } from '../lib/api/properties';
import { formatPropertyPrice } from '../lib/listingPrice';
import { groupTimelineProperties, layoutTimelineProperties, shiftTimelineDay, timelineDay, timelineHour, timelineMonthDays, TIMELINE_HOURS, TIMELINE_TIME_ZONE } from '../lib/propertyTimeline';

const controlClass = 'inline-flex min-h-9 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-35';

function displayDay(day: string): string {
  return day.split('-').reverse().join('/');
}

function displayTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('vi-VN', { timeZone: TIMELINE_TIME_ZONE, hour12: false });
}

function TimelineDatePicker({ day, today, onChange }: { day: string; today: string; onChange: (day: string) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(day.slice(0, 7));
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selectedButton = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const weekDay = new Date(`${day}T12:00:00+07:00`).toLocaleDateString('vi-VN', { weekday: 'long', timeZone: TIMELINE_TIME_ZONE });

  useEffect(() => {
    if (!open) return;
    selectedButton.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  const select = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today || value < '1000-01-01') return;
    onChange(value);
    close();
  };
  const moveMonth = (delta: number) => {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    setMonth(date.toISOString().slice(0, 7));
  };

  return (
    <div ref={root} className="relative" onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); close(); } }}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
      <button ref={trigger} type="button" aria-label={`Chọn ngày, ${displayDay(day)}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined}
        onClick={() => { setMonth(day.slice(0, 7)); setOpen(value => !value); }}
        className="mx-0.5 flex min-w-[112px] flex-col items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50">
        <span className={`flex items-center gap-1 text-[13px] font-black leading-tight ${day === today ? 'text-red-600' : 'text-slate-800'}`}>
          {day === today ? 'Hôm nay' : weekDay}<CalendarDays className="h-3 w-3 opacity-60" />
        </span>
        <span className="mt-0.5 text-[11px] font-medium leading-tight text-slate-500">{displayDay(day)}</span>
      </button>
      {open && (
        <div id={dialogId} role="dialog" aria-label="Chọn ngày xem dòng thời gian" className="absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-1">
            <button type="button" aria-label="Tháng trước" className="rounded p-1.5 hover:bg-slate-100" onClick={() => moveMonth(-1)}><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-bold text-slate-800">Tháng {Number(month.slice(5))} {month.slice(0, 4)}</span>
            <button type="button" aria-label="Tháng sau" disabled={month >= today.slice(0, 7)} className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30" onClick={() => moveMonth(1)}><ChevronRight className="h-4 w-4" /></button>
            <button type="button" aria-label="Đóng lịch" className="rounded p-1.5 hover:bg-slate-100" onClick={close}><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(label => <span key={label} className="py-2 font-semibold text-slate-500">{label}</span>)}
            {timelineMonthDays(`${month}-01`).map(value => (
              <button key={value} ref={value === day ? selectedButton : undefined} type="button" aria-label={displayDay(value)} aria-pressed={value === day} aria-current={value === today ? 'date' : undefined}
                disabled={value > today} onClick={() => select(value)}
                className={`h-8 rounded-md font-medium disabled:cursor-not-allowed disabled:opacity-25 ${value === day ? 'bg-red-600 text-white' : `${value.startsWith(month) ? 'text-slate-800' : 'text-slate-400'} hover:bg-red-50`}`}>
                {Number(value.slice(8))}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-xs text-slate-600">Chọn ngày trực tiếp
            <input type="date" aria-label="Ngày xem dòng thời gian" min="1000-01-01" max={today} value={day} onChange={event => select(event.target.value)} className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          </label>
        </div>
      )}
    </div>
  );
}

function TimelineCard({ property }: { property: TimelineProperty }) {
  const rental = property.listing_type === 'cho_thue';
  const location = [property.district, property.city].filter(Boolean).join(', ');
  return (
    <Link href={buildPropertyPath(property)} prefetch={false} data-testid="timeline-property" aria-label={`Xem bất động sản: ${property.title}`}
      title={`${property.title}\n${location}\n${formatPropertyPrice(property)} · Mốc tạo ${displayTime(new Date(property.created_at).getTime())}`}
      className={`group relative flex h-full min-h-28 flex-col justify-between gap-2 overflow-hidden rounded-xl border p-3 pl-4 transition-colors hover:shadow-md ${rental ? 'border-violet-100 bg-violet-50 hover:border-violet-300' : 'border-emerald-100 bg-emerald-50 hover:border-emerald-300'}`}>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${rental ? 'bg-violet-400' : 'bg-emerald-400'}`} />
      <p className="line-clamp-2 text-[10px] font-semibold leading-4 text-slate-800 group-hover:text-red-700">{property.title}</p>
      <div className="flex min-w-0 items-center gap-2 text-[10px] leading-4 text-slate-500">
        <p className="flex min-w-0 flex-1 items-center gap-1" title={location}><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{location || 'Chưa có khu vực'}</span></p>
        <time dateTime={property.created_at} title="Mốc tạo bản ghi (giờ Việt Nam)" className="shrink-0 font-medium tabular-nums">{displayTime(new Date(property.created_at).getTime()).slice(0, 5)}</time>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="break-words rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold leading-4 text-red-600">{formatPropertyPrice(property)}</span>
        {property.area_sqm != null && property.area_sqm > 0 && <span className="text-[10px] font-semibold leading-4 text-slate-500">· {property.area_sqm}m²</span>}
      </div>
    </Link>
  );
}

export function PropertyTimeline() {
  const [now, setNow] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const titleId = useId();
  useEffect(() => {
    const tick = () => { if (!document.hidden) setNow(new Date()); };
    tick();
    const timer = window.setInterval(tick, 15_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);
  const today = now ? timelineDay(now) : '';
  const day = selectedDay ?? today;
  const isToday = day === today;
  const query = useInfiniteQuery({
    queryKey: ['property-timeline', day],
    queryFn: ({ pageParam, signal }) => getPropertyTimelinePage(day, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: page => page.nextPage,
    enabled: Boolean(day),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    staleTime: 0,
    retry: 1,
  });
  const buckets = groupTimelineProperties(query.data?.pages.flatMap(page => page.data) ?? [], day);
  const total = query.data?.pages[0]?.total;
  const currentSlot = now && isToday ? Math.floor(timelineHour(now) / 2) : -1;
  const selectDay = (value: string) => { if (value <= today) setSelectedDay(value === today ? null : value); };
  const moveDay = (delta: number) => { if (day) selectDay(shiftTimelineDay(day, delta)); };
  const cards = layoutTimelineProperties(buckets);
  const hasRows = cards.length > 0;

  return (
    <section aria-labelledby={titleId} data-testid="property-timeline" className="bg-slate-50 py-10">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500" aria-live="polite">
              <span className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-widest ${isToday && query.isSuccess ? 'text-red-600' : 'text-slate-500'}`}>
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${isToday && query.isSuccess ? 'bg-red-500 motion-safe:animate-pulse' : 'bg-slate-300'}`} />
                {query.isError ? 'Mất kết nối' : query.isPending ? 'Đang tải' : isToday ? 'Trực tiếp' : 'Lịch sử'}
              </span>
              {total !== undefined && <span>· {total} tin</span>}
              {query.dataUpdatedAt > 0 && <span>· {displayTime(query.dataUpdatedAt)}</span>}
            </div>
            <h2 id={titleId} className="text-xl font-black leading-tight tracking-tight text-slate-900 sm:text-2xl">Dòng thời gian bất động sản</h2>
          </div>
          <div className="flex flex-wrap items-center gap-1" aria-label="Điều hướng ngày">
            <button type="button" aria-label="Tuần trước" disabled={!day} onClick={() => moveDay(-7)} className={controlClass}><ChevronsLeft className="h-3.5 w-3.5" /><span className="hidden sm:inline">Tuần trước</span></button>
            <button type="button" aria-label="Ngày trước" disabled={!day} onClick={() => moveDay(-1)} className={controlClass}><ChevronLeft className="h-3.5 w-3.5" /><span className="hidden sm:inline">Ngày trước</span></button>
            {day && <TimelineDatePicker day={day} today={today} onChange={selectDay} />}
            <button type="button" aria-label="Ngày sau" disabled={!day || shiftTimelineDay(day, 1) > today} onClick={() => moveDay(1)} className={controlClass}><span className="hidden sm:inline">Ngày sau</span><ChevronRight className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Tuần tới" disabled={!day || shiftTimelineDay(day, 7) > today} onClick={() => moveDay(7)} className={controlClass}><span className="hidden sm:inline">Tuần tới</span><ChevronsRight className="h-3.5 w-3.5" /></button>
            {!isToday && <button type="button" onClick={() => setSelectedDay(null)} className="ml-1 min-h-9 rounded-lg bg-red-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-red-700">Hôm nay</button>}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm" aria-busy={query.isFetching}>
          {query.isError && (
            <div role="alert" className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Không tải được dòng thời gian.{hasRows ? ' Đang giữ dữ liệu lần tải thành công trước.' : ' Vui lòng thử lại.'}
              <button type="button" disabled={query.isFetching} onClick={() => { if (query.isFetchNextPageError) void query.fetchNextPage(); else void query.refetch(); }} className="ml-2 font-bold underline disabled:opacity-50">Thử lại</button>
            </div>
          )}
          <div className="overflow-x-auto" role="region" aria-label="Tin bất động sản theo khung giờ, cuộn ngang để xem đủ 24 giờ" tabIndex={0}>
            <div className="min-w-[1200px]">
              <div className="grid grid-cols-12 border-b border-slate-100">
                {TIMELINE_HOURS.map((hour, index) => (
                  <div key={hour} data-testid={`timeline-hour-${hour}`} className={`relative border-r border-slate-50 px-1.5 py-2.5 text-center last:border-0 ${index === currentSlot ? 'bg-red-50 text-red-600' : index < currentSlot ? 'bg-slate-50 text-slate-400' : 'text-slate-500'}`}>
                    <span className="whitespace-nowrap text-xs font-semibold tracking-wider">{String(hour).padStart(2, '0')}:00</span>
                    {index === currentSlot && <span className="block text-[9px] font-bold">▼ bây giờ</span>}
                  </div>
                ))}
              </div>
              {hasRows && <div className="relative py-5">
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 inset-y-5 grid grid-cols-12">
                  {buckets.map((items, index) => <div key={index} className={`border-r border-slate-50 last:border-0 ${index === currentSlot ? 'bg-red-50/30' : ''}`}>
                    {!items.length && <div className="flex h-28 items-center justify-center text-xs text-slate-300">—</div>}
                  </div>)}
                </div>
                <div className="relative grid grid-cols-12 gap-y-3">
                  {cards.map(({ property, slot, column, row }) => <div key={property.id} data-testid="timeline-placement" data-slot={slot}
                    aria-label={`Khung giờ ${String(slot * 2).padStart(2, '0')}:00–${String(slot * 2 + 2).padStart(2, '0')}:00`}
                    className="mx-2 min-w-0" style={{ gridColumn: `${column + 1} / span 2`, gridRow: row + 1 }}>
                    <TimelineCard property={property} />
                  </div>)}
                </div>
              </div>}
            </div>
          </div>
          {!hasRows && !query.isError && <div role="status" className="px-4 py-14 text-center">
            <p className="text-sm font-semibold text-slate-600">{query.isPending ? 'Đang tải tin bất động sản…' : isToday ? 'Chưa có tin rao trong hôm nay' : `Chưa có tin rao ngày ${displayDay(day)}`}</p>
            {!query.isPending && <p className="mt-1 text-xs text-slate-400">{isToday ? 'Đang chờ tin mới…' : 'Chọn ngày khác để xem các tin đang công khai.'}</p>}
          </div>}
          {query.hasNextPage && <div className="border-t border-slate-100 px-4 py-3 text-center">
            <button type="button" disabled={query.isFetching} onClick={() => void query.fetchNextPage()} className={controlClass}>{query.isFetchingNextPage ? 'Đang tải thêm…' : `Xem thêm tin (${buckets.flat().length}/${total})`}</button>
          </div>}
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[10px] leading-relaxed text-slate-500">
          <p>Giờ Việt Nam (UTC+7) · Theo mốc tạo bản ghi · Chỉ gồm tin đang công khai.</p>
          <p>{query.isFetching ? 'Đang cập nhật…' : 'Tự động cập nhật mỗi 30s'} · {query.dataUpdatedAt ? `Lần thành công: ${displayTime(query.dataUpdatedAt)}` : 'Chưa cập nhật'}</p>
        </div>
      </div>
    </section>
  );
}
