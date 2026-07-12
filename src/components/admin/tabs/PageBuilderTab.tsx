import React, { useState, useEffect } from 'react';
import { Star, Newspaper, Plus, Edit2, CheckCircle, MapPin, Save, AlertCircle, BarChart3, ArrowUp, ArrowDown, Home, Shield, Zap, Layers, LayoutGrid, GripVertical, PanelLeft } from 'lucide-react';
import type { PageSection, PropertyType, District, Ward } from '../../../lib/supabase';
import { getPageLayout, adminSavePageLayout, getPropertyTypes, getDistricts, getWards } from '../../../lib/api';
import { LEGAL_OPTIONS } from '../../../lib/legalOptions';
import { CATEGORY_ICON_NAMES } from '../../../lib/categoryIcons';

// ─── Page Builder Tab ─────────────────────────────────────────────────────────
const SECTION_ICON_MAP: Record<string, React.ReactNode> = {
  Home: <Home className="w-5 h-5" />,
  BarChart3: <BarChart3 className="w-5 h-5" />,
  Grid3X3: <LayoutGrid className="w-5 h-5" />,
  Layers: <Layers className="w-5 h-5" />,
  MapPin: <MapPin className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
  Star: <Star className="w-5 h-5" />,
  Newspaper: <Newspaper className="w-5 h-5" />,
  Zap: <Zap className="w-5 h-5" />,
  CheckCircle: <CheckCircle className="w-5 h-5" />,
};

type SectionSettings = Record<string, unknown>;

