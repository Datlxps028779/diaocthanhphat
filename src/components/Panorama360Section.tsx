'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Glasses, Maximize2, Play, RotateCcw, X } from 'lucide-react';
import type { PropertyPanorama } from '../lib/supabase';
import '@photo-sphere-viewer/core/index.css';

type Panorama360SectionProps = {
  panoramas: PropertyPanorama[];
};

export function Panorama360Section({ panoramas }: Panorama360SectionProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = panoramas[selectedIndex] ?? panoramas[0];

  useEffect(() => {
    if (!open || !containerRef.current) return;
    if (!selected?.url) {
      setLoading(false);
      setError('Ảnh 360 này chưa sẵn sàng để trình chiếu.');
      return;
    }

    let disposed = false;
    let viewer: import('@photo-sphere-viewer/core').Viewer | null = null;
    setLoading(true);
    setError('');
    void import('@photo-sphere-viewer/core').then(({ Viewer }) => {
      if (disposed || !containerRef.current) return;
      viewer = new Viewer({
        container: containerRef.current,
        panorama: selected.url!,
        navbar: ['zoom', 'fullscreen'],
        defaultZoomLvl: 0,
        touchmoveTwoFingers: false,
      });
      viewer.addEventListener('ready', () => setLoading(false), { once: true });
      viewer.addEventListener('panorama-error', () => {
        setLoading(false);
        setError('Không thể tải ảnh 360 này.');
      }, { once: true });
    }).catch(() => {
      if (!disposed) {
        setLoading(false);
        setError('Không thể khởi động trình xem ảnh 360.');
      }
    });
    return () => {
      disposed = true;
      viewer?.destroy();
      viewer = null;
    };
  }, [open, reloadToken, selected?.id, selected?.url]);

  if (panoramas.length === 0) return null;

  const selectPanorama = (index: number) => {
    setSelectedIndex(index);
    setError('');
    setReloadToken(token => token + 1);
    setOpen(true);
  };

  const moveSelection = (direction: -1 | 1) => {
    const nextIndex = (selectedIndex + direction + panoramas.length) % panoramas.length;
    selectPanorama(nextIndex);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
            <Glasses className="h-4 w-4 text-indigo-500" /> Không gian 360°
          </h2>
          {!open && <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700">
            <Play className="h-3.5 w-3.5" /> Mở trình xem
          </button>}
        </div>
        {panoramas.length > 1 && (
          <>
            <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Các không gian 360">
              {panoramas.map((panorama, index) => (
                <button key={panorama.id} type="button" role="tab" aria-selected={index === selectedIndex} aria-label={`Mở ${panorama.label || `không gian ${index + 1}`}`} onClick={() => selectPanorama(index)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${index === selectedIndex ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-indigo-200 hover:text-indigo-600'}`}>
                  {panorama.label || `Không gian ${index + 1}`}
                </button>
              ))}
            </div>
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2 py-1.5">
              <button type="button" onClick={() => moveSelection(-1)} aria-label="Mở không gian trước" className="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-white hover:text-indigo-600">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p aria-live="polite" className="min-w-0 truncate text-center text-xs font-semibold text-gray-600">
                Đang xem {selectedIndex + 1}/{panoramas.length}: {selected.label || `Không gian ${selectedIndex + 1}`}
              </p>
              <button type="button" onClick={() => moveSelection(1)} aria-label="Mở không gian tiếp theo" className="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-white hover:text-indigo-600">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-xl bg-gradient-to-br from-slate-900 to-indigo-950 text-center">
            <Maximize2 className="h-7 w-7 text-white" />
            <span className="text-sm font-semibold text-white">Khám phá {selected.label || 'không gian này'} ở chế độ 360°</span>
            <span className="text-xs text-indigo-200">Kéo để xoay · cuộn để phóng to · hỗ trợ toàn màn hình</span>
          </button>
        ) : (
          <div className="relative">
            <div ref={containerRef} className="h-[min(70vw,32rem)] min-h-64 w-full overflow-hidden rounded-xl bg-slate-950" aria-label={`Trình xem ảnh 360 ${selected.label || ''}`} />
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng trình xem ảnh 360" className="absolute right-2 top-2 z-10 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"><X className="h-4 w-4" /></button>
            {loading && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">Đang tải không gian 360...</p>}
            {error && (
              <div role="alert" className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-lg bg-red-950/90 px-3 py-2 text-center text-xs text-red-100">
                <span>{error}</span>
                <button type="button" onClick={() => setReloadToken(token => token + 1)} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 font-semibold text-white hover:bg-white/20">
                  <RotateCcw className="h-3 w-3" /> Thử lại
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
