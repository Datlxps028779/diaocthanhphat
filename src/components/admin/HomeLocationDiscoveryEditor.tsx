import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { Area } from '../../lib/supabase';
import { MAX_HOME_LOCATIONS, readLocationDiscovery, saveLocationDiscovery, type HomeLocationItem } from '../../lib/homeLocationDiscovery';
import { ImageUrlInput } from '../ImageUpload';

export function HomeLocationDiscoveryEditor({ settings, areas, onChange }: { settings: Record<string, unknown>; areas: Area[]; onChange: (value: Record<string, unknown>) => void }) {
  const parsed = readLocationDiscovery(settings, areas);
  const items = settings.version === 2 && Array.isArray(settings.items)
    ? settings.items.filter((item): item is HomeLocationItem => !!item && typeof item === 'object' && typeof item.id === 'string' && typeof item.area_id === 'string' && typeof item.image_url === 'string' && typeof item.subtitle === 'string' && typeof item.enabled === 'boolean')
    : parsed.items;
  const issues = parsed.issues;
  const change = (next: HomeLocationItem[]) => onChange(saveLocationDiscovery(settings, next));
  const update = (id: string, patch: Partial<HomeLocationItem>) => change(items.map(item => item.id === id ? { ...item, ...patch } : item));
  const move = (index: number, delta: number) => {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    change(next);
  };
  const unused = areas.filter(area => !items.some(item => item.area_id === area.id));
  return <div className="space-y-4" data-testid="home-location-editor">
    <p className="text-xs leading-5 text-slate-500">Chọn tỉnh thật cho hàng thẻ nổi bật. Các tab bên dưới lấy toàn bộ địa phương trong hệ thống; chọn tab để xem quận / huyện. Ẩn hoặc xóa thẻ chỉ bỏ thẻ nổi bật, không xóa tab, dữ liệu khu vực hoặc tin đăng. Khi không còn thẻ hiển thị, cả khối tuân theo cấu hình rỗng đã chọn.</p>
    {!!issues.length && <div role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{issues.join(' ')} Hãy sửa hoặc bỏ thẻ lỗi trước khi lưu. Các mục sai cấu trúc không thể hiển thị trong editor và sẽ bị loại khi chỉnh danh sách.</div>}
    <label className="block text-sm font-medium text-slate-700">Tiêu đề khối<input value={typeof settings.title === 'string' ? settings.title : ''} maxLength={120} placeholder="Khám phá bất động sản theo vị trí" onChange={event => onChange({ ...settings, title: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
    {items.map((item, index) => <div key={item.id} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold text-slate-700">Thẻ tỉnh #{index + 1}</span><div className="flex gap-1">
        <button type="button" aria-label={`Đưa thẻ ${index + 1} lên`} disabled={index === 0} onClick={() => move(index, -1)} className="rounded p-2 hover:bg-white disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
        <button type="button" aria-label={`Đưa thẻ ${index + 1} xuống`} disabled={index === items.length - 1} onClick={() => move(index, 1)} className="rounded p-2 hover:bg-white disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
        <button type="button" aria-label={`Xóa thẻ ${index + 1}`} onClick={() => { if (window.confirm('Bỏ thẻ tỉnh này khỏi trang chủ? Dữ liệu tỉnh và tin đăng vẫn được giữ.')) change(items.filter(value => value.id !== item.id)); }} className="rounded p-2 text-red-600 hover:bg-white"><Trash2 className="h-4 w-4" /></button>
      </div></div>
      <label className="block text-xs font-semibold text-slate-600">Tỉnh / thành phố<select value={item.area_id} onChange={event => update(item.id, { area_id: event.target.value, image_url: '', subtitle: '' })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{areas.filter(area => area.id === item.area_id || unused.some(value => value.id === area.id)).map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
      <label className="block text-xs font-semibold text-slate-600">Mô tả ngắn<input value={item.subtitle} maxLength={200} onChange={event => update(item.id, { subtitle: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <ImageUrlInput value={item.image_url} onChange={image_url => update(item.id, { image_url })} folder="regions" isAdmin placeholder="Chọn ảnh (để trống dùng ảnh khu vực)" />
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={item.enabled} onChange={event => update(item.id, { enabled: event.target.checked })} />Hiển thị thẻ tỉnh</label>
    </div>)}
    {!items.length && <p className="text-sm text-slate-500">Chưa chọn tỉnh. Danh sách để trống sẽ không tự thêm lại thẻ mặc định.</p>}
    <button type="button" disabled={!unused.length || items.length >= MAX_HOME_LOCATIONS} onClick={() => { const area = unused[0]; if (area) change([...items, { id: crypto.randomUUID(), area_id: area.id, image_url: '', subtitle: '', enabled: true }]); }} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"><Plus className="h-4 w-4" />Thêm tỉnh / thành phố</button>
  </div>;
}
