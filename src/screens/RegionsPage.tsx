'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Phone, ArrowRight, CheckCircle, Home } from 'lucide-react';
import { type Area, type Property } from '../lib/supabase';
import { getAllProperties, getPageBlocks, pageBlocksToMap } from '../lib/api';
import { useAreas } from '../lib/hooks/useTaxonomy';
import { qk } from '../lib/queryKeys';
import { type Page, scrollTop } from '../lib/router';
import { Breadcrumb } from '../components/Layout';
import { ForYou } from '../components/ForYou';
import { formatPropertyPrice } from '../lib/listingPrice';
import { useSetting } from '../lib/cms';

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow animate-pulse">
      <div className="h-44 bg-gray-200" />
      <div className="p-5 space-y-2">
        <div className="h-5 bg-gray-200 rounded w-1/2" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/3" />
      </div>
    </div>
  );
}

function AreaCard({ area, isSelected, onClick }: { area: Area; isSelected: boolean; onClick: () => void }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 text-left group ${isSelected ? 'ring-4 ring-red-500 scale-[1.01]' : ''}`}>
      <button onClick={onClick} className="block w-full text-left">
        <div className="h-52 bg-gray-800 bg-cover bg-center" style={area.image_url ? { backgroundImage: `url('${area.image_url}')` } : undefined}>
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-gray-900/20 to-transparent" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
          <h3 className="text-lg font-bold leading-tight">{area.name}</h3>
          {area.description && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-200">{area.description}</p>}
          {isSelected && <div className="mt-2 text-xs text-red-300 font-semibold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Đang xem chi tiết</div>}
        </div>
      </button>
      <Link href={`/khu-vuc/${area.slug}`} className="absolute right-4 bottom-4 z-10 text-[11px] font-bold text-white/90 hover:text-white underline underline-offset-2">Trang khu vực</Link>
    </div>
  );
}

function ComparisonTable({ areas }: { areas: Area[] }) {
  return <div className="bg-white rounded-2xl shadow overflow-x-auto mt-10"><div className="p-5 border-b border-gray-100"><h3 className="text-lg font-bold text-gray-800">Khu vực đang có dữ liệu</h3><p className="mt-1 text-xs text-gray-500">Thông tin mô tả do quản trị viên cập nhật từ dữ liệu nguồn.</p></div><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="text-left px-5 py-3 font-semibold text-gray-600">Khu vực</th><th className="text-left px-5 py-3 font-semibold text-gray-600">Mô tả</th></tr></thead><tbody className="divide-y divide-gray-100">{areas.map(area => <tr key={area.id} className="hover:bg-gray-50 transition-colors"><td className="px-5 py-4 font-medium text-gray-800">{area.name}</td><td className="px-5 py-4 text-gray-600">{area.description || 'Đang cập nhật dữ liệu khu vực.'}</td></tr>)}</tbody></table></div>;
}

function AreaPropertyList({ title, properties, onNavigate }: { title: string; properties: Property[]; onNavigate: (page: Page) => void }) {
  return <section className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900"><Home className="h-4 w-4 text-red-500" />{title}</h3>
    {properties.length > 0 ? <div className="space-y-2">{properties.map(property => <button key={property.id} onClick={() => { onNavigate({ name: 'property', id: property.id, slug: property.slug ?? undefined }); scrollTop(); }} className="group flex w-full gap-3 rounded-xl border border-transparent bg-white p-2.5 text-left shadow-sm transition-all hover:border-red-200 hover:bg-red-50">
      <img src={property.image_url ?? ''} alt={property.title} loading="lazy" className="h-14 w-20 shrink-0 rounded-lg bg-gray-100 object-cover" />
      <div className="min-w-0"><p className="line-clamp-2 text-xs font-semibold leading-5 text-gray-800 group-hover:text-red-700">{property.title}</p><p className="mt-1 text-xs font-bold text-red-600">{formatPropertyPrice(property)}</p></div>
    </button>)}</div> : <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-xs text-gray-500">Chưa có tin đang hoạt động.</p>}
  </section>;
}

export function RegionsPage({ initialAreaId, onNavigate }: { initialAreaId?: string; onNavigate: (p: Page) => void }) {
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);

  const { data: cms = {} } = useQuery({
    queryKey: qk.pageBlocks('regions'),
    queryFn: () => getPageBlocks('regions'),
    select: pageBlocksToMap,
  });
  const g = (section: string, key: string) => cms[section]?.[key]?.trim() || '';

  const { data: areas = [], isLoading: areasLoading } = useAreas();
  const loading = areasLoading;

  const { data: saleProperties = [] } = useQuery({
    queryKey: ['regions-area-properties', selectedArea?.id, 'mua_ban'],
    queryFn: () => getAllProperties({ areaId: selectedArea!.id, listingType: 'mua_ban', limit: 4 }).then(result => result.data),
    enabled: !!selectedArea,
  });
  const { data: rentProperties = [] } = useQuery({
    queryKey: ['regions-area-properties', selectedArea?.id, 'cho_thue'],
    queryFn: () => getAllProperties({ areaId: selectedArea!.id, listingType: 'cho_thue', limit: 4 }).then(result => result.data),
    enabled: !!selectedArea,
  });

  useEffect(() => { scrollTop(); }, []);

  // Đồng bộ selectedArea từ initialAreaId khi areas đã load
  useEffect(() => {
    if (initialAreaId && areas.length > 0) {
      const found = areas.find((a) => a.id === initialAreaId || a.slug === initialAreaId);
      if (found) setSelectedArea(found);
    }
  }, [initialAreaId, areas]);

  // Đồng bộ khu vực đang xem chi tiết → URL (?area=<slug>) qua replaceState, không
  // router.push → không refetch route. F5/chia sẻ link giữ đúng khu vực đang mở.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = selectedArea ? `/khu-vuc?area=${encodeURIComponent(selectedArea.slug)}` : '/khu-vuc';
    const current = window.location.pathname + window.location.search;
    if (current !== next) window.history.replaceState(null, '', next);
  }, [selectedArea]);

  const phone = useSetting('phone_hotline', '');
  const detail = selectedArea;

  return (
    <main id="main-content">
      <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="relative h-56 md:h-72 flex items-center"
        style={g('hero', 'image') ? { backgroundImage: `url('${g('hero', 'image')}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        <div className="absolute inset-0 bg-gradient-to-r from-gray-900/80 to-gray-700/60" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 w-full">
          <Breadcrumb items={[
            { label: 'Trang chủ', onClick: () => { onNavigate({ name: 'home' }); scrollTop(); } },
            { label: 'Khu vực' },
          ]} />
          {g('hero', 'title') && <h1 className="text-3xl md:text-4xl font-bold text-white mt-3 mb-2">{g('hero', 'title')}</h1>}
          {g('hero', 'subtitle') && <p className="text-gray-200 text-base max-w-2xl">{g('hero', 'subtitle')}</p>}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Area grid */}
        {g('main', 'select_label') && <h2 className="text-xl font-bold text-gray-800 mb-5">{g('main', 'select_label')}</h2>}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {areas.map((area) => (
              <AreaCard key={area.id} area={area} isSelected={selectedArea?.id === area.id}
                onClick={() => {
                  setSelectedArea(selectedArea?.id === area.id ? null : area);
                  setTimeout(() => document.getElementById('area-detail')?.scrollIntoView({ behavior: 'smooth' }), 100);
                }}
              />
            ))}
          </div>
        )}

        {/* Anchor cuộn tới khi chọn khu vực (bản đồ đã gỡ theo yêu cầu) */}
        <div id="area-detail" />

        {/* Detail panel */}
        {selectedArea && detail && (
          <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-lg">
            <div className="relative flex min-h-48 items-end bg-gray-900 bg-cover bg-center p-6 md:min-h-64 md:p-8" style={detail.image_url ? { backgroundImage: `url('${detail.image_url}')` } : undefined}>
              <div className="absolute inset-0 bg-gradient-to-r from-gray-900/85 to-gray-900/35" />
              <div className="relative z-10 max-w-2xl"><h2 className="text-3xl font-bold text-white">{detail.name}</h2>{detail.description && <p className="mt-2 text-sm leading-relaxed text-gray-200">{detail.description}</p>}</div>
            </div>
            <div className="p-6 md:p-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div><h3 className="flex items-center gap-2 font-bold text-gray-900"><Building2 className="h-4 w-4 text-red-500" />Bất động sản tại {selectedArea.name}</h3><p className="mt-2 text-sm leading-6 text-gray-600">Chọn giao dịch hoặc xem trực tiếp các tin mới nhất theo từng nhóm.</p></div>
                <div className="flex flex-col gap-3 sm:flex-row lg:min-w-[520px]">
                  <button onClick={() => { onNavigate({ name: 'listings', areaId: selectedArea.id }); scrollTop(); }} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"><Building2 className="h-4 w-4" />Xem BĐS khu vực này</button>
                  <Link href={`/khu-vuc/${selectedArea.slug}`} className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-red-600 px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50">Xem trang chuyên sâu <ArrowRight className="h-4 w-4" /></Link>
                </div>
              </div>
              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <AreaPropertyList title={`BĐS mua bán mới nhất tại ${selectedArea.name}`} properties={saleProperties} onNavigate={onNavigate} />
                <AreaPropertyList title={`BĐS cho thuê mới nhất tại ${selectedArea.name}`} properties={rentProperties} onNavigate={onNavigate} />
              </div>
            </div>
          </div>
        )}

        {/* Comparison table */}
        {!loading && areas.length > 0 && <ComparisonTable areas={areas} />}

        <ForYou surface="regions" source="regions_for_you" />
      </div>

      {/* CTA */}
      {(g('cta', 'title') || g('cta', 'subtitle') || phone) && <div className="bg-gradient-to-r from-red-700 to-red-500 py-14 px-4 text-center text-white mt-10">
        {g('cta', 'title') && <h2 className="text-2xl md:text-3xl font-bold mb-3">{g('cta', 'title')}</h2>}
        {g('cta', 'subtitle') && <p className="text-red-100 mb-6 max-w-xl mx-auto">{g('cta', 'subtitle')}</p>}
        <div className="flex flex-wrap gap-3 justify-center">
          {phone && g('cta', 'btn_consult') && <a href={`tel:${phone.replace(/\s/g, '')}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-red-600 rounded-xl font-semibold hover:bg-red-50 transition-colors">
            <Phone className="w-4 h-4" /> {g('cta', 'btn_consult')}
          </a>}
          {g('cta', 'btn_invest') && <button onClick={() => { onNavigate({ name: 'invest' }); scrollTop(); }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-800/50 text-white rounded-xl font-semibold hover:bg-red-800/70 transition-colors border border-white/30">
            {g('cta', 'btn_invest')} <ArrowRight className="w-4 h-4" />
          </button>}
        </div>
      </div>}
    </div>
    </main>
  );
}