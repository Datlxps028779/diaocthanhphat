import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Star, Newspaper, Plus, Edit2, CheckCircle, MapPin, Save, AlertCircle, BarChart3, ArrowUp, ArrowDown, Home, Shield, Zap, Layers, LayoutGrid, GripVertical, PanelLeft, Clock, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Area, PageSection, PropertyType, District, Ward } from '../../../lib/supabase';
import { getPageLayout, adminSavePageLayout, getPropertyTypes, getDistricts, getWards, AdminPageLayoutError, type AdminPageSectionInput } from '../../../lib/api';
import { getAreas } from '../../../lib/api/taxonomy';
import { readLocationDiscovery, validateLocationItems, type HomeLocationItem } from '../../../lib/homeLocationDiscovery';
import { qk } from '../../../lib/queryKeys';
import { HomeLocationDiscoveryEditor } from '../HomeLocationDiscoveryEditor';
import { LEGAL_OPTIONS } from '../../../lib/legalOptions';
import { CATEGORY_ICON_NAMES } from '../../../lib/categoryIcons';
import { ImageUrlInput } from '../../ImageUpload';

// Dòng `timeline` không có trong seed page_sections (xem migration page_builder:
// seed chỉ có hero/stats/categories/featured_sections/region_banners/...). Runtime
// tự chèn timeline vào thứ tự hiển thị, nhưng KHÔNG có row trong DB nên preset
// sắp xếp không thể tác động lên nó nếu thiếu row — cần chạy SQL thủ công.
const TIMELINE_SECTION_ID = 'timeline';
const PRESET_MESSAGE = 'Đã xếp khám phá khu vực ngay dưới dòng thời gian (chưa lưu — bấm "Lưu thay đổi").';

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
  Clock: <Clock className="w-5 h-5" />,
  Zap: <Zap className="w-5 h-5" />,
  CheckCircle: <CheckCircle className="w-5 h-5" />,
};

type SectionSettings = Record<string, unknown>;

// ─── Field primitives ─────────────────────────────────────────────────────────
// Định nghĩa ở module scope, KHÔNG lồng trong SectionEditor: component lồng nhau
// tạo type mới mỗi render → React unmount/remount input → mất focus mỗi ký tự.
// value/onChange truyền tường minh để input giữ nguyên identity.
function Field({ label, value, onChange, multiline = false, placeholder = '' }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" rows={2} />
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
      )}
    </div>
  );
}

// Ảnh: tải lên / chọn từ thư viện (nhất quán với NewsTab/Banners/Properties)
function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <ImageUrlInput value={value} onChange={onChange}
        placeholder="Tải ảnh lên hoặc chọn từ thư viện" folder="pages" isAdmin />
    </div>
  );
}

// Dropdown chọn 1 giá trị (value có thể khác nhãn). Mục rỗng = "không lọc".
function Select({ label, value, onChange, options, emptyLabel = '— Không lọc —' }: {
  label: string; value: string; onChange: (value: string) => void;
  options: { value: string; label: string }[]; emptyLabel?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
        <option value="">{emptyLabel}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// Chiến lược nội dung dùng chung. region_banners lấy dữ liệu THẬT từ taxonomy nên
// source_mode (auto/manual/mixed) vô nghĩa với nó → ẩn ô đó; giữ empty_behavior.
function ContentStrategy({ settings, onChange, hideSourceMode = false }: {
  settings: SectionSettings; onChange: (s: SectionSettings) => void; hideSourceMode?: boolean;
}) {
  const get = (key: string, def: string) => (settings[key] as string) ?? def;
  const set = (key: string, val: unknown) => onChange({ ...settings, [key]: val });
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div>
        <p className="text-xs font-bold text-slate-700">{hideSourceMode ? 'Khi thiếu nội dung' : 'Nguồn dữ liệu & khi thiếu nội dung'}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          {hideSourceMode
            ? 'Khu vực lấy trực tiếp từ taxonomy đang hoạt động. Không đủ dữ liệu, trang public sẽ xử lý theo lựa chọn bên dưới.'
            : 'Chỉ dùng dữ liệu thật trong hệ thống. Không đủ dữ liệu, trang public sẽ xử lý theo lựa chọn bên dưới.'}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {!hideSourceMode && (
          <Select label="Nguồn hiển thị" value={get('source_mode', '')} onChange={v => set('source_mode', v)} emptyLabel="Tự động từ dữ liệu thật"
            options={[{ value: 'manual', label: 'Admin chọn thủ công' }, { value: 'mixed', label: 'Kết hợp tự động + thủ công' }]} />
        )}
        <Select label="Khi không có dữ liệu" value={get('empty_behavior', '')} onChange={v => set('empty_behavior', v)} emptyLabel="Tự ẩn section"
          options={[{ value: 'empty_state', label: 'Hiện thông báo + CTA' }]} />
      </div>
      {get('empty_behavior', '') === 'empty_state' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tiêu đề empty state" value={get('empty_title', 'Chưa có nội dung phù hợp')} onChange={v => set('empty_title', v)} placeholder="Chưa có nội dung phù hợp" />
          <Field label="Nút CTA" value={get('empty_cta_label', '')} onChange={v => set('empty_cta_label', v)} placeholder="Ví dụ: Khám phá bất động sản" />
          <div className="sm:col-span-2">
            <Field label="Mô tả empty state" value={get('empty_description', 'Nội dung sẽ xuất hiện khi có dữ liệu đã được xác thực.')} onChange={v => set('empty_description', v)} placeholder="Nội dung sẽ xuất hiện khi có dữ liệu đã được xác thực." multiline />
          </div>
          <div className="sm:col-span-2">
            <Field label="Đường dẫn CTA" value={get('empty_cta_href', '')} onChange={v => set('empty_cta_href', v)} placeholder="Ví dụ: /mua-ban" />
          </div>
        </div>
      )}
    </div>
  );
}

const CONTENT_DRIVEN_SECTIONS = new Set(['featured_sections', 'region_banners', 'testimonials', 'news']);

function SectionEditor({ sectionId, settings, onChange, propertyTypes, districts, wards, areas }: {
  sectionId: string;
  settings: SectionSettings;
  onChange: (s: SectionSettings) => void;
  propertyTypes: PropertyType[];
  districts: District[];
  wards: Ward[];
  areas: Area[];
}) {
  const get = (key: string, def: string) => (settings[key] as string) ?? def;
  const set = (key: string, val: unknown) => onChange({ ...settings, [key]: val });
  const withContentStrategy = (children: React.ReactNode) => (
    <div className="space-y-3">
      {children}
      {CONTENT_DRIVEN_SECTIONS.has(sectionId) && <ContentStrategy settings={settings} onChange={onChange} hideSourceMode={sectionId === 'region_banners'} />}
    </div>
  );

  switch (sectionId) {
    case 'hero': return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nhãn pill trên cùng" value={get('hero_label', 'Tập trung khu vực Bình Dương')} onChange={v => set('hero_label', v)} placeholder="Tập trung khu vực Bình Dương" />
          <Field label="Placeholder tìm kiếm" value={get('search_placeholder', 'Tìm theo tên dự án, địa chỉ...')} onChange={v => set('search_placeholder', v)} placeholder="Tìm theo tên dự án, địa chỉ..." />
        </div>
        <Field label="Tiêu đề chính (H1)" value={get('title', 'Tìm kiếm bất động sản tại Bình Dương')} onChange={v => set('title', v)} placeholder="Tìm kiếm bất động sản tại Bình Dương" />
        <Field label="Mô tả phụ" value={get('subtitle', 'Hơn 5.000 tin đăng nhà đất, căn hộ, đất nền uy tín...')} onChange={v => set('subtitle', v)} placeholder="Hơn 5.000 tin đăng nhà đất, căn hộ, đất nền uy tín..." multiline />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tab 'Mua bán'" value={get('tab_buy', 'Mua bán')} onChange={v => set('tab_buy', v)} placeholder="Mua bán" />
          <Field label="Tab 'Cho thuê'" value={get('tab_rent', 'Cho thuê')} onChange={v => set('tab_rent', v)} placeholder="Cho thuê" />
          <Field label="Nút Tìm kiếm" value={get('btn_search', 'Tìm kiếm')} onChange={v => set('btn_search', v)} placeholder="Tìm kiếm" />
        </div>
        <ImageField label="Ảnh nền hero (để trống = dùng banner mặc định)" value={get('bg_image', '')} onChange={v => set('bg_image', v)} />
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
              <Field label="Nhãn hiển thị" value={get(`cat${i}_label`, ['Nhà ở','Căn hộ','Đất nền','Đất nông nghiệp','Biệt thự','Văn phòng'][i-1])} onChange={v => set(`cat${i}_label`, v)} placeholder={['Nhà ở','Căn hộ','Đất nền','Đất nông nghiệp','Biệt thự','Văn phòng'][i-1]} />
              <Select label="Icon" value={get(`cat${i}_icon`, '')} onChange={v => set(`cat${i}_icon`, v)} emptyLabel="Home (mặc định)"
                options={CATEGORY_ICON_NAMES.map(n => ({ value: n, label: n }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Lọc: Loại BĐS" value={get(`cat${i}_type`, '')} onChange={v => set(`cat${i}_type`, v)}
                options={propertyTypes.map(t => ({ value: t.id, label: t.name }))} />
              <Select label="Lọc: Khu vực" value={get(`cat${i}_district`, '')} onChange={v => set(`cat${i}_district`, v)}
                options={districts.map(d => ({ value: d.name, label: d.name }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Lọc: Phường/Xã" value={get(`cat${i}_ward`, '')} onChange={v => set(`cat${i}_ward`, v)}
                emptyLabel={districtName ? '— Không lọc —' : '(Chọn quận/huyện trước)'}
                options={cellWards.map(w => ({ value: w.name, label: w.name }))} />
              <Select label="Lọc: Pháp lý" value={get(`cat${i}_legal`, '')} onChange={v => set(`cat${i}_legal`, v)}
                options={LEGAL_OPTIONS.map(l => ({ value: l, label: l }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Lọc: Hình thức" value={get(`cat${i}_listing`, '')} onChange={v => set(`cat${i}_listing`, v)}
                options={[{ value: 'mua_ban', label: 'Mua bán' }, { value: 'cho_thue', label: 'Cho thuê' }]} />
            </div>
          </div>
          );
        })}
      </div>
    );
    case 'timeline': return (
      <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm font-semibold text-blue-800">Dòng thời gian dữ liệu thật</p>
        <p className="text-xs leading-5 text-blue-700">Trang chủ hiển thị tin bất động sản đang công khai theo 12 khung giờ, mỗi khung 2 tiếng (giờ Việt Nam). Dùng mốc tạo bản ghi, không phải lịch sử xuất bản hay duyệt lại. Người xem có thể chọn ngày, chuyển ngày/tuần; dữ liệu tự cập nhật mỗi 30 giây khi trang đang mở.</p>
      </div>
    );
    case 'featured_sections': return withContentStrategy(
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-amber-800 mb-1">Cấu hình trong tab riêng</p>
        <p className="text-xs text-amber-700">Section này hiển thị các nhóm tin đăng được cấu hình trong tab <strong>"Tin nổi bật"</strong>. Mỗi nhóm có tiêu đề, bộ lọc, kiểu hiển thị riêng.</p>
      </div>
    );
    case 'region_banners': {
      // Khu vực do editor dùng chung quản lý (chọn tỉnh THẬT từ taxonomy).
      const raw = rawLocationItems(settings, areas);
      const regionIssues = [...new Set([...raw.issues, ...validateLocationItems(raw.items, areas)])];
      return withContentStrategy(
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            Khối này hiển thị theo <strong className="text-slate-700">tỉnh/thành thật</strong> trong hệ thống. Chọn và sắp xếp thẻ tỉnh bên dưới; khách chọn tỉnh sẽ thấy quận/huyện tương ứng.
          </div>
          {regionIssues.length > 0 && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Cấu hình chưa hợp lệ nên chưa thể lưu: {regionIssues.join(' ')}
            </div>
          )}
          <HomeLocationDiscoveryEditor settings={settings} areas={areas} onChange={next => onChange(next)} />
        </div>
      );
    }
    case 'why_us': return (
      <div className="space-y-3">
        <Field label="Tiêu đề section" value={get('title', 'Tại sao chọn chúng tôi?')} onChange={v => set('title', v)} placeholder="Tại sao chọn chúng tôi?" />
        {[
          { n: 1, dt: 'Uy tín – Chuyên nghiệp', dd: 'Hơn 7 năm kinh nghiệm trong lĩnh vực BĐS tại Bình Dương' },
          { n: 2, dt: 'Thông tin minh bạch', dd: 'Mọi thông tin BĐS đều được xác thực và kiểm duyệt kỹ lưỡng' },
          { n: 3, dt: 'Hỗ trợ 7:00 – 21:00', dd: 'Đội ngũ chuyên gia sẵn sàng tư vấn trong giờ hỗ trợ đã công bố' },
          { n: 4, dt: 'Pháp lý an toàn', dd: 'Hỗ trợ đầy đủ thủ tục pháp lý từ A đến Z' },
        ].map(f => (
          <div key={f.n} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-bold text-gray-700">Lý do {f.n}</p>
            <Field label="Tiêu đề" value={get(`f${f.n}_title`, f.dt)} onChange={v => set(`f${f.n}_title`, v)} placeholder={f.dt} />
            <Field label="Mô tả" value={get(`f${f.n}_desc`, f.dd)} onChange={v => set(`f${f.n}_desc`, v)} placeholder={f.dd} multiline />
          </div>
        ))}
      </div>
    );
    case 'testimonials': return withContentStrategy(
      <>
        <Field label="Tiêu đề section" value={get('title', 'Khách hàng nói gì về chúng tôi')} onChange={v => set('title', v)} placeholder="Khách hàng nói gì về chúng tôi" />
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Số lượng hiển thị (1–6)</label>
          <input type="number" min={1} max={6} value={(settings['max_count'] as number) ?? 3}
            onChange={e => set('max_count', Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
        <p className="text-xs text-gray-400">Nội dung đánh giá được quản lý trong tab <strong>Đánh giá</strong>.</p>
      </>
    );
    case 'news': return withContentStrategy(
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tiêu đề section" value={get('title', 'Tin tức thị trường')} onChange={v => set('title', v)} placeholder="Tin tức thị trường" />
          <Field label="Nút Xem tất cả" value={get('btn_view_all', 'Xem tất cả')} onChange={v => set('btn_view_all', v)} placeholder="Xem tất cả" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Số bài hiển thị (1–6)</label>
          <input type="number" min={1} max={6} value={(settings['max_count'] as number) ?? 3}
            onChange={e => set('max_count', Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
        <p className="text-xs text-gray-400">Nội dung bài viết được quản lý trong tab <strong>Tin tức</strong>.</p>
      </>
    );
    case 'cta': return (
      <div className="space-y-3">
        <Field label="Tiêu đề chính" value={get('title', 'Bạn có bất động sản cần bán hoặc cho thuê?')} onChange={v => set('title', v)} placeholder="Bạn có bất động sản cần bán hoặc cho thuê?" />
        <Field label="Mô tả phụ" value={get('subtitle', 'Đăng tin miễn phí ngay hôm nay – tiếp cận hàng nghìn khách hàng tiềm năng')} onChange={v => set('subtitle', v)} placeholder="Đăng tin miễn phí ngay hôm nay – tiếp cận hàng nghìn khách hàng tiềm năng" multiline />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nút đăng tin" value={get('btn_post', 'Đăng tin ngay')} onChange={v => set('btn_post', v)} placeholder="Đăng tin ngay" />
          <Field label="Nút gọi điện (để trống = ẩn)" value={get('btn_call_label', '')} onChange={v => set('btn_call_label', v)} placeholder="Gọi ngay..." />
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
          <Field key={i} label={`Mục #${i}`} value={get(`item${i}_text`, ['Đăng ký miễn phí','Thông tin được xác thực','Hỗ trợ 7:00–21:00','Pháp lý rõ ràng'][i-1])} onChange={v => set(`item${i}_text`, v)} placeholder={['Đăng ký miễn phí','Thông tin được xác thực','Hỗ trợ 7:00–21:00','Pháp lý rõ ràng'][i-1]} />
        ))}
      </div>
    );
    default: return <p className="text-xs text-gray-400 italic">Section này chưa có cấu hình riêng.</p>;
  }
}

/**
 * Đọc các thẻ khu vực THÔ để validate (không lọc bỏ thẻ lỗi).
 * readLocationDiscovery() lọc mất thẻ có image_url chưa hợp lệ khi đang gõ, nên
 * nếu chỉ validate(parsed.items) thì lỗi đó biến mất và cấu hình sai bị lưu âm
 * thầm. Với settings v2 ta lấy thẳng settings.items, còn lại dùng parsed.items
 * (đường legacy vốn đã tự sinh item hợp lệ) và ghép cả parsed.issues.
 */
function rawLocationItems(settings: Record<string, unknown>, areas: Area[]): { items: HomeLocationItem[]; issues: string[] } {
  const parsed = readLocationDiscovery(settings, areas);
  if (settings.version === 2 && Array.isArray(settings.items)) {
    const items = settings.items.filter((item): item is HomeLocationItem =>
      !!item && typeof item === 'object' && typeof (item as HomeLocationItem).id === 'string'
      && typeof (item as HomeLocationItem).area_id === 'string'
      && typeof (item as HomeLocationItem).image_url === 'string'
      && typeof (item as HomeLocationItem).subtitle === 'string'
      && typeof (item as HomeLocationItem).enabled === 'boolean');
    return { items, issues: parsed.issues };
  }
  return { items: parsed.items, issues: parsed.issues };
}

export function PageBuilderTab() {
  const queryClient = useQueryClient();
  const [sections, setSections] = useState<PageSection[]>([]);
  // baseline = bản ghi đã lưu gần nhất (dùng cho dirty + expected_updated_at).
  const [baseline, setBaseline] = useState<PageSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedState, setSavedState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // stale/partial → bắt buộc reload trước khi lưu tiếp, nhưng GIỮ draft trên màn hình.
  const [needsReload, setNeedsReload] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areasFailed, setAreasFailed] = useState(false);
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
  const savedTimer = useRef<number | null>(null);

  const loadAreas = useCallback(async () => {
    setAreasFailed(true);
    try {
      setAreas(await getAreas());
      setAreasFailed(false);
    } catch {
      setAreasFailed(true);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setError(null);
    setNeedsReload(false);
    setAreasFailed(false);
    // Layout là bắt buộc — lỗi thì chặn cả tab. Các taxonomy phụ lỗi thì chỉ
    // giới hạn khả năng lọc (một số ô không có lựa chọn) chứ không chặn lưu.
    try {
      const layout = await getPageLayout();
      setSections(layout);
      setBaseline(layout);
    } catch (e) {
      setLoadError((e as Error).message);
      setLoading(false);
      return;
    }
    void getPropertyTypes().then(setPropertyTypes).catch(() => undefined);
    void getDistricts().then(setDistricts).catch(() => undefined);
    void getWards().then(setWards).catch(() => undefined);
    await loadAreas();
    setLoading(false);
  }, [loadAreas]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (savedTimer.current) window.clearTimeout(savedTimer.current); }, []);

  const clearNotice = () => {
    setSavedState(false);
    setPresetNotice(null);
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...sections];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setSections(next.map((s, i) => ({ ...s, order_index: i })));
    clearNotice();
  };

  const toggleVisibility = (id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, is_visible: !s.is_visible } : s));
    clearNotice();
  };

  const updateSettings = (id: string, settings: SectionSettings) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, settings } : s));
    clearNotice();
  };

  // Timeline có row thật trong DB? Seed không tạo row này nên thường là false.
  const timelineRow = sections.find(section => section.id === TIMELINE_SECTION_ID) ?? null;

  // Preset: đặt khám phá khu vực NGAY DƯỚI timeline.
  // - Chỉ hoạt động khi có row timeline (nếu không, thứ tự do runtime tự chèn,
  //   DB không giữ được vị trí → cần chạy SQL thủ công để tạo row).
  // - Giữ nguyên thứ tự tương đối của các section khác và KHÔNG tự bật section
  //   đang ẩn (kể cả region_banners).
  const applyPreset = () => {
    if (!timelineRow) return;
    const region = sections.find(section => section.id === 'region_banners');
    if (!region) return;
    const rest = sections
      .filter(section => section.id !== TIMELINE_SECTION_ID && section.id !== 'region_banners')
      .sort((a, b) => a.order_index - b.order_index);
    const categoriesIndex = rest.findIndex(section => section.id === 'categories');
    const ordered = [...rest];
    const insertAt = categoriesIndex >= 0 ? categoriesIndex + 1 : 0;
    ordered.splice(insertAt, 0, timelineRow, region);
    setSections(ordered.map((section, index) => ({ ...section, order_index: index })));
    setPresetNotice(PRESET_MESSAGE);
    setSavedState(false);
  };

  const settingsOf = (section: PageSection) => (section?.settings ?? {}) as Record<string, unknown>;

  // Dirty per-row: so settings + is_visible + order_index với baseline.
  const dirtyIds = useMemo(() => {
    const result = new Set<string>();
    for (const section of sections) {
      const base = baseline.find(row => row.id === section.id);
      if (!base) { result.add(section.id); continue; }
      if (base.is_visible !== section.is_visible
        || base.order_index !== section.order_index
        || JSON.stringify(settingsOf(base)) !== JSON.stringify(settingsOf(section))) {
        result.add(section.id);
      }
    }
    return result;
  }, [sections, baseline]);

  const isDirty = dirtyIds.size > 0;

  // Chặn lưu nếu cấu hình khu vực đang dirty mà sai định dạng (không âm thầm lưu rác).
  const regionSection = sections.find(section => section.id === 'region_banners') ?? null;
  // Chỉ soi cấu hình khi chính SETTINGS của region_banners đổi — bật/tắt hiển thị
  // hay đổi thứ tự không phải là sửa cấu hình khu vực nên không cần chặn.
  const regionSettingsDirty = useMemo(() => {
    if (!regionSection) return false;
    const base = baseline.find(row => row.id === 'region_banners');
    if (!base) return false;
    return JSON.stringify(settingsOf(base)) !== JSON.stringify(settingsOf(regionSection));
  }, [regionSection, baseline]);

  const regionIssues = useMemo(() => {
    if (!regionSection || !regionSettingsDirty) return [] as string[];
    const raw = rawLocationItems(settingsOf(regionSection), areas);
    return [...new Set([...raw.issues, ...validateLocationItems(raw.items, areas)])];
  }, [regionSection, regionSettingsDirty, areas]);

  // Không tải được khu vực thì chỉ chặn lưu khi đang đụng tới chính khối khu vực
  // (sửa/thứ tự/bật-tắt). Các section khác vẫn lưu được.
  const areasBlockSave = areasFailed && dirtyIds.has('region_banners');
  const canSave = !saving && isDirty && !needsReload && !areasBlockSave && regionIssues.length === 0;

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    setSavedState(false);
    setPresetNotice(null);

    // Chỉ gửi dòng dirty. Với dòng chỉ sửa settings (vd region_banners) thì KHÔNG
    // gửi is_visible/order_index để không ghi đè giá trị admin đặt ở nơi khác.
    const patches: AdminPageSectionInput[] = [...dirtyIds].flatMap(id => {
      const current = sections.find(section => section.id === id);
      const base = baseline.find(row => row.id === id);
      if (!current || !base) return [];
      const patch: AdminPageSectionInput = { id, expected_updated_at: base.updated_at };
      if (JSON.stringify(settingsOf(current)) !== JSON.stringify(settingsOf(base))) patch.settings = settingsOf(current);
      if (current.is_visible !== base.is_visible) patch.is_visible = current.is_visible;
      if (current.order_index !== base.order_index) patch.order_index = current.order_index;
      return [patch];
    });
    if (!patches.length) return;

    setSaving(true);
    try {
      // API trả về CHỈ các hàng vừa ghi (bản ghi tươi, updated_at mới). Ghép vào
      // state + baseline hiện có để không mất các hàng chưa đụng tới.
      const savedRows = await adminSavePageLayout(patches);
      const byId = new Map(savedRows.map(row => [row.id, row]));
      setBaseline(current => current.map(row => byId.get(row.id) ?? row));
      setSections(current => current.map(row => byId.get(row.id) ?? row));
      setSavedState(true);
      void queryClient.invalidateQueries({ queryKey: qk.pageLayout() });
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSavedState(false), 2500);
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Lỗi không xác định';
      if (e instanceof AdminPageLayoutError && e.persistedIds.length) {
        void queryClient.invalidateQueries({ queryKey: qk.pageLayout() });
      }
      setError(detail);
      setNeedsReload(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
    </div>
  );

  if (loadError) return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <div role="alert" className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>Không tải được bố cục trang chủ: {loadError}</span>
      </div>
      <button type="button" onClick={() => void load()}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100">
        <RotateCcw className="h-4 w-4" />Thử lại
      </button>
    </div>
  );

  const visibleSections = sections.filter(s => s.is_visible);
  const hiddenSections = sections.filter(s => !s.is_visible);

  return (
    <fieldset disabled={saving} className="min-w-0 space-y-5">
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
        <div className="flex items-center gap-2 flex-shrink-0">
          {needsReload && (
            <button type="button" onClick={() => void load()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-amber-300 bg-white text-amber-800 hover:bg-amber-50">
              <RotateCcw className="w-4 h-4" />Tải lại
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex-shrink-0
              ${canSave ? 'bg-red-600 hover:bg-red-700 text-white shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Đang lưu...</>
              : savedState ? <><CheckCircle className="w-4 h-4" />Đã lưu!</>
              : <><Save className="w-4 h-4" />Lưu thay đổi</>}
          </button>
        </div>
      </div>

      {/* Lỗi lưu — không hiển thị thành công giả. Bản nháp luôn được giữ. */}
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <p className="mt-1.5 pl-6 text-xs leading-5 text-red-700">
            {needsReload
              ? 'Bố cục trên máy chủ đã đổi — bản nháp của bạn vẫn giữ nguyên. Bấm "Tải lại" để lấy trạng thái mới nhất rồi lưu lại.'
              : 'Bản nháp của bạn vẫn giữ nguyên. Sửa nếu cần rồi bấm "Lưu thay đổi" để thử lại.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 pl-6">
            <button type="button" onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50">
              <RotateCcw className="h-3.5 w-3.5" />Tải lại
            </button>
            {!needsReload && (
              <button type="button" onClick={() => void handleSave()} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Lưu lại
              </button>
            )}
          </div>
        </div>
      )}

      {areasFailed && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{areasBlockSave
              ? 'Không tải được danh sách khu vực nên chưa thể lưu cấu hình "Khám phá theo khu vực". Các section khác vẫn lưu được bình thường.'
              : 'Không tải được danh sách khu vực. Các section khác vẫn lưu được bình thường.'}</span>
          </div>
          <button type="button" onClick={() => void loadAreas()}
            className="mt-3 ml-6 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100">
            <RotateCcw className="h-3.5 w-3.5" />Thử tải lại khu vực
          </button>
        </div>
      )}

      {regionIssues.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Cấu hình khu vực chưa hợp lệ nên chưa thể lưu: {regionIssues.join(' ')}
        </div>
      )}

      {/* Preset: đặt khám phá khu vực ngay dưới timeline */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Sắp xếp nhanh</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">Đưa dòng thời gian lên ngay dưới danh mục và khu vực ngay dưới dòng thời gian. Giữ nguyên thứ tự các section khác và không tự bật section đang ẩn.</p>
          </div>
          <button type="button" onClick={applyPreset} disabled={!timelineRow}
            title={timelineRow ? undefined : 'Cần dòng thời gian trong DB (chạy SQL thủ công ở trên)'}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">
            <Sparkles className="w-4 h-4" />Đặt khám phá ngay dưới timeline
          </button>
        </div>
        {!timelineRow && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <AlertCircle className="mt-0.5 w-4 h-4 flex-shrink-0" />
            <span>Chưa có dòng <strong>dòng thời gian</strong> trong bảng <code>page_sections</code> nên chưa thể sắp xếp cố định trong DB. Cần chạy SQL thủ công để tạo row <code>timeline</code>; hiện tại trang chủ vẫn tự chèn dòng thời gian ngay dưới danh mục.</span>
          </div>
        )}
        {presetNotice && (
          <div role="status" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800">{presetNotice}</div>
        )}
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
                    {dirtyIds.has(section.id) && (
                      <span className="text-[10px] bg-orange-100 text-orange-600 font-bold px-1.5 py-0.5 rounded-full">Chưa lưu</span>
                    )}
                    {section.id === TIMELINE_SECTION_ID && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">Tự động</span>
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
                    areas={areas}
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
      {isDirty && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-orange-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{dirtyIds.size} section có thay đổi chưa được lưu — nhấn <strong>Lưu thay đổi</strong> để áp dụng.</span>
          </div>
          <button onClick={handleSave} disabled={!canSave} type="button"
            className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            <Save className="w-3.5 h-3.5" />Lưu ngay
          </button>
        </div>
      )}
    </fieldset>
  );
}
