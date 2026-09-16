'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, MapPin, X } from 'lucide-react';
import { buildPropertyPath, getPublicPropertiesByIds } from '../lib/api/properties';
import type { Property } from '../lib/supabase';
import { formatPropertyPrice } from '../lib/listingPrice';
import { getRecentlyViewed, pruneRecentlyViewedUnavailable, subscribeRecentlyViewedChanged } from '../lib/recentlyViewed';
import { SafeImage } from './SafeImage';
import { FALLBACK_PROPERTY_IMAGE } from '../lib/propertyImages';

export function RecentlyViewedDrawer() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('ready');
  const [items, setItems] = useState<Property[]>([]);
  const [revision, setRevision] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return subscribeRecentlyViewedChanged(() => setRevision(value => value + 1));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const ids = getRecentlyViewed().map(item => item.id);
    setItems([]);
    if (!ids.length) { setState('ready'); return; }
    setState('loading');
    getPublicPropertiesByIds(ids).then(properties => {
      if (!active) return;
      pruneRecentlyViewedUnavailable(ids, properties.map(property => property.id));
      setItems(properties);
      setState('ready');
    }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [open, revision]);

  return <>
    <button ref={trigger} type="button" aria-label="Đã xem gần đây" aria-haspopup="dialog" aria-expanded={open} data-testid="recently-viewed-trigger" onClick={() => setOpen(true)}
      className="fixed right-0 top-[calc(50%+4rem)] z-40 flex flex-col items-center gap-1 rounded-l-xl border border-r-0 border-slate-200 bg-white px-2 py-3 text-[11px] font-semibold text-slate-600 shadow-md hover:text-red-600 focus-visible:outline-red-600">
      <Clock className="h-5 w-5 text-red-600" /><span className="[writing-mode:vertical-rl]">Đã xem</span>
    </button>
    <dialog ref={dialog} aria-label="Đã xem gần đây" data-testid="recently-viewed-drawer" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')).filter(element => element.getClientRects().length);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false);
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-sm border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/40">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold"><Clock className="h-5 w-5 text-red-600" />Đã xem gần đây</h2>
          <button type="button" aria-label="Đóng danh sách đã xem" data-testid="recently-viewed-close" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100 focus-visible:outline-red-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {state === 'loading' && <p role="status" className="py-6 text-sm text-slate-500">Đang tải tin đã xem…</p>}
          {state === 'error' && <div role="alert" className="py-6 text-sm text-slate-600">Không tải được danh sách đã xem. Lịch sử vẫn được giữ.
            <button type="button" data-testid="recently-viewed-retry" onClick={() => setRevision(value => value + 1)} className="mt-3 block rounded-lg border px-3 py-2 font-semibold text-red-700">Thử lại</button>
          </div>}
          {state === 'ready' && !items.length && <p className="py-6 text-sm text-slate-500">Chưa có tin công khai nào trong lịch sử xem gần đây.</p>}
          {state === 'ready' && !!items.length && <ul className="space-y-3">{items.map(property => <li key={property.id}>
            <Link href={buildPropertyPath(property)} onClick={() => setOpen(false)} className="group flex gap-3 rounded-xl border border-slate-200 p-2 hover:border-red-300">
              <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100"><SafeImage src={property.image_url} fallbackSrc={FALLBACK_PROPERTY_IMAGE} alt="" fill sizes="96px" className="object-cover" /></div>
              <div className="min-w-0 flex-1"><h3 className="line-clamp-2 text-sm font-semibold leading-5 group-hover:text-red-700">{property.title}</h3>
                <p className="mt-1 text-sm font-bold text-red-600">{formatPropertyPrice(property)}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{[property.district, property.city].filter(Boolean).join(', ')}</span></p>
              </div>
            </Link>
          </li>)}</ul>}
        </div>
      </div>
    </dialog>
  </>;
}
