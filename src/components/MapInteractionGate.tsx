'use client';

import React, { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Hand, MousePointer2, X } from 'lucide-react';

export function MapInteractionGate({ children, className = '', style, label = 'bản đồ' }: { children: ReactNode; className?: string; style?: CSSProperties; label?: string }) {
  const [active, setActive] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const deactivate = () => {
    setActive(false);
    rootRef.current?.focus({ preventScroll: true });
  };

  const activate = () => {
    setActive(true);
    requestAnimationFrame(() => rootRef.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!active) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && rootRef.current?.contains(document.activeElement)) { event.preventDefault(); deactivate(); }
    };
    const onOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setActive(false);
    };
    document.addEventListener('keydown', onEscape);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('pointerdown', onOutside);
    };
  }, [active]);

  return <div ref={rootRef} tabIndex={0} data-testid="map-interaction-gate" data-active={active ? 'true' : 'false'} onClick={() => { if (!active) activate(); }} onKeyDown={event => {
    if (!active && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); activate(); }
    if (active && event.key === 'Escape') { event.preventDefault(); deactivate(); }
  }} className={`relative outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${className}`} style={style}>
    <div className="h-full w-full" style={{ pointerEvents: active ? 'auto' : 'none' }}>{children}</div>
    {!active ? <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[600] bg-slate-950/5 backdrop-blur-[1px]" />
      <button type="button" onClick={event => { event.stopPropagation(); activate(); }} className="absolute left-1/2 top-1/2 z-[650] -translate-x-1/2 -translate-y-1/2 cursor-pointer" aria-label={`Kích hoạt ${label}`}>
        <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/90 bg-white/95 px-4 py-2 text-sm font-bold text-slate-800 shadow-lg"><MousePointer2 className="h-4 w-4 text-red-600" />Nhấn để tương tác bản đồ</span>
      </button>
    </> : <button type="button" onClick={event => { event.stopPropagation(); deactivate(); }} className="absolute bottom-3 left-1/2 z-[650] inline-flex min-h-10 -translate-x-1/2 items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow-lg hover:text-red-700" aria-label={`Dừng tương tác ${label}`}>
      <Hand className="h-3.5 w-3.5" />Dừng tương tác<X className="h-3.5 w-3.5" />
    </button>}
  </div>;
}
