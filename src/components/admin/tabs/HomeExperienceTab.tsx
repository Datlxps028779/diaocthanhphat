import { useEffect, useState } from 'react';
import { CheckCircle, Eye, Home, Image as ImageIcon, MapPinned, Save, Search, Tags } from 'lucide-react';
import type { Area, PageSection, PropertyType } from '../../../lib/supabase';
import { adminSavePageLayout, getPageLayout } from '../../../lib/api';
import { getAreas, getPropertyTypes } from '../../../lib/api/taxonomy';
import { ImageUrlInput } from '../../ImageUpload';

type SectionId = 'hero' | 'categories' | 'region_banners';

const CATEGORY_DEFAULTS = ['Nhà ở', 'Căn hộ', 'Đất nền', 'Đất nông nghiệp', 'Biệt thự', 'Văn phòng'];
const REGION_DEFAULTS = [
  { title: 'Bình Dương', badge: 'Trọng tâm', subtitle: 'Thị trường trọng điểm', desc: 'Khám phá danh sách bất động sản đang hoạt động.', image: 'https://images.pexels.com/photos/1732414/pexels-photo-1732414.jpeg', slug: 'binh-duong' },
  { title: 'Bình Phước', badge: 'Khám phá', subtitle: 'Khu vực tiềm năng', desc: 'Khám phá dữ liệu và tin đăng đã được xác thực.', image: 'https://images.pexels.com/photos/2119714/pexels-photo-2119714.jpeg', slug: 'binh-phuoc' },
  { title: 'Đồng Nai', badge: 'Mở rộng', subtitle: 'Khu vực mở rộng', desc: 'Theo dõi các bất động sản phù hợp nhu cầu của bạn.', image: 'https://images.pexels.com/photos/280229/pexels-photo-280229.jpeg', slug: 'dong-nai' },
];

