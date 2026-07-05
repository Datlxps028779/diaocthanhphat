import { useEffect, useRef } from 'react';
import type { Property } from '../lib/supabase';
import type { Page } from '../lib/router';
import type { Map as LeafletMap } from 'leaflet';

export interface MapBounds {
  north: number; south: number; east: number; west: number;
}

interface PropertyMapProps {
  properties: Property[];
  onNavigate: (p: Page) => void;
  height?: string;
  centerLat?: number;
  centerLng?: number;
  zoom?: number;
  onBoundsChange?: (bounds: MapBounds) => void;
}

// Price tier config
function priceTier(price: number, unit: string): { color: string; bg: string; label: string } {
  const bil = unit === 'triệu' ? price / 1000 : price;
  if (bil < 1)  return { color: '#15803d', bg: '#dcfce7', label: '< 1 tỷ' };
  if (bil < 3)  return { color: '#b45309', bg: '#fef3c7', label: '1–3 tỷ' };
  if (bil < 8)  return { color: '#b91c1c', bg: '#fee2e2', label: '3–8 tỷ' };
  return         { color: '#6d28d9', bg: '#ede9fe', label: '> 8 tỷ' };
}

function priceLabel(p: Property): string {
  if (p.price_label) return p.price_label;
  const bil = p.price_unit === 'triệu' ? p.price / 1000 : p.price;
  if (bil >= 1) return `${bil % 1 === 0 ? bil : bil.toFixed(1)} Tỷ`;
  return `${p.price} Tr`;
}

function markerHtml(p: Property): string {
  const tier = priceTier(p.price, p.price_unit);
  const isRent = p.listing_type === 'cho_thue';
  const badgeBg = isRent ? '#1d4ed8' : tier.color;
  const label = priceLabel(p);

  return `
    <div style="
      position:relative;
      display:inline-flex;
      flex-direction:column;
      align-items:center;
      filter:drop-shadow(0 3px 8px rgba(0,0,0,0.28));
      cursor:pointer;
    ">
      <!-- Pill badge -->
      <div style="
        background:${badgeBg};
        color:#fff;
        font-family:Inter,system-ui,sans-serif;
        font-size:11px;
        font-weight:800;
        padding:4px 9px;
        border-radius:20px;
        white-space:nowrap;
        line-height:1.3;
        border:2px solid rgba(255,255,255,0.9);
        display:flex;
        align-items:center;
        gap:4px;
        letter-spacing:0.1px;
      ">
        ${isRent
          ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`
          : `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
        }
        ${label}
      </div>
      <!-- Down arrow tip -->
      <div style="
        width:0;height:0;
        border-left:5px solid transparent;
        border-right:5px solid transparent;
        border-top:6px solid ${badgeBg};
        margin-top:-1px;
      "></div>
    </div>
  `;
}

function popupHtml(p: Property): string {
  const tier = priceTier(p.price, p.price_unit);
  const isRent = p.listing_type === 'cho_thue';
  const badgeBg = isRent ? '#1d4ed8' : tier.color;
  const badgeLabel = isRent ? 'Cho thuê' : 'Mua bán';
  const label = priceLabel(p);
  const location = [p.district, p.city].filter(Boolean).join(', ') || 'Bình Dương';

  const specs = [
    p.area_sqm  ? `<div style="display:flex;align-items:center;gap:3px;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        <span>${p.area_sqm} m²</span></div>` : '',
    p.bedrooms  ? `<div style="display:flex;align-items:center;gap:3px;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><path d="M3 22V12M21 22V12M1 12h22M3 12V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5"/><path d="M10 12V7H6v5"/></svg>
        <span>${p.bedrooms} PN</span></div>` : '',
    p.bathrooms ? `<div style="display:flex;align-items:center;gap:3px;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><path d="M4 12h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4z"/><path d="M4 12V6a2 2 0 0 1 2-2h2v4"/></svg>
        <span>${p.bathrooms} WC</span></div>` : '',
  ].filter(Boolean);

  return `
    <div style="width:252px;font-family:Inter,system-ui,sans-serif;border-radius:12px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.16);">
      <!-- Image -->
      <div style="position:relative;height:140px;overflow:hidden;background:#f3f4f6;">
        ${p.image_url
          ? `<img src="${p.image_url}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.3s" />`
          : `<div style="width:100%;height:100%;background:linear-gradient(135deg,${tier.bg},#e5e7eb);display:flex;align-items:center;justify-content:center;">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="${tier.color}" stroke-width="1.5" opacity="0.6"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>`
        }
        <!-- Listing type badge over image -->
        <div style="position:absolute;top:8px;left:8px;background:${badgeBg};color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:20px;letter-spacing:0.4px;text-transform:uppercase;">${badgeLabel}</div>
        <!-- Hot badge -->
        ${p.is_hot ? `<div style="position:absolute;top:8px;right:8px;background:#f97316;color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:20px;letter-spacing:0.3px;">🔥 HOT</div>` : ''}
      </div>

      <!-- Body -->
      <div style="padding:10px 12px 12px;background:#fff;">
        <!-- Title -->
        <div style="font-size:12px;font-weight:700;color:#111827;line-height:1.45;margin-bottom:7px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${p.title}</div>

        <!-- Price row -->
        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:7px;">
          <span style="font-size:20px;font-weight:900;color:${badgeBg};line-height:1;">${label}</span>
          ${p.price_per_month ? `<span style="font-size:10px;color:#6b7280;">/tháng</span>` : ''}
        </div>

        <!-- Location -->
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:${specs.length ? '7px' : '10px'};">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span style="font-size:10px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${location}</span>
        </div>

        <!-- Specs strip -->
        ${specs.length ? `
        <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:10px;color:#4b5563;background:#f9fafb;border-radius:7px;padding:5px 8px;margin-bottom:10px;">
          ${specs.join('')}
        </div>` : ''}

        <!-- CTA -->
        <button
          data-nav-id="${p.id}"
          data-nav-slug="${p.slug ?? ''}"
          style="
            width:100%;background:${badgeBg};color:#fff;border:none;
            border-radius:8px;padding:9px;font-size:12px;font-weight:700;
            cursor:pointer;letter-spacing:0.3px;display:flex;align-items:center;
            justify-content:center;gap:5px;
          "
          onmouseover="this.style.opacity='0.88'"
          onmouseout="this.style.opacity='1'"
        >
          Xem chi tiết
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>
    </div>
  `;
}

