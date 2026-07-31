'use client';
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, MapPin, CheckCircle, Phone, ArrowRight, Search, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { type Project } from '../lib/supabase';
import { getProjects } from '../lib/api';
import { useAreas } from '../lib/hooks/useTaxonomy';
import Link from 'next/link';
import { type Page, pageToHref, scrollTop } from '../lib/router';
import { Breadcrumb, SectionTitle } from '../components/Layout';
import { ContactModal } from '../components/ContactModal';
import { ForYou } from '../components/ForYou';
import { useSetting } from '../lib/cms';

const PHASE_OPTIONS = ['Tất cả', 'Đang mở bán', 'Sắp ra mắt', 'Đã bàn giao'];
const PROJECTS_PER_PAGE = 9;

const phaseBadge = (phase: string) => {
  if (phase === 'Đang mở bán') return 'bg-green-100 text-green-700 border-green-200';
  if (phase === 'Sắp ra mắt') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-blue-100 text-blue-700 border-blue-200';
};

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow animate-pulse">
      <div className="h-52 bg-gray-200" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-5 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-4 bg-gray-200 rounded w-2/3" />
        <div className="h-2 bg-gray-200 rounded-full" />
        <div className="flex gap-2 pt-1">
          <div className="h-8 bg-gray-200 rounded-lg flex-1" />
          <div className="h-8 bg-gray-200 rounded-lg flex-1" />
        </div>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onContact,
  onNavigate,
}: {
  project: Project;
  onContact: (proj: Project) => void;
  onNavigate: (p: Page) => void;
}) {
  const phase = project.phase ?? 'Đang mở bán';
  const soldUnits = project.sold_units ?? 0;
  const totalUnits = project.total_units ?? 1;
  const developer = project.developer ?? '';
  const amenities: string[] = project.amenities ?? [];
  const imgUrl =
    project.image_url ||
    'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&w=600';
  const progressPct = Math.min(100, Math.round((soldUnits / (totalUnits || 1)) * 100));

  const priceLabel =
    project.price_from && project.price_to
      ? `Từ ${project.price_from} đến ${project.price_to} ${project.price_unit ?? 'tỷ'}`
      : project.price_from
      ? `Từ ${project.price_from} ${project.price_unit ?? 'tỷ'}`
      : 'Liên hệ';

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-300 flex flex-col">
      {/* Image */}
      <div className="relative h-52 overflow-hidden">
        <img src={imgUrl} alt={project.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
        <span className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold border ${phaseBadge(phase)}`}>
          {phase}
        </span>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-bold text-gray-900 text-base mb-1 line-clamp-2 leading-snug">{project.name}</h3>

        <div className="flex items-center gap-1 text-gray-500 text-sm mb-1">
          <MapPin className="w-3.5 h-3.5 shrink-0 text-red-400" />
          <span className="truncate">{project.location}</span>
        </div>

        {developer && (
          <div className="flex items-center gap-1 text-gray-500 text-sm mb-2">
            <Building2 className="w-3.5 h-3.5 shrink-0 text-gray-400" />
            <span className="truncate">{developer}</span>
          </div>
        )}

        <div className="text-red-600 font-semibold text-sm mb-3">{priceLabel}</div>

        {/* Progress */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Đã bán: {soldUnits}/{totalUnits} căn</span>
            <span className="font-medium text-red-600">{progressPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Amenities */}
        {amenities.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {amenities.slice(0, 3).map((a) => (
              <span key={a} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                {a}
              </span>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 mt-auto pt-2">
          <button
            onClick={() => { onNavigate({ name: 'listings' }); scrollTop(); }}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
          >
            Chi tiết <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onContact(project)}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" /> Liên hệ
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectsPage({ onNavigate, initialPhase, initialArea, initialKeyword, initialSort, initialPage }: {
  onNavigate: (p: Page) => void; initialPhase?: string; initialArea?: string; initialKeyword?: string; initialSort?: string; initialPage?: number;
}) {
  const [selectedArea, setSelectedArea] = useState<string>(initialArea ?? 'all');
  const [selectedPhase, setSelectedPhase] = useState<string>(initialPhase ?? 'Tất cả');
  const [keyword, setKeyword] = useState(initialKeyword ?? '');
  const [sort, setSort] = useState(initialSort === 'price_asc' || initialSort === 'price_desc' ? initialSort : 'newest');
  const [page, setPage] = useState(initialPage ?? 1);
  const [contactProject, setContactProject] = useState<Project | null>(null);
  const phone = useSetting('phone_hotline', '0901 234 567');

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
  });
  const { data: areas = [] } = useAreas();
  const loading = projectsLoading;

  useEffect(() => {
    scrollTop();
  }, []);

  // Đồng bộ khu vực/giai đoạn → URL (?area=<slug>&phase=<label>) qua replaceState,
  // không router.push → không refetch route. F5/chia sẻ link giữ đúng bộ lọc.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const href = pageToHref({
      name: 'projects',
      areaId: selectedArea !== 'all' ? selectedArea : undefined,
      phase: selectedPhase !== 'Tất cả' ? selectedPhase : undefined,
      keyword: keyword.trim() || undefined,
      sort: sort !== 'newest' ? sort : undefined,
      page: page > 1 ? page : undefined,
    });
    const current = window.location.pathname + window.location.search;
    if (current !== href) window.history.replaceState(null, '', href);
  }, [selectedArea, selectedPhase, keyword, sort, page]);

  const filtered = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase('vi-VN');
    const result = projects.filter((p) => {
      const phase = p.phase ?? 'Đang mở bán';
      const areaMatch = selectedArea === 'all' || p.area_id === selectedArea || p.areas?.slug === selectedArea;
      const phaseMatch = selectedPhase === 'Tất cả' || phase === selectedPhase;
      const searchText = [p.name, p.location, p.city, p.developer].filter(Boolean).join(' ').toLocaleLowerCase('vi-VN');
      return areaMatch && phaseMatch && (!normalizedKeyword || searchText.includes(normalizedKeyword));
    });
    return result.sort((a, b) => {
      if (sort === 'price_asc') return (a.price_from ?? Number.MAX_SAFE_INTEGER) - (b.price_from ?? Number.MAX_SAFE_INTEGER);
      if (sort === 'price_desc') return (b.price_from ?? -1) - (a.price_from ?? -1);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [projects, selectedArea, selectedPhase, keyword, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PROJECTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const visibleProjects = filtered.slice((currentPage - 1) * PROJECTS_PER_PAGE, currentPage * PROJECTS_PER_PAGE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const contactProperty = contactProject
    ? {
        id: contactProject.id,
        title: contactProject.name,
        price_label: contactProject.price_from
          ? `Từ ${contactProject.price_from} ${contactProject.price_unit ?? 'tỷ'}`
          : null,
      }
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div
        className="relative h-64 md:h-80 flex items-center"
        style={{
          backgroundImage:
            "url('https://images.pexels.com/photos/1396132/pexels-photo-1396132.jpeg?auto=compress&w=1200')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-gray-900/80 to-gray-700/60" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 w-full">
          <Breadcrumb
            items={[
              { label: 'Trang chủ', onClick: () => { onNavigate({ name: 'home' }); scrollTop(); } },
              { label: 'Dự án' },
            ]}
          />
          <h1 className="text-3xl md:text-4xl font-bold text-white mt-3 mb-2">DỰ ÁN BẤT ĐỘNG SẢN</h1>
          <p className="text-gray-200 text-base md:text-lg max-w-2xl">
            Các dự án đất nền, khu dân cư uy tín tại Bình Dương, Bình Phước, Tây Ninh và Long An
          </p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-red-700 via-red-600 to-amber-500 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
          {[
            { icon: <Building2 className="w-5 h-5" />, val: projects.length.toLocaleString('vi-VN'), label: 'Dự án đang hiển thị' },
            { icon: <MapPin className="w-5 h-5" />, val: new Set(projects.map(p => p.area_id).filter(Boolean)).size.toLocaleString('vi-VN'), label: 'Khu vực có dự án' },
            { icon: <CheckCircle className="w-5 h-5" />, val: projects.filter(p => p.phase === 'Đã bàn giao').length.toLocaleString('vi-VN'), label: 'Dự án đã bàn giao' },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1">
              <div className="opacity-80">{s.icon}</div>
              <div className="text-2xl font-bold">{s.val}</div>
              <div className="text-sm text-red-100">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-2">
          {/* Area pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedArea('all')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedArea === 'all'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
              }`}
            >
              Tất cả khu vực
            </button>
            {areas.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedArea(a.slug)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  selectedArea === a.slug
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>

          {/* Phase pills */}
          <div className="flex flex-wrap gap-2">
            {PHASE_OPTIONS.map((ph) => (
              <button
                key={ph}
                onClick={() => setSelectedPhase(ph)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  selectedPhase === ph
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {ph}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-6 flex flex-col gap-3 rounded-[var(--cnv-radius-xl)] border border-gray-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={keyword} onChange={event => { setKeyword(event.target.value); setPage(1); }} placeholder="Tìm theo tên dự án, chủ đầu tư, vị trí..." className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-red-500" />
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-gray-400" />
            <select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-red-500">
              <option value="newest">Mới cập nhật</option>
              <option value="price_asc">Giá thấp → cao</option>
              <option value="price_desc">Giá cao → thấp</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between mb-6">
          <SectionTitle
            title="Danh Sách Dự Án"
            subtitle={`Hiển thị ${filtered.length.toLocaleString('vi-VN')} dự án${selectedArea !== 'all' ? ' tại khu vực đã chọn' : ''}`}
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Placeholder card */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-md flex flex-col items-center justify-center p-10 col-span-full text-center">
              <Building2 className="w-12 h-12 text-gray-300 mb-4" />
              <p className="text-lg font-semibold text-gray-400">Dữ liệu đang cập nhật...</p>
              <p className="text-sm text-gray-400 mt-1">Vui lòng quay lại sau hoặc liên hệ trực tiếp để được tư vấn.</p>
              <Link
                href={pageToHref({ name: 'listings' })}
                className="mt-4 inline-block px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Liên hệ ngay
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onContact={setContactProject}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
        {filtered.length > PROJECTS_PER_PAGE && (
          <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Phân trang dự án">
            <button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="rounded-lg border border-gray-200 p-2 text-gray-600 disabled:opacity-40" aria-label="Trang trước"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold text-gray-700">Trang {currentPage} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="rounded-lg border border-gray-200 p-2 text-gray-600 disabled:opacity-40" aria-label="Trang sau"><ChevronRight className="h-4 w-4" /></button>
          </nav>
        )}
        <ForYou />
      </div>

      {/* CTA Banner */}
      <div className="bg-gradient-to-r from-red-700 to-red-500 py-14 px-4 text-center text-white">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">Bạn đang tìm dự án phù hợp?</h2>
        <p className="text-red-100 mb-6 max-w-xl mx-auto">
          Đội ngũ chuyên gia của chúng tôi sẵn sàng tư vấn miễn phí và giới thiệu dự án phù hợp nhất với nhu cầu của bạn.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <a
            href={`tel:${phone.replace(/\s/g, '')}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-red-600 rounded-xl font-semibold hover:bg-red-50 transition-colors"
          >
            <Phone className="w-4 h-4" /> Gọi ngay: {phone}
          </a>
          <button
            onClick={() => { onNavigate({ name: 'listings' }); scrollTop(); }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-800/50 text-white rounded-xl font-semibold hover:bg-red-800/70 transition-colors border border-white/30"
          >
            Xem tất cả BĐS <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contact Modal */}
      {contactProperty && (
        <ContactModal
          property={contactProperty}
          onClose={() => setContactProject(null)}
        />
      )}
    </div>
  );
}