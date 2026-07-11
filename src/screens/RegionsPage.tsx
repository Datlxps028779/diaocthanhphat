'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, TrendingUp, Building2, Phone, ArrowRight, CheckCircle, Home } from 'lucide-react';
import { type Area } from '../lib/supabase';
import { getAllPropertiesForMap, getAllProperties, getPageBlocks, pageBlocksToMap } from '../lib/api';
import { useAreas } from '../lib/hooks/useTaxonomy';
import { qk } from '../lib/queryKeys';
import { type Page, scrollTop } from '../lib/router';
import { Breadcrumb } from '../components/Layout';
import { PropertyMap } from '../components/PropertyMap';

interface AreaDetail {
  heroImage: string;
  description: string;
  infrastructure: string[];
  investmentTypes: string[];
  priceRange: string;
  growthPct: number;
  riskLevel: string;
  highlights: string[];
  centerLat: number;
  centerLng: number;
  zoom: number;
}

const AREA_DETAILS: Record<string, AreaDetail> = {
  'tp-hcm': {
    heroImage: 'https://images.pexels.com/photos/1103970/pexels-photo-1103970.jpeg?auto=compress&w=800',
    description: 'TP. Hồ Chí Minh là trung tâm kinh tế lớn nhất Việt Nam, thị trường BĐS sôi động, thanh khoản cao nhất cả nước.',
    infrastructure: ['Metro Bến Thành – Suối Tiên (khai thác)', 'Vành đai 3 TP.HCM (đang xây)', 'Cao tốc TP.HCM – Mộc Bài', 'Cầu Thủ Thiêm 3, 4', 'QL50 & QL13 mở rộng'],
    investmentTypes: ['Nhà phố cho thuê', 'Căn hộ cao cấp', 'Shophouse thương mại', 'Đất nền vùng ven'],
    priceRange: '4 – 15 tỷ/căn', growthPct: 15, riskLevel: 'Rất thấp',
    highlights: ['Trung tâm kinh tế lớn nhất VN', 'Thanh khoản cao nhất', 'Hạ tầng đồng bộ'],
    centerLat: 10.82, centerLng: 106.63, zoom: 11,
  },
  'binh-duong': {
    heroImage: 'https://images.pexels.com/photos/1642125/pexels-photo-1642125.jpeg?auto=compress&w=800',
    description: 'Bình Dương là trung tâm công nghiệp năng động, dẫn đầu cả nước về thu hút FDI với hơn 30 khu công nghiệp.',
    infrastructure: ['Cao tốc TP.HCM – Thủ Dầu Một', 'Metro số 1 kéo dài đến Bình Dương', 'KCN VSIP 1, 2, 3', 'QL13 mở rộng 6 làn', 'Vành đai 3 TP.HCM qua Bình Dương'],
    investmentTypes: ['Đất nền khu dân cư', 'Nhà phố thương mại', 'Nhà ở công nhân', 'Shophouse KCN'],
    priceRange: '1,5 – 4,5 tỷ/nền', growthPct: 22, riskLevel: 'Thấp',
    highlights: ['30+ KCN đang hoạt động', 'Dân số tăng nhanh', 'FDI dẫn đầu cả nước'],
    centerLat: 11.07, centerLng: 106.65, zoom: 11,
  },
  'dong-nai': {
    heroImage: 'https://images.pexels.com/photos/2119713/pexels-photo-2119713.jpeg?auto=compress&w=800',
    description: 'Đồng Nai là tâm điểm hạ tầng với Sân bay Long Thành – công trình tỷ đô tạo cú hích tăng giá mạnh nhất khu vực.',
    infrastructure: ['Sân bay Quốc tế Long Thành (2026)', 'Cao tốc Biên Hòa – Vũng Tàu', 'Vành đai 4 TP.HCM', 'Cầu Đồng Nai 2', 'Cao tốc Phan Thiết – Dầu Giây'],
    investmentTypes: ['Đất ven sân bay', 'Đất nền ven sông', 'Nhà phố trung tâm', 'Biệt thự nghỉ dưỡng'],
    priceRange: '1,8 – 6 tỷ/nền', growthPct: 25, riskLevel: 'Thấp',
    highlights: ['Sân bay Long Thành – lớn nhất VN', 'Giá còn thấp so với tiềm năng', 'Hạ tầng bùng nổ'],
    centerLat: 10.96, centerLng: 107.0, zoom: 11,
  },
  'binh-phuoc': {
    heroImage: 'https://images.pexels.com/photos/440731/pexels-photo-440731.jpeg?auto=compress&w=800',
    description: 'Bình Phước nổi lên như vùng đất vàng với quỹ đất rộng lớn, giá còn thấp, hạ tầng đầu tư mạnh.',
    infrastructure: ['Cao tốc Chơn Thành – Đức Hòa (đang xây)', 'Quốc lộ 14 nâng cấp 4 làn', 'KCN Becamex Bình Phước 4.600ha', 'Cửa khẩu quốc tế Hoa Lư', 'Sân bay Đồng Xoài (quy hoạch)'],
    investmentTypes: ['Đất nền giá thấp', 'Đất ven sông Bé', 'Trang trại kết hợp', 'Đất công nghiệp'],
    priceRange: '400tr – 1,8 tỷ/nền', growthPct: 35, riskLevel: 'Trung bình',
    highlights: ['Giá đất thấp nhất vùng', 'Tiềm năng tăng giá 35%+/năm', 'Quỹ đất dồi dào'],
    centerLat: 11.74, centerLng: 106.72, zoom: 10,
  },
};

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
  const detail = AREA_DETAILS[area.slug] ?? AREA_DETAILS['binh-duong'];
  return (
    <button onClick={onClick}
      className={`relative overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 text-left group ${isSelected ? 'ring-4 ring-red-500 scale-[1.01]' : ''}`}>
      <div className="h-52 bg-cover bg-center" style={{ backgroundImage: `url('${detail.heroImage}')` }}>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-gray-900/20 to-transparent" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold leading-tight">{area.name}</h3>
          </div>
          <span className="flex items-center gap-1 text-green-400 text-sm font-semibold bg-black/30 px-2 py-1 rounded-full">
            <TrendingUp className="w-3.5 h-3.5" /> +{detail.growthPct}%
          </span>
        </div>
        <div className="flex gap-3 mt-2 text-xs text-gray-300">
          <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {detail.priceRange}</span>
        </div>
        {isSelected && (
          <div className="mt-2 text-xs text-red-300 font-semibold flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> Đang xem chi tiết
          </div>
        )}
      </div>
    </button>
  );
}