function SectionEditor({ sectionId, settings, onChange, propertyTypes, districts, wards }: {
  sectionId: string;
  settings: SectionSettings;
  onChange: (s: SectionSettings) => void;
  propertyTypes: PropertyType[];
  districts: District[];
  wards: Ward[];
}) {
  const get = (key: string, def: string) => (settings[key] as string) ?? def;
  const set = (key: string, val: unknown) => onChange({ ...settings, [key]: val });

  const Field = ({ label, k, def, multiline = false, placeholder = '' }: {
    label: string; k: string; def: string; multiline?: boolean; placeholder?: string;
  }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {multiline ? (
        <textarea value={get(k, def)} onChange={e => set(k, e.target.value)} placeholder={placeholder || def}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" rows={2} />
      ) : (
        <input type="text" value={get(k, def)} onChange={e => set(k, e.target.value)} placeholder={placeholder || def}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
      )}
    </div>
  );

  // Dropdown chọn 1 giá trị từ danh sách (value có thể khác nhãn hiển thị). Mục
  // rỗng = "không lọc theo chiều này".
  const Select = ({ label, k, options, emptyLabel = '— Không lọc —' }: {
    label: string; k: string; options: { value: string; label: string }[]; emptyLabel?: string;
  }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <select value={get(k, '')} onChange={e => set(k, e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
        <option value="">{emptyLabel}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  switch (sectionId) {
    case 'hero': return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nhãn pill trên cùng" k="hero_label" def="Tập trung khu vực Bình Dương" />
          <Field label="Placeholder tìm kiếm" k="search_placeholder" def="Tìm theo tên dự án, địa chỉ..." />
        </div>
        <Field label="Tiêu đề chính (H1)" k="title" def="Tìm kiếm bất động sản tại Bình Dương" />
        <Field label="Mô tả phụ" k="subtitle" def="Hơn 5.000 tin đăng nhà đất, căn hộ, đất nền uy tín..." multiline />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tab 'Mua bán'" k="tab_buy" def="Mua bán" />
          <Field label="Tab 'Cho thuê'" k="tab_rent" def="Cho thuê" />
          <Field label="Nút Tìm kiếm" k="btn_search" def="Tìm kiếm" />
        </div>
        <Field label="URL ảnh nền hero (để trống = dùng banner mặc định)" k="bg_image" def="" placeholder="https://..." />
      </div>
    );
    case 'stats': return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Dải 4 số liệu bên dưới hero. Mỗi ô gồm số và nhãn.</p>
        {[1,2,3,4].map(i => (
          <div key={i} className="grid grid-cols-2 gap-3">
            <Field label={`Số #${i}`} k={`stat${i}_number`} def={['5.000+','10.000+','7 năm','3'][i-1]} />
            <Field label={`Nhãn #${i}`} k={`stat${i}_label`} def={['Tin đăng','Khách hàng tin tưởng','Kinh nghiệm','Tỉnh phủ sóng'][i-1]} />
          </div>
        ))}
      </div>
    );
    case 'categories': return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">6 ô danh mục nhanh trên trang chủ. Mỗi ô có nhãn, icon và bộ lọc riêng — bấm vào sẽ mở trang danh sách đã lọc sẵn. Để trống chiều nào thì không lọc theo chiều đó.</p>
        {[1,2,3,4,5,6].map(i => {
          const districtName = get(`cat${i}_district`, '');
          const districtId = districts.find(d => d.name === districtName)?.id;
          const cellWards = districtId ? wards.filter(w => w.district_id === districtId) : [];
          return (
          <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white">
            <p className="text-xs font-bold text-gray-700">Ô #{i}</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nhãn hiển thị" k={`cat${i}_label`} def={['Nhà ở','Căn hộ','Đất nền','Đất nông nghiệp','Biệt thự','Văn phòng'][i-1]} />
              <Select label="Icon" k={`cat${i}_icon`} emptyLabel="Home (mặc định)"
                options={CATEGORY_ICON_NAMES.map(n => ({ value: n, label: n }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Lọc: Loại BĐS" k={`cat${i}_type`}
                options={propertyTypes.map(t => ({ value: t.id, label: t.name }))} />
              <Select label="Lọc: Khu vực" k={`cat${i}_district`}
                options={districts.map(d => ({ value: d.name, label: d.name }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Lọc: Phường/Xã" k={`cat${i}_ward`}
                emptyLabel={districtName ? '— Không lọc —' : '(Chọn quận/huyện trước)'}
                options={cellWards.map(w => ({ value: w.name, label: w.name }))} />
              <Select label="Lọc: Pháp lý" k={`cat${i}_legal`}
                options={LEGAL_OPTIONS.map(l => ({ value: l, label: l }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Lọc: Hình thức" k={`cat${i}_listing`}
                options={[{ value: 'mua_ban', label: 'Mua bán' }, { value: 'cho_thue', label: 'Cho thuê' }]} />
            </div>
          </div>
          );
        })}
      </div>
    );
    case 'featured_sections': return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-amber-800 mb-1">Cấu hình trong tab riêng</p>
        <p className="text-xs text-amber-700">Section này hiển thị các nhóm tin đăng được cấu hình trong tab <strong>"Tin nổi bật"</strong>. Mỗi nhóm có tiêu đề, bộ lọc, kiểu hiển thị riêng.</p>
      </div>
    );
    case 'region_banners': return (
      <div className="space-y-3">
        <Field label="Tiêu đề section" k="title" def="Khám phá theo khu vực" />
        {[
          { n: 1, dt: 'Bình Dương', ds: 'Thị trường chính – sôi động nhất', dd: 'Thủ Dầu Một, Dĩ An, Thuận An, Bến Cát, Tân Uyên...', db: 'Trọng tâm', di: 'https://images.pexels.com/photos/1732414/pexels-photo-1732414.jpeg', dslug: 'binh-duong' },
          { n: 2, dt: 'Bình Phước', ds: 'Tiềm năng – Giá tốt', dd: 'Đồng Xoài, Bình Long, Phước Long...', db: 'Tiềm năng', di: 'https://images.pexels.com/photos/2119714/pexels-photo-2119714.jpeg', dslug: 'binh-phuoc' },
          { n: 3, dt: 'Đồng Nai', ds: 'Khu vực mở rộng', dd: 'Biên Hòa, Long Thành, Nhơn Trạch...', db: 'Mở rộng', di: 'https://images.pexels.com/photos/280229/pexels-photo-280229.jpeg', dslug: 'dong-nai' },
        ].map(r => (
          <div key={r.n} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-bold text-gray-700">Khu vực {r.n}</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tên" k={`region${r.n}_title`} def={r.dt} />
              <Field label="Nhãn badge" k={`region${r.n}_badge`} def={r.db} />
            </div>
            <Field label="Mô tả ngắn" k={`region${r.n}_subtitle`} def={r.ds} />
            <Field label="Mô tả chi tiết" k={`region${r.n}_desc`} def={r.dd} />
            <Field label="URL ảnh" k={`region${r.n}_image`} def={r.di} placeholder="https://..." />
            <Field label="Area slug (khớp với DB)" k={`region${r.n}_slug`} def={r.dslug} />
          </div>
        ))}
      </div>
    );
    case 'why_us': return (
      <div className="space-y-3">
        <Field label="Tiêu đề section" k="title" def="Tại sao chọn chúng tôi?" />
        {[
          { n: 1, dt: 'Uy tín – Chuyên nghiệp', dd: 'Hơn 7 năm kinh nghiệm trong lĩnh vực BĐS tại Bình Dương' },
          { n: 2, dt: 'Thông tin minh bạch', dd: 'Mọi thông tin BĐS đều được xác thực và kiểm duyệt kỹ lưỡng' },
          { n: 3, dt: 'Hỗ trợ 24/7', dd: 'Đội ngũ chuyên gia sẵn sàng tư vấn mọi lúc bạn cần' },
          { n: 4, dt: 'Pháp lý an toàn', dd: 'Hỗ trợ đầy đủ thủ tục pháp lý từ A đến Z' },
        ].map(f => (
          <div key={f.n} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-bold text-gray-700">Lý do {f.n}</p>
            <Field label="Tiêu đề" k={`f${f.n}_title`} def={f.dt} />
            <Field label="Mô tả" k={`f${f.n}_desc`} def={f.dd} multiline />
          </div>
        ))}
      </div>
    );
    case 'testimonials': return (
      <div className="space-y-3">
        <Field label="Tiêu đề section" k="title" def="Khách hàng nói gì về chúng tôi" />
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Số lượng hiển thị (1–6)</label>
          <input type="number" min={1} max={6} value={(settings['max_count'] as number) ?? 3}
            onChange={e => set('max_count', Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
        <p className="text-xs text-gray-400">Nội dung đánh giá được quản lý trong tab <strong>Đánh giá</strong>.</p>
      </div>
    );
    case 'news': return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tiêu đề section" k="title" def="Tin tức thị trường" />
          <Field label="Nút Xem tất cả" k="btn_view_all" def="Xem tất cả" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Số bài hiển thị (1–6)</label>
          <input type="number" min={1} max={6} value={(settings['max_count'] as number) ?? 3}
            onChange={e => set('max_count', Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
        <p className="text-xs text-gray-400">Nội dung bài viết được quản lý trong tab <strong>Tin tức</strong>.</p>
      </div>
    );
    case 'cta': return (
      <div className="space-y-3">
        <Field label="Tiêu đề chính" k="title" def="Bạn có bất động sản cần bán hoặc cho thuê?" />
        <Field label="Mô tả phụ" k="subtitle" def="Đăng tin miễn phí ngay hôm nay – tiếp cận hàng nghìn khách hàng tiềm năng" multiline />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nút đăng tin" k="btn_post" def="Đăng tin ngay" />
          <Field label="Nút gọi điện (để trống = ẩn)" k="btn_call_label" def="" placeholder="Gọi ngay..." />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Màu nền (Tailwind class)</label>
          <input type="text" value={get('bg_class', 'from-red-600 to-red-700')} onChange={e => set('bg_class', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
      </div>
    );
    case 'social_proof': return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">4 biểu tượng tin cậy hiển thị dưới CTA.</p>
        {[1,2,3,4].map(i => (
          <Field key={i} label={`Mục #${i}`} k={`item${i}_text`} def={['Đăng ký miễn phí','Thông tin được xác thực','Hỗ trợ 7:00–21:00','Pháp lý rõ ràng'][i-1]} />
        ))}
      </div>
    );
    default: return <p className="text-xs text-gray-400 italic">Section này chưa có cấu hình riêng.</p>;
  }
}

export function PageBuilderTab() {
  const [sections, setSections] = useState<PageSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedState, setSavedState] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);

  useEffect(() => {
    getPageLayout().then(data => { setSections(data); setLoading(false); });
    getPropertyTypes().then(setPropertyTypes);
    getDistricts().then(setDistricts);
    getWards().then(setWards);
  }, []);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...sections];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setSections(next.map((s, i) => ({ ...s, order_index: i })));
    setDirty(true);
  };

  const toggleVisibility = (id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, is_visible: !s.is_visible } : s));
    setDirty(true);
  };

  const updateSettings = (id: string, settings: SectionSettings) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, settings } : s));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminSavePageLayout(sections.map((s, i) => ({ id: s.id, is_visible: s.is_visible, order_index: i, settings: s.settings })));
      setDirty(false);
      setSavedState(true);
      setTimeout(() => setSavedState(false), 2500);
    } catch (e) {
      alert('Lưu thất bại: ' + (e as Error).message);
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
    </div>
  );

  const visibleSections = sections.filter(s => s.is_visible);
  const hiddenSections = sections.filter(s => !s.is_visible);

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <PanelLeft className="w-5 h-5 text-red-600" />Bố cục trang chủ
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Sắp xếp thứ tự, ẩn/hiện và chỉnh sửa toàn bộ nội dung từng section trực tiếp tại đây.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex-shrink-0
            ${dirty ? 'bg-red-600 hover:bg-red-700 text-white shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
        >
          {saving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Đang lưu...</>
            : savedState ? <><CheckCircle className="w-4 h-4" />Đã lưu!</>
            : <><Save className="w-4 h-4" />Lưu thay đổi</>}
        </button>
      </div>

      {/* Live preview bar */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Thứ tự hiển thị hiện tại</p>
        <div className="flex flex-wrap gap-2">
          {visibleSections.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
              <span className="w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0">{i + 1}</span>
              {s.label}
            </div>
          ))}
          {visibleSections.length === 0 && <span className="text-gray-400 text-xs italic">Không có section nào được bật</span>}
        </div>
      </div>

      {/* Section list with inline editors */}
      <div className="space-y-2">
        {sections.map((section, index) => {
          const icon = SECTION_ICON_MAP[section.icon ?? ''] ?? <LayoutGrid className="w-5 h-5" />;
          const isFirst = index === 0;
          const isLast = index === sections.length - 1;
          const isExpanded = expandedId === section.id;

          return (
            <div key={section.id}
              className={`bg-white border rounded-xl transition-all duration-200
                ${section.is_visible ? 'border-gray-200 shadow-sm' : 'border-dashed border-gray-200 opacity-55'}`}
            >
              {/* Section header row */}
              <div className="flex items-center gap-3 p-4">
                <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />

                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
                  ${section.is_visible ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                  {icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{section.label}</span>
                    {section.id === 'hero' && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">Cố định</span>
                    )}
                    {dirty && sections.find(s => s.id === section.id)?.settings !== undefined && (
                      <span className="text-[10px] bg-orange-100 text-orange-600 font-bold px-1.5 py-0.5 rounded-full">Chưa lưu</span>
                    )}
                  </div>
                  {section.description && !isExpanded && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{section.description}</p>
                  )}
                </div>

                {/* Position badge */}
                {section.is_visible && (
                  <span className="text-xs text-gray-400 font-medium w-6 text-center flex-shrink-0">
                    #{visibleSections.findIndex(s => s.id === section.id) + 1}
                  </span>
                )}

                {/* Configure button */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : section.id)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex-shrink-0
                    ${isExpanded ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'}`}
                >
                  <Edit2 className="w-3 h-3" />
                  {isExpanded ? 'Đóng' : 'Chỉnh sửa'}
                </button>

                {/* Reorder */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={() => move(index, -1)} disabled={isFirst}
                    className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => move(index, 1)} disabled={isLast}
                    className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggleVisibility(section.id)}
                  disabled={section.id === 'hero'}
                  title={section.is_visible ? 'Ẩn section này' : 'Hiện section này'}
                  className={`relative w-10 h-5 rounded-full transition-all flex-shrink-0
                    ${section.id === 'hero' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
                    ${section.is_visible ? 'bg-red-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200
                    ${section.is_visible ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Inline content editor */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-4 bg-gray-50/50">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Nội dung & cấu hình</p>
                  <SectionEditor
                    sectionId={section.id}
                    settings={section.settings as SectionSettings}
                    onChange={s => updateSettings(section.id, s)}
                    propertyTypes={propertyTypes}
                    districts={districts}
                    wards={wards}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hidden sections */}
      {hiddenSections.length > 0 && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Đang ẩn ({hiddenSections.length})</p>
          <div className="flex flex-wrap gap-2">
            {hiddenSections.map(s => (
              <button key={s.id} onClick={() => toggleVisibility(s.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:border-red-400 hover:text-red-600 transition-colors">
                <Plus className="w-3 h-3" />{s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Save reminder */}
      {dirty && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-orange-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Có thay đổi chưa được lưu — nhấn <strong>Lưu thay đổi</strong> để áp dụng.</span>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Save className="w-3.5 h-3.5" />Lưu ngay
          </button>
        </div>
      )}
    </div>
  );
}
