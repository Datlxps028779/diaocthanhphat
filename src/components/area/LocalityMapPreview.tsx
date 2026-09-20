'use client';

import type { Property } from '@/lib/supabase';
import { PropertyMap } from '@/components/PropertyMap';
import { useNavigate } from '@/lib/useNavigate';

export function LocalityMapPreview({ properties }: { properties: Property[] }) {
  const navigate = useNavigate();
  const located = properties.find(property => Number.isFinite(property.latitude) && Number.isFinite(property.longitude));
  return (
    <div className="relative isolate z-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-700">Bản đồ khu vực</p>
          <h3 className="mt-1 text-sm font-bold text-slate-900">Vị trí tin đăng</h3>
        </div>
        <span className="text-xs text-slate-500">{properties.length} tin</span>
      </div>
      <PropertyMap
        properties={properties}
        onNavigate={navigate}
        height="480px"
        centerLat={located?.latitude ?? 11.1}
        centerLng={located?.longitude ?? 106.7}
        zoom={located ? 12 : 10}
        fitToMarkers
      />
    </div>
  );
}