export function PropertyMap({
  properties,
  onNavigate,
  height = '500px',
  centerLat = 11.1,
  centerLng = 106.7,
  zoom = 10,
  onBoundsChange,
}: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: LeafletMap;

    import('leaflet').then(module => {
      const L = module.default;
      import('leaflet/dist/leaflet.css');

      map = L.map(containerRef.current!, {
        center: [centerLat, centerLng],
        zoom,
        zoomControl: true,
        attributionControl: false,
      });
      mapRef.current = map;

      // Cleaner map tile
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      L.control.attribution({ prefix: '© OpenStreetMap © Carto' }).addTo(map);

      const emitBounds = () => {
        if (!onBoundsChange) return;
        const b = map.getBounds();
        onBoundsChange({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
      };

      map.on('moveend', emitBounds);
      map.on('zoomend', emitBounds);
      setTimeout(emitBounds, 300);

      addMarkers(L, map, properties, onNavigate);
    });

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    import('leaflet').then(module => {
      const L = module.default;
      map.eachLayer(layer => {
        if ((layer as { _isMarker?: boolean })._isMarker) map.removeLayer(layer);
      });
      addMarkers(L, map, properties, onNavigate);
    });
  }, [properties, onNavigate]);

  const visibleCount = properties.filter(p => p.latitude && p.longitude).length;

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-md" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute bottom-8 left-3 z-[999] bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2.5 shadow-lg border border-gray-100 pointer-events-none">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Mức giá</p>
        {[
          { label: '< 1 tỷ',  color: '#15803d' },
          { label: '1–3 tỷ',  color: '#b45309' },
          { label: '3–8 tỷ',  color: '#b91c1c' },
          { label: '> 8 tỷ',  color: '#6d28d9' },
          { label: 'Cho thuê', color: '#1d4ed8' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full flex-shrink-0 border-2 border-white shadow-sm" style={{ background: l.color }} />
            <span className="text-[10px] text-gray-600 font-medium">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Property count badge */}
      <div className="absolute top-3 right-3 z-[999] bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg pointer-events-none flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse" />
        {visibleCount} BĐS
      </div>

      {/* Inject popup styles */}
      <style>{`
        .leaflet-popup-content-wrapper {
          padding: 0 !important;
          border-radius: 12px !important;
          overflow: hidden !important;
          box-shadow: 0 8px 30px rgba(0,0,0,0.16) !important;
          border: none !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
          width: auto !important;
        }
        .leaflet-popup-tip {
          display: none !important;
        }
        .leaflet-popup-close-button {
          color: #fff !important;
          font-size: 18px !important;
          line-height: 18px !important;
          top: 6px !important;
          right: 8px !important;
          z-index: 10 !important;
          text-shadow: 0 1px 3px rgba(0,0,0,0.4) !important;
        }
      `}</style>
    </div>
  );
}

function addMarkers(
  L: typeof import('leaflet'),
  map: import('leaflet').Map,
  properties: Property[],
  onNavigate: (p: Page) => void,
) {
  const valid = properties.filter(p => p.latitude && p.longitude);

  valid.forEach(p => {
    const html = markerHtml(p);
    const icon = L.divIcon({
      className: '',
      html,
      iconAnchor: [0, 0],
      popupAnchor: [0, -8],
    });

    const marker = L.marker([p.latitude!, p.longitude!], { icon });
    (marker as unknown as { _isMarker: boolean })._isMarker = true;

    marker.bindPopup(popupHtml(p), {
      maxWidth: 260,
      minWidth: 252,
      className: 'property-popup',
      offset: [6, 0],
    });

    // Hover opens popup
    marker.on('mouseover', () => marker.openPopup());

    // Click delegation on popup content via data-nav-id attribute
    marker.on('popupopen', () => {
      const popup = marker.getPopup();
      if (!popup) return;
      const el = popup.getElement();
      if (!el) return;
      const btn = el.querySelector<HTMLElement>('[data-nav-id]');
      if (btn) {
        btn.onclick = () => onNavigate({ name: 'property', id: btn.dataset.navId!, slug: btn.dataset.navSlug || undefined });
      }
    });

    marker.addTo(map);
  });
}