function ComparisonTable({ areas }: { areas: Area[] }) {
  return (
    <div className="bg-white rounded-2xl shadow overflow-x-auto mt-10">
      <div className="p-5 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-800">So sánh các khu vực</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left px-5 py-3 font-semibold text-gray-600">Khu vực</th>
            <th className="text-left px-5 py-3 font-semibold text-gray-600">Giá đất</th>
            <th className="text-left px-5 py-3 font-semibold text-gray-600">Tăng trưởng</th>
            <th className="text-left px-5 py-3 font-semibold text-gray-600">Mức rủi ro</th>
            <th className="text-left px-5 py-3 font-semibold text-gray-600">Điểm nổi bật</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {areas.map((area) => {
            const d = AREA_DETAILS[area.slug] ?? AREA_DETAILS['binh-duong'];
            const riskColor = d.riskLevel === 'Thấp' ? 'bg-green-100 text-green-700' : d.riskLevel === 'Cao' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
            return (
              <tr key={area.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4 font-medium text-gray-800">{area.name}</td>
                <td className="px-5 py-4 text-gray-600">{d.priceRange}</td>
                <td className="px-5 py-4">
                  <span className="flex items-center gap-1 text-green-600 font-semibold">
                    <TrendingUp className="w-3.5 h-3.5" /> +{d.growthPct}%/năm
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${riskColor}`}>{d.riskLevel}</span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1">
                    {d.highlights.map((h) => (
                      <span key={h} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{h}</span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RegionsPage({ initialAreaId, onNavigate }: { initialAreaId?: string; onNavigate: (p: Page) => void }) {
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);

  const { data: cms = {} } = useQuery({
    queryKey: qk.pageBlocks('regions'),
    queryFn: () => getPageBlocks('regions'),
    select: pageBlocksToMap,
  });
  const g = (section: string, key: string, def: string) => cms[section]?.[key] || def;

  const { data: areas = [], isLoading: areasLoading } = useAreas();
  const { data: allMapProps = [], isLoading: mapLoading } = useQuery({
    queryKey: qk.propertiesMap(),
    queryFn: () => getAllPropertiesForMap(),
  });
  const loading = areasLoading || mapLoading;

  const { data: areaProperties = [] } = useQuery({
    queryKey: qk.areaProperties(selectedArea?.id),
    queryFn: () => getAllProperties({ areaId: selectedArea!.id, limit: 6 }).then(r => r.data),
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

  const mapProps = selectedArea
    ? allMapProps.filter(p => p.area_id === selectedArea.id)
    : allMapProps;

  const detail = selectedArea ? AREA_DETAILS[selectedArea.slug] ?? AREA_DETAILS['binh-duong'] : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="relative h-56 md:h-72 flex items-center"
        style={{ backgroundImage: `url('${g('hero','image','https://images.pexels.com/photos/1438072/pexels-photo-1438072.jpeg?auto=compress&w=1200')}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="absolute inset-0 bg-gradient-to-r from-gray-900/80 to-gray-700/60" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 w-full">
          <Breadcrumb items={[
            { label: 'Trang chủ', onClick: () => { onNavigate({ name: 'home' }); scrollTop(); } },
            { label: 'Khu vực' },
          ]} />
          <h1 className="text-3xl md:text-4xl font-bold text-white mt-3 mb-2">{g('hero','title','KHU VỰC HOẠT ĐỘNG')}</h1>
          <p className="text-gray-200 text-base max-w-2xl">
            {g('hero','subtitle','Chuyên sâu tại 4 tỉnh thành trọng điểm phía Nam — nơi hội tụ cơ hội đầu tư hấp dẫn nhất')}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Area grid */}
        <h2 className="text-xl font-bold text-gray-800 mb-5">{g('main','select_label','Chọn khu vực bạn quan tâm')}</h2>
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

        {/* MAP — always visible, zooms to selected area */}
        <div id="area-detail" className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <MapPin className="w-5 h-5 text-red-500" />
              {selectedArea ? `Bản đồ BĐS tại ${selectedArea.name}` : 'Bản đồ BĐS toàn khu vực'}
            </h2>
            <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {mapProps.filter(p => p.latitude && p.longitude).length} tin có tọa độ
            </span>
          </div>
          <PropertyMap
            properties={mapProps}
            onNavigate={onNavigate}
            height="460px"
            centerLat={detail?.centerLat ?? 11.0}
            centerLng={detail?.centerLng ?? 106.7}
            zoom={detail?.zoom ?? 9}
          />
        </div>

        {/* Detail panel */}
        {selectedArea && detail && (
          <div className="mt-8 bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="relative h-48 md:h-64"
              style={{ backgroundImage: `url('${detail.heroImage}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
              <div className="absolute inset-0 bg-gradient-to-r from-gray-900/70 to-transparent" />
              <div className="relative z-10 h-full flex items-end p-6 md:p-8">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex items-center gap-1 text-green-400 text-sm font-semibold bg-black/40 px-3 py-1 rounded-full">
                      <TrendingUp className="w-3.5 h-3.5" /> Tăng trưởng +{detail.growthPct}%/năm
                    </span>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${detail.riskLevel === 'Thấp' ? 'bg-green-500/80' : 'bg-amber-500/80'} text-white`}>
                      Rủi ro: {detail.riskLevel}
                    </span>
                  </div>
                  <h2 className="text-3xl font-bold text-white">{selectedArea.name}</h2>
                  <p className="text-gray-200 text-sm mt-1 max-w-lg">{detail.description}</p>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8 grid md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-red-500" /> Hạ tầng nổi bật</h4>
                  <ul className="space-y-2">
                    {detail.infrastructure.map(item => (
                      <li key={item} className="flex items-start gap-2 text-gray-600 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Home className="w-4 h-4 text-red-500" /> Loại hình đầu tư</h4>
                  <div className="flex flex-wrap gap-2">
                    {detail.investmentTypes.map(t => (
                      <span key={t} className="px-3 py-1.5 bg-red-50 text-red-700 text-sm rounded-lg font-medium border border-red-100">{t}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Giá đất', value: detail.priceRange, icon: <Building2 className="w-4 h-4 text-red-500" /> },
                    { label: 'Tăng trưởng', value: `+${detail.growthPct}%`, icon: <TrendingUp className="w-4 h-4 text-green-500" /> },
                    { label: 'Rủi ro', value: detail.riskLevel, icon: <CheckCircle className="w-4 h-4 text-amber-500" /> },
                  ].map(s => (
                    <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                      <div className="flex justify-center mb-1">{s.icon}</div>
                      <div className="text-sm font-bold text-gray-800">{s.value}</div>
                      <div className="text-xs text-gray-500">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => { onNavigate({ name: 'listings', areaId: selectedArea.id }); scrollTop(); }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-colors">
                    <Building2 className="w-4 h-4" /> Xem BĐS khu vực này
                  </button>
                  <a href="tel:0901234567"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-red-600 text-red-600 rounded-xl font-semibold text-sm hover:bg-red-50 transition-colors">
                    <Phone className="w-4 h-4" /> Gọi tư vấn
                  </a>
                </div>
                {areaProperties.length > 0 && (
                  <div>
                    <h4 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-2">
                      <Home className="w-4 h-4 text-red-500" /> BĐS mới nhất tại {selectedArea.name}
                    </h4>
                    <div className="space-y-2">
                      {areaProperties.slice(0, 4).map(p => (
                        <button key={p.id} onClick={() => { onNavigate({ name: 'property', id: p.id, slug: p.slug ?? undefined }); scrollTop(); }}
                          className="flex gap-3 w-full text-left bg-gray-50 rounded-xl p-2.5 hover:bg-red-50 hover:border-red-200 border border-transparent transition-all group">
                          <img src={p.image_url ?? ''} alt={p.title} loading="lazy"
                            className="w-16 h-12 object-cover rounded-lg flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 text-xs line-clamp-2 group-hover:text-red-700">{p.title}</p>
                            <p className="text-red-600 text-xs font-bold mt-0.5">{p.price_label ?? `${p.price} ${p.price_unit}`}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { onNavigate({ name: 'listings', areaId: selectedArea.id }); scrollTop(); }}
                      className="mt-3 w-full text-sm text-red-600 font-semibold flex items-center justify-center gap-1 hover:underline">
                      Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Comparison table */}
        {!loading && areas.length > 0 && <ComparisonTable areas={areas} />}
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-r from-red-700 to-red-500 py-14 px-4 text-center text-white mt-10">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">{g('cta','title','Chưa biết nên đầu tư ở đâu?')}</h2>
        <p className="text-red-100 mb-6 max-w-xl mx-auto">{g('cta','subtitle','Chuyên gia của chúng tôi sẽ phân tích và đề xuất khu vực phù hợp nhất với ngân sách và mục tiêu của bạn.')}</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <a href="tel:0901234567"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-red-600 rounded-xl font-semibold hover:bg-red-50 transition-colors">
            <Phone className="w-4 h-4" /> {g('cta','btn_consult','Tư vấn miễn phí')}
          </a>
          <button onClick={() => { onNavigate({ name: 'invest' }); scrollTop(); }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-800/50 text-white rounded-xl font-semibold hover:bg-red-800/70 transition-colors border border-white/30">
            {g('cta','btn_invest','Xem cơ hội đầu tư')} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}