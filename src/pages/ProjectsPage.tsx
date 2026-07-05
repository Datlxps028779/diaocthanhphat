import { useState, useEffect } from 'react';
import { Building2, MapPin, Users, CheckCircle, Phone, ArrowRight } from 'lucide-react';
import { type Project, type Area } from '../lib/supabase';
import { getProjects, getAreas } from '../lib/api';
import { type Page, scrollTop } from '../lib/router';
import { Breadcrumb, SectionTitle } from '../components/Layout';
import { ContactModal } from '../components/ContactModal';
import { useSetting } from '../lib/cms';

const PHASE_OPTIONS = ['Tất cả', 'Đang mở bán', 'Sắp ra mắt', 'Đã bàn giao'];

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

export function ProjectsPage({ onNavigate, initialPhase }: { onNavigate: (p: Page) => void; initialPhase?: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<string>('all');
  const [selectedPhase, setSelectedPhase] = useState<string>(initialPhase ?? 'Tất cả');
  const [contactProject, setContactProject] = useState<Project | null>(null);
  const phone = useSetting('phone_hotline', '0901 234 567');

  useEffect(() => {
    scrollTop();
    Promise.all([getProjects(), getAreas()])
      .then(([proj, ar]) => {
        setProjects(proj);
        setAreas(ar);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects.filter((p) => {
    const phase = p.phase ?? 'Đang mở bán';
    const areaMatch = selectedArea === 'all' || p.area_id === selectedArea || p.areas?.slug === selectedArea;
    const phaseMatch = selectedPhase === 'Tất cả' || phase === selectedPhase;
    return areaMatch && phaseMatch;
  });

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

      {/* Stat bar */}
      <div className="bg-red-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { icon: <Building2 className="w-5 h-5" />, val: `${projects.length || '50'}+`, label: 'Dự án' },
            { icon: <MapPin className="w-5 h-5" />, val: `${areas.length || '4'}`, label: 'Tỉnh thành' },
            { icon: <Users className="w-5 h-5" />, val: '1.200+', label: 'Khách hàng' },
            { icon: <CheckCircle className="w-5 h-5" />, val: '98%', label: 'Bàn giao đúng hạn' },
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
        <div className="flex items-center justify-between mb-6">
          <SectionTitle
            title="Danh Sách Dự Án"
            subtitle={`Hiển thị ${filtered.length} dự án${selectedArea !== 'all' ? ' tại khu vực đã chọn' : ''}`}
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
              <button
                onClick={() => onNavigate({ name: 'listings' })}
                className="mt-4 px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Liên hệ ngay
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onContact={setContactProject}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
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