import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Eye, Home, Image as ImageIcon, Loader2, MapPinned, RotateCcw, Save, Search, Tags } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Area, PageSection, PropertyType } from '../../../lib/supabase';
import { adminSavePageLayout, getPageLayout, AdminPageLayoutError, type AdminPageSectionInput } from '../../../lib/api';
import { getAreas, getPropertyTypes } from '../../../lib/api/taxonomy';
import { readLocationDiscovery, validateLocationItems, type HomeLocationItem } from '../../../lib/homeLocationDiscovery';
import { qk } from '../../../lib/queryKeys';
import { HomeLocationDiscoveryEditor } from '../HomeLocationDiscoveryEditor';
import { ImageUrlInput } from '../../ImageUpload';

type SectionId = 'hero' | 'categories' | 'region_banners';

const EDITABLE_SECTION_IDS: SectionId[] = ['hero', 'categories', 'region_banners'];

const CATEGORY_DEFAULTS = ['Nhà ở', 'Căn hộ', 'Đất nền', 'Đất nông nghiệp', 'Biệt thự', 'Văn phòng'];

type LoadState = 'loading' | 'ready' | 'error';

function Field({ id, label, value, onChange, placeholder = '', multiline = false, invalid = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  placeholder?: string; multiline?: boolean; invalid?: boolean;
}) {
  const inputClass = `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${invalid ? 'border-red-300 focus:ring-red-400' : 'border-gray-200 focus:ring-red-400'}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
      {multiline ? (
        <textarea id={id} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} rows={3}
          aria-invalid={invalid} className={`${inputClass} resize-none`} />
      ) : (
        <input id={id} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}
          aria-invalid={invalid} className={inputClass} />
      )}
    </div>
  );
}

function Select({ id, label, value, onChange, children, disabled = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
      <select id={id} value={value} onChange={event => onChange(event.target.value)} disabled={disabled}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-60">
        {children}
      </select>
    </div>
  );
}

function sameSettings(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
  }
  return true;
}

// Validate cả bản nháp chưa hợp lệ mà public reader đã loại khỏi danh sách.
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

export function HomeExperienceTab() {
  const queryClient = useQueryClient();
  const [sections, setSections] = useState<PageSection[]>([]);
  // baseline = dòng đã lưu gần nhất, dùng để phát hiện dirty và làm expected_updated_at.
  const [baseline, setBaseline] = useState<PageSection[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [areasFailed, setAreasFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // needsReload: lỗi stale / partial → bắt buộc tải lại trước khi lưu tiếp.
  const [needsReload, setNeedsReload] = useState(false);
  const savedTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    setAreasFailed(false);
    // Clear error khi người dùng chủ động tải lại (đồng ý bỏ draft cũ).
    setError(null);
    setNeedsReload(false);
    try {
      const [layout, nextAreas, types] = await Promise.all([
        getPageLayout(),
        getAreas().catch(() => { setAreasFailed(true); return [] as Area[]; }),
        getPropertyTypes().catch(() => [] as PropertyType[]),
      ]);
      setSections(layout);
      setBaseline(layout);
      setAreas(nextAreas);
      setPropertyTypes(types);
      setLoadState('ready');
    } catch (e) {
      setAreasFailed(true);
      setLoadState('error');
      setError(`Không tải được cấu hình trang chủ: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => () => { if (savedTimer.current) window.clearTimeout(savedTimer.current); }, []);

  const hero = sections.find(section => section.id === 'hero') ?? null;
  const categories = sections.find(section => section.id === 'categories') ?? null;
  const regions = sections.find(section => section.id === 'region_banners') ?? null;

  const baselineOf = (id: SectionId) => baseline.find(section => section.id === id) ?? null;
  const settingsOf = (section: PageSection | null) => (section?.settings ?? {}) as Record<string, unknown>;
  const get = (section: PageSection | null, key: string, fallback = '') => {
    const value = settingsOf(section)[key];
    return typeof value === 'string' ? value : fallback;
  };

  const set = useCallback((sectionId: SectionId, key: string, value: string) => {
    setSections(current => current.map(section =>
      section.id === sectionId ? { ...section, settings: { ...section.settings, [key]: value } } : section));
    setSaved(false);
  }, []);

  const setSectionSettings = useCallback((sectionId: SectionId, settings: Record<string, unknown>) => {
    setSections(current => current.map(section => section.id === sectionId ? { ...section, settings } : section));
    setSaved(false);
  }, []);

  // Chỉ những section có settings khác baseline mới là dirty.
  const dirtyIds = useMemo(() => {
    const result: SectionId[] = [];
    for (const id of EDITABLE_SECTION_IDS) {
      const current = sections.find(section => section.id === id);
      const base = baselineOf(id);
      if (!current || !base) continue;
      if (!sameSettings(settingsOf(current), settingsOf(base))) result.push(id);
    }
    return result;
  }, [sections, baseline]);

  const isDirty = dirtyIds.length > 0;

  // Khu vực: đọc bằng shared reader để bắt lỗi cấu hình sai định dạng.
  const location = useMemo(() => readLocationDiscovery(settingsOf(regions), areas), [regions, areas]);

  const regionIssues = useMemo(() => {
    if (!regions) return [] as string[];
    if (!dirtyIds.includes('region_banners')) return [] as string[];
    // Validate trên thẻ THÔ: một thẻ đang gõ với image_url chưa hợp lệ vẫn phải
    // bị bắt lỗi (readLocationDiscovery đã lọc nó khỏi items nên không thể dựa
    // vào đó). Ghép cả issues của parser để không bỏ sót cảnh báo.
    const raw = rawLocationItems(settingsOf(regions), areas);
    return [...new Set([...location.issues, ...raw.issues, ...validateLocationItems(raw.items, areas)])];
  }, [regions, dirtyIds, location, areas]);

  const hiddenEditable = useMemo(
    () => EDITABLE_SECTION_IDS.map(id => sections.find(section => section.id === id)).filter((s): s is PageSection => !!s && !s.is_visible),
    [sections],
  );

  const regionDirty = dirtyIds.includes('region_banners');
  // Không tải được khu vực thì chỉ chặn lưu khi đang sửa chính khối khu vực —
  // sửa hero/danh mục vẫn lưu được bình thường.
  const areasBlockSave = areasFailed && regionDirty;
  const canSave = loadState === 'ready' && !areasBlockSave && isDirty && !saving && !needsReload && regionIssues.length === 0;

  const save = async () => {
    if (!canSave) return;
    setError(null);
    setSaved(false);

    // Chỉ gửi dòng dirty + CHỈ field settings (không đụng order/visibility).
    const patches: AdminPageSectionInput[] = dirtyIds.flatMap(id => {
      const current = sections.find(section => section.id === id);
      const base = baselineOf(id);
      if (!current || !base) return [];
      return [{ id, settings: settingsOf(current), expected_updated_at: base.updated_at }];
    });
    if (!patches.length) return;

    setSaving(true);
    try {
      // API trả về CHỈ các hàng vừa ghi (bản ghi tươi). Ghép vào baseline hiện có
      // để không rút gọn baseline chỉ còn các hàng đó.
      const savedRows = await adminSavePageLayout(patches);
      const byId = new Map(savedRows.map(row => [row.id, row]));
      setBaseline(current => current.map(row => byId.get(row.id) ?? row));
      setSections(current => current.map(row => byId.get(row.id) ?? row));
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: qk.pageLayout() });
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Lỗi không xác định';
      if (e instanceof AdminPageLayoutError && e.persistedIds.length) {
        void queryClient.invalidateQueries({ queryKey: qk.pageLayout() });
      }
      setError(`${detail} Bản nháp vẫn được giữ — bấm "Tải lại" để đồng bộ trước khi lưu tiếp.`);
      setNeedsReload(true);
    } finally {
      setSaving(false);
    }
  };

  if (loadState === 'loading') {
    return <div className="py-16 text-center text-sm text-gray-400" role="status">Đang tải cấu hình trang chủ...</div>;
  }

  if (loadState === 'error') {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <div role="alert" className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error ?? 'Không tải được cấu hình trang chủ.'}</span>
        </div>
        <button type="button" onClick={() => void load()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100">
          <RotateCcw className="h-4 w-4" />Thử lại
        </button>
      </div>
    );
  }

  if (!hero) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Chưa có section Hero trong Page Builder. Hãy thêm/cấu hình Hero tại Bố cục trang trước.</div>;
  }

  const heroId = (key: string) => `home-hero-${key}`;

  return (
    <fieldset disabled={saving} className="mx-auto min-w-0 max-w-5xl space-y-5">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-start">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><Home className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Trải nghiệm trang chủ</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Điều chỉnh hero, danh mục nhanh và thẻ khu vực. Bố cục, bật/tắt và empty-state vẫn quản lý trong Bố cục trang.</p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {needsReload && (
            <button type="button" onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-50">
              <RotateCcw className="h-4 w-4" />Tải lại
            </button>
          )}
          <button onClick={save} disabled={!canSave}
            className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Đang lưu...</>
              : saved ? <><CheckCircle className="h-4 w-4" />Đã lưu</>
              : <><Save className="h-4 w-4" />Lưu trang chủ</>}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {areasFailed && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>Không tải được danh sách khu vực{regionDirty ? ' — chưa thể lưu thay đổi ở khối "Thẻ khu vực". Bấm "Tải lại" để thử lại.' : '. Các khối khác vẫn lưu được bình thường.'}</span>
          <button type="button" onClick={() => void load()} className="shrink-0 font-bold underline">Tải lại</button>
        </div>
      )}

      {hiddenEditable.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          <Eye className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
          <span>Có {hiddenEditable.length} section đang bị ẩn và sẽ không hiển thị công khai: <strong className="text-slate-700">{hiddenEditable.map(section => section.label).join(', ')}</strong>. Bật/tắt tại tab <strong className="text-slate-700">Bố cục trang</strong>; chỉnh nội dung ở đây không tự bật lại section.</span>
        </div>
      )}

      {regionIssues.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Cấu hình khu vực chưa hợp lệ nên chưa thể lưu: {regionIssues.join(' ')}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-red-600" /><h3 className="text-sm font-bold text-slate-800">Hero & thông điệp</h3></div>
          <Field id={heroId('hero_label')} label="Nhãn định vị" value={get(hero, 'hero_label')} onChange={value => set('hero', 'hero_label', value)} placeholder="Ví dụ: Tập trung khu vực Bình Dương" />
          <Field id={heroId('title')} label="Tiêu đề chính" value={get(hero, 'title')} onChange={value => set('hero', 'title', value)} placeholder="Tìm kiếm bất động sản phù hợp" />
          <Field id={heroId('subtitle')} label="Mô tả phụ" value={get(hero, 'subtitle')} onChange={value => set('hero', 'subtitle', value)} placeholder="Mô tả ngắn dựa trên giá trị thực của nền tảng" multiline />
          <ImageUrlInput value={get(hero, 'bg_image')} onChange={url => set('hero', 'bg_image', url)} folder="hero" isAdmin placeholder="Ảnh hero từ thư viện ảnh" />
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2"><Search className="h-4 w-4 text-red-600" /><h3 className="text-sm font-bold text-slate-800">Tìm kiếm hero</h3></div>
          <Field id={heroId('search_placeholder')} label="Placeholder tìm kiếm" value={get(hero, 'search_placeholder')} onChange={value => set('hero', 'search_placeholder', value)} placeholder="Tìm theo tên dự án, địa chỉ, khu vực..." />
          <div className="grid grid-cols-2 gap-3">
            <Field id={heroId('tab_buy')} label="Tab mua bán" value={get(hero, 'tab_buy')} onChange={value => set('hero', 'tab_buy', value)} placeholder="Mua bán" />
            <Field id={heroId('tab_rent')} label="Tab cho thuê" value={get(hero, 'tab_rent')} onChange={value => set('hero', 'tab_rent', value)} placeholder="Cho thuê" />
          </div>
          <Field id={heroId('btn_search')} label="Nút tìm kiếm" value={get(hero, 'btn_search')} onChange={value => set('hero', 'btn_search', value)} placeholder="Tìm kiếm" />
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
            {CATEGORY_DEFAULTS.map((label, index) => {
              const n = index + 1;
              return (
                <div key={n} className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <Field id={`home-cat-${n}-label`} label={`Nhãn ô #${n}`} value={get(categories, `cat${n}_label`)} onChange={value => set('categories', `cat${n}_label`, value)} placeholder={label} />
                  <Select id={`home-cat-${n}-type`} label="Loại BĐS lọc sẵn" value={get(categories, `cat${n}_type`)} onChange={value => set('categories', `cat${n}_type`, value)}>
                    <option value="">Không lọc theo loại</option>
                    {propertyTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {regions && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2"><MapPinned className="h-4 w-4 text-red-600" /><h3 className="text-sm font-bold text-slate-800">Thẻ khu vực</h3></div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
              {areas.length ? `${location.items.length}/${areas.length} tỉnh trong hệ thống` : 'Chưa tải được khu vực'}
            </span>
          </div>
          <HomeLocationDiscoveryEditor settings={settingsOf(regions)} areas={areas} onChange={next => setSectionSettings('region_banners', next)} />
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        <Eye className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>Tab này chỉ lưu settings cho các section hiện có. Không tạo dữ liệu giả, không đổi URL, không thay logic sản phẩm; thẻ khu vực public chỉ hiện khi khớp khu vực thật.</span>
      </div>
    </fieldset>
  );
}
