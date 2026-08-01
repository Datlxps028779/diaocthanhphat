import { useEffect, useState } from 'react';
import { CheckCircle, Eye, Home, Image as ImageIcon, Save, Search } from 'lucide-react';
import type { PageSection } from '../../../lib/supabase';
import { adminSavePageLayout, getPageLayout } from '../../../lib/api';
import { ImageUrlInput } from '../../ImageUpload';

export function HomeExperienceTab() {
  const [hero, setHero] = useState<PageSection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPageLayout()
      .then(sections => setHero(sections.find(section => section.id === 'hero') ?? null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-16 text-center text-sm text-gray-400">Đang tải cấu hình trang chủ...</div>;
  }

  if (!hero) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Chưa có section Hero trong Page Builder. Hãy thêm/cấu hình Hero tại Bố cục trang trước.</div>;
  }

  const settings = hero.settings as Record<string, unknown>;
  const get = (key: string, fallback = '') => typeof settings[key] === 'string' ? settings[key] as string : fallback;
  const set = (key: string, value: string) => setHero(current => current ? { ...current, settings: { ...current.settings, [key]: value } } : current);

  const save = async () => {
    if (!hero) return;
    setSaving(true);
    try {
      await adminSavePageLayout([{ id: hero.id, is_visible: hero.is_visible, order_index: hero.order_index, settings: hero.settings }]);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, setting, placeholder = '', multiline = false }: { label: string; setting: string; placeholder?: string; multiline?: boolean }) => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
      {multiline ? (
        <textarea value={get(setting)} onChange={event => set(setting, event.target.value)} placeholder={placeholder} rows={3}
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
      ) : (
        <input value={get(setting)} onChange={event => set(setting, event.target.value)} placeholder={placeholder}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-start">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><Home className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Trải nghiệm trang chủ</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Điều chỉnh phần hero và các điểm khám phá chủ đạo. Bố cục, thứ tự, nguồn dữ liệu và cách xử lý thiếu dữ liệu vẫn quản lý trong Bố cục trang.</p>
          </div>
        </div>
        <button onClick={save} disabled={saving}
          className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60">
          {saving ? 'Đang lưu...' : saved ? <><CheckCircle className="h-4 w-4" />Đã lưu</> : <><Save className="h-4 w-4" />Lưu hero</>}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-red-600" /><h3 className="text-sm font-bold text-slate-800">Hero & thông điệp</h3></div>
          <Field label="Nhãn định vị" setting="hero_label" placeholder="Ví dụ: Tập trung khu vực Bình Dương" />
          <Field label="Tiêu đề chính" setting="title" placeholder="Tìm kiếm bất động sản phù hợp" />
          <Field label="Mô tả phụ" setting="subtitle" placeholder="Mô tả ngắn dựa trên giá trị thực của nền tảng" multiline />
          <ImageUrlInput value={get('bg_image')} onChange={url => set('bg_image', url)} folder="hero" isAdmin placeholder="Ảnh hero từ thư viện ảnh" />
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2"><Search className="h-4 w-4 text-red-600" /><h3 className="text-sm font-bold text-slate-800">Tìm kiếm hero</h3></div>
          <Field label="Placeholder tìm kiếm" setting="search_placeholder" placeholder="Tìm theo tên dự án, địa chỉ, khu vực..." />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tab mua bán" setting="tab_buy" placeholder="Mua bán" />
            <Field label="Tab cho thuê" setting="tab_rent" placeholder="Cho thuê" />
          </div>
          <Field label="Nút tìm kiếm" setting="btn_search" placeholder="Tìm kiếm" />
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">Slider/ảnh banner được quản lý trong tab <strong className="text-slate-700">Banners</strong>. Search tiếp tục dùng taxonomy, URL filter và logic tìm kiếm hiện có.</div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        <Eye className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>Thay đổi này chỉ lưu vào settings của Hero. Chúng không tạo dữ liệu giả, không đổi URL, không thay logic sản phẩm và có thể xem trước trên preview trước khi publish.</span>
      </div>
    </div>
  );
}