export function HomeExperienceTab() {
  const [sections, setSections] = useState<PageSection[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([getPageLayout(), getAreas(), getPropertyTypes()])
      .then(([layout, nextAreas, nextTypes]) => {
        setSections(layout);
        setAreas(nextAreas);
        setPropertyTypes(nextTypes);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-16 text-center text-sm text-gray-400">Đang tải cấu hình trang chủ...</div>;
  }

  const hero = sections.find(section => section.id === 'hero') ?? null;
  const categories = sections.find(section => section.id === 'categories') ?? null;
  const regions = sections.find(section => section.id === 'region_banners') ?? null;

  if (!hero) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Chưa có section Hero trong Page Builder. Hãy thêm/cấu hình Hero tại Bố cục trang trước.</div>;
  }

  const settingsOf = (section: PageSection | null) => (section?.settings ?? {}) as Record<string, unknown>;
  const get = (section: PageSection | null, key: string, fallback = '') => {
    const value = settingsOf(section)[key];
    return typeof value === 'string' ? value : fallback;
  };
  const set = (sectionId: SectionId, key: string, value: string) => {
    setSections(current => current.map(section => section.id === sectionId ? { ...section, settings: { ...section.settings, [key]: value } } : section));
  };

  const save = async () => {
    const edited = sections.filter(section => ['hero', 'categories', 'region_banners'].includes(section.id));
    setSaving(true);
    try {
      await adminSavePageLayout(edited.map(section => ({ id: section.id, is_visible: section.is_visible, order_index: section.order_index, settings: section.settings })));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ sectionId, label, setting, placeholder = '', multiline = false }: { sectionId: SectionId; label: string; setting: string; placeholder?: string; multiline?: boolean }) => {
    const section = sections.find(item => item.id === sectionId) ?? null;
    return (
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
        {multiline ? (
          <textarea value={get(section, setting)} onChange={event => set(sectionId, setting, event.target.value)} placeholder={placeholder} rows={3}
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        ) : (
          <input value={get(section, setting)} onChange={event => set(sectionId, setting, event.target.value)} placeholder={placeholder}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        )}
      </div>
    );
  };

  const Select = ({ sectionId, label, setting, children }: { sectionId: SectionId; label: string; setting: string; children: React.ReactNode }) => {
    const section = sections.find(item => item.id === sectionId) ?? null;
    return (
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
        <select value={get(section, setting)} onChange={event => set(sectionId, setting, event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
          {children}
        </select>
      </div>
    );
  };

  const matchedRegions = REGION_DEFAULTS.map((fallback, index) => {
    const title = get(regions, `region${index + 1}_title`, fallback.title);
    const slug = get(regions, `region${index + 1}_slug`, fallback.slug);
    const area = areas.find(item => item.slug === slug || item.name.toLocaleLowerCase('vi-VN') === title.toLocaleLowerCase('vi-VN'));
    return { title, slug, area };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-start">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><Home className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Trải nghiệm trang chủ</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Điều chỉnh hero, danh mục nhanh và thẻ khu vực. Bố cục, bật/tắt và empty-state vẫn quản lý trong Bố cục trang.</p>
          </div>
        </div>
        <button onClick={save} disabled={saving}
          className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60">
          {saving ? 'Đang lưu...' : saved ? <><CheckCircle className="h-4 w-4" />Đã lưu</> : <><Save className="h-4 w-4" />Lưu trang chủ</>}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-red-600" /><h3 className="text-sm font-bold text-slate-800">Hero & thông điệp</h3></div>
          <Field sectionId="hero" label="Nhãn định vị" setting="hero_label" placeholder="Ví dụ: Tập trung khu vực Bình Dương" />
          <Field sectionId="hero" label="Tiêu đề chính" setting="title" placeholder="Tìm kiếm bất động sản phù hợp" />
          <Field sectionId="hero" label="Mô tả phụ" setting="subtitle" placeholder="Mô tả ngắn dựa trên giá trị thực của nền tảng" multiline />
          <ImageUrlInput value={get(hero, 'bg_image')} onChange={url => set('hero', 'bg_image', url)} folder="hero" isAdmin placeholder="Ảnh hero từ thư viện ảnh" />
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2"><Search className="h-4 w-4 text-red-600" /><h3 className="text-sm font-bold text-slate-800">Tìm kiếm hero</h3></div>
          <Field sectionId="hero" label="Placeholder tìm kiếm" setting="search_placeholder" placeholder="Tìm theo tên dự án, địa chỉ, khu vực..." />
          <div className="grid grid-cols-2 gap-3">
            <Field sectionId="hero" label="Tab mua bán" setting="tab_buy" placeholder="Mua bán" />
            <Field sectionId="hero" label="Tab cho thuê" setting="tab_rent" placeholder="Cho thuê" />
          </div>
          <Field sectionId="hero" label="Nút tìm kiếm" setting="btn_search" placeholder="Tìm kiếm" />
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">Slider/ảnh banner được quản lý trong tab <strong className="text-slate-700">Banners</strong>. Search tiếp tục dùng taxonomy, URL filter và logic tìm kiếm hiện có.</div>
        </div>
      </div>

      {categories && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2"><Tags className="h-4 w-4 text-red-600" /><h3 className="text-sm font-bold text-slate-800">Khám phá theo nhu cầu</h3></div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">{propertyTypes.length} loại BĐS trong taxonomy</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {CATEGORY_DEFAULTS.map((label, index) => (
              <div key={index} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <Field sectionId="categories" label={`Nhãn ô #${index + 1}`} setting={`cat${index + 1}_label`} placeholder={label} />
                <Select sectionId="categories" label="Loại BĐS lọc sẵn" setting={`cat${index + 1}_type`}>
                  <option value="">Không lọc theo loại</option>
                  {propertyTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      {regions && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2"><MapPinned className="h-4 w-4 text-red-600" /><h3 className="text-sm font-bold text-slate-800">Thẻ khu vực</h3></div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">{matchedRegions.filter(item => item.area).length}/3 khớp DB</span>
          </div>
          <Field sectionId="region_banners" label="Tiêu đề section" setting="title" placeholder="Khám phá theo khu vực" />
          <div className="grid gap-3 lg:grid-cols-3">
            {REGION_DEFAULTS.map((fallback, index) => {
              const matched = matchedRegions[index];
              return (
                <div key={index} className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">Khu vực #{index + 1}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${matched.area ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{matched.area ? matched.area.name : 'Chưa khớp'}</span>
                  </div>
                  <Field sectionId="region_banners" label="Tên" setting={`region${index + 1}_title`} placeholder={fallback.title} />
                  <Field sectionId="region_banners" label="Badge" setting={`region${index + 1}_badge`} placeholder={fallback.badge} />
                  <Field sectionId="region_banners" label="Mô tả ngắn" setting={`region${index + 1}_subtitle`} placeholder={fallback.subtitle} />
                  <Field sectionId="region_banners" label="Area slug" setting={`region${index + 1}_slug`} placeholder={fallback.slug} />
                  <ImageUrlInput value={get(regions, `region${index + 1}_image`, fallback.image)} onChange={url => set('region_banners', `region${index + 1}_image`, url)} folder="regions" isAdmin placeholder="Ảnh khu vực" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        <Eye className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>Tab này chỉ lưu settings cho các section hiện có. Không tạo dữ liệu giả, không đổi URL, không thay logic sản phẩm; thẻ khu vực public chỉ hiện khi khớp khu vực thật.</span>
      </div>
    </div>
  );
}
