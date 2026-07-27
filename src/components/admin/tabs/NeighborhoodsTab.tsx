import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, ArrowDown, MapPin, RefreshCw, CheckCircle } from 'lucide-react';
import type { Neighborhood, Ward, PageBlock } from '../../../lib/supabase';
import {
  getNeighborhoods, adminCreateNeighborhood, adminUpdateNeighborhood, adminDeleteNeighborhood,
  getWards, adminGetPageBlocks, adminSavePageBlock, adminDeletePageBlock, adminRefreshPriceStats,
  adminEnsureManagedPage,
} from '../../../lib/api';
import { PublicUrlPreview } from '../shared/PublicUrlPreview';
import { RichTextEditor } from '../shared/RichTextEditor';
import { ImageUrlInput } from '../../ImageUpload';
import { buildSlug, buildUniqueSlug } from '../../../lib/slug';

// page_blocks namespace cho khu dân cư — khớp app/khu-dan-cu/[slug]/page.tsx.
function blockSlug(slug: string): string { return `khu-dan-cu:${slug}`; }

// Trình soạn nội dung pillar (1 khối HTML) + FAQ (cặp hỏi/đáp). Nội dung do admin
// viết — không bịa. HTML nên dùng H2 ngữ nghĩa (Vị trí, Tiện ích, Hạ tầng, Pháp lý,
// Tiềm năng…) để tốt cho AIO.
function NeighborhoodContentEditor({ n, onBack }: { n: Neighborhood; onBack: () => void }) {
  const slug = blockSlug(n.slug);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [savingBody, setSavingBody] = useState(false);
  const [savedBody, setSavedBody] = useState(false);

  const load = () => adminGetPageBlocks(slug).then(b => {
    setBlocks(b);
    const bb = b.find(x => x.section === 'body' && x.key === 'content') ?? null;
    setBody(bb?.value ?? '');
    setLoading(false);
  });
  useEffect(() => { load(); }, [n.slug]);

  const faqBlocks = blocks.filter(b => b.section === 'faq');

  const saveBody = async () => {
    setSavingBody(true);
    try {
      // page_blocks.page_slug có FK tới managed_pages(slug) — tạo trang chứa ẩn trước.
      await adminEnsureManagedPage(slug, `Khu dân cư ${n.name}`);
      await adminSavePageBlock({ page_slug: slug, section: 'body', key: 'content', label: 'Nội dung khu dân cư', type: 'html', value: body, order_index: 0 });
      setSavedBody(true); setTimeout(() => setSavedBody(false), 2000);
    } catch (e) { alert((e as Error).message); }
    setSavingBody(false);
    load();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"><ArrowDown className="w-4 h-4 rotate-90" /></button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-gray-900">Khu dân cư {n.name}</h2>
          <p className="text-gray-500 text-xs">Soạn nội dung pillar (Vị trí, Tiện ích, Hạ tầng, Pháp lý, Tiềm năng…) và FAQ.</p>
          <PublicUrlPreview path={`/khu-dan-cu/${n.slug}`} />
        </div>
      </div>

      <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><div className="w-1 h-5 bg-red-600 rounded-full" /><h3 className="font-bold text-gray-700 text-sm">Nội dung chính (HTML)</h3></div>
          <button onClick={saveBody} disabled={savingBody}
            className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${savedBody ? 'bg-emerald-100 text-emerald-700' : 'bg-red-600 text-white hover:bg-red-700'}`}>
            {savingBody ? <div className="w-3 h-3 border border-white/50 border-t-white rounded-full animate-spin" /> : savedBody ? <CheckCircle className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            {savedBody ? 'Đã lưu' : 'Lưu nội dung'}
          </button>
        </div>
        <RichTextEditor value={body} onChange={setBody} placeholder="Dùng H2 cho từng mục: Vị trí, Tiện ích, Hạ tầng, Pháp lý, Tiềm năng…" />
      </div>

      <FaqEditor pageSlug={slug} pageTitle={`Khu dân cư ${n.name}`} faqBlocks={faqBlocks} onChanged={load} />
    </div>
  );
}

function FaqEditor({ pageSlug, pageTitle, faqBlocks, onChanged }: { pageSlug: string; pageTitle: string; faqBlocks: PageBlock[]; onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!q.trim() || !a.trim()) return;
    setSaving(true);
    try {
      // page_blocks.page_slug có FK tới managed_pages(slug) — tạo trang chứa ẩn trước.
      await adminEnsureManagedPage(pageSlug, pageTitle);
      await adminSavePageBlock({ page_slug: pageSlug, section: 'faq', key: `q${Date.now()}`, label: q.trim(), type: 'textarea', value: a.trim(), order_index: faqBlocks.length });
      setQ(''); setA(''); onChanged();
    } catch (e) { alert((e as Error).message); }
    setSaving(false);
  };

  return (
    <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2"><div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="font-bold text-gray-700 text-sm">Câu hỏi thường gặp (FAQ)</h3></div>
      {faqBlocks.map(b => (
        <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-sm font-bold text-gray-800">{b.label}</p><p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{b.value}</p></div>
          <button onClick={async () => { if (!confirm('Xóa câu hỏi này?')) return; await adminDeletePageBlock(b.id); onChanged(); }}
            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <div className="space-y-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Câu hỏi (vd: KDC X có sổ hồng riêng không?)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <textarea value={a} onChange={e => setA(e.target.value)} rows={2} placeholder="Trả lời trực tiếp, dựa trên dữ liệu thật."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
        <button onClick={add} disabled={saving || !q.trim() || !a.trim()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" />Thêm FAQ
        </button>
      </div>
    </div>
  );
}

const EMPTY = { name: '', slug: '', ward_id: '', description: '', image_url: '', meta_title: '', meta_description: '', focus_keywords: '' };

export function NeighborhoodsTab() {
  const [items, setItems] = useState<Neighborhood[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Neighborhood | null>(null);
  const [editing, setEditing] = useState<Neighborhood | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => Promise.all([getNeighborhoods(), getWards()]).then(([n, w]) => { setItems(n); setWards(w); setLoading(false); });
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ ...EMPTY }); setSlugTouched(false); setEditing(null); setCreating(true); };
  const openEdit = (n: Neighborhood) => {
    setForm({
      name: n.name, slug: n.slug, ward_id: n.ward_id ?? '', description: n.description ?? '',
      image_url: n.image_url ?? '', meta_title: n.meta_title ?? '', meta_description: n.meta_description ?? '', focus_keywords: n.focus_keywords ?? '',
    });
    setSlugTouched(true); // đang sửa khu có sẵn → giữ slug, không auto-đè theo tên
    setEditing(n); setCreating(true);
  };

  // Slug preview: khi tạo mới + chưa chạm ô slug → bám theo tên; else dùng slug đang gõ.
  const previewSlug = form.slug.trim()
    ? buildSlug(form.slug)
    : (form.name.trim() ? buildSlug(form.name) : '');

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const slug = form.slug.trim() ? buildSlug(form.slug) : buildUniqueSlug(form.name);
      const payload = {
        name: form.name.trim(), slug,
        ward_id: form.ward_id || null, description: form.description.trim() || null,
        image_url: form.image_url.trim() || null, order_index: editing?.order_index ?? items.length,
        meta_title: form.meta_title.trim() || null, meta_description: form.meta_description.trim() || null,
        focus_keywords: form.focus_keywords.trim() || null, schema_markup: null,
      };
      if (editing) await adminUpdateNeighborhood(editing.id, payload, editing.slug);
      else await adminCreateNeighborhood(payload);
      await load();
      setCreating(false); setEditing(null);
    } catch (e) { alert((e as Error).message); }
    setSaving(false);
  };

  const refreshPrices = async () => {
    setRefreshing(true);
    try {
      const count = await adminRefreshPriceStats();
      alert(`Đã làm mới dữ liệu giá: ${count} nhóm đủ mẫu (>=3 tin).`);
    } catch (e) { alert((e as Error).message); }
    setRefreshing(false);
  };

  if (selected) return <NeighborhoodContentEditor n={selected} onBack={() => { setSelected(null); load(); }} />;
  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2"><MapPin className="w-5 h-5 text-red-600" />Khu dân cư (Entity Page)</h2>
          <p className="text-gray-500 text-sm mt-1">Trang pillar SEO/GEO/AIO cho từng khu dân cư — tổng quan, giá nhà đất, tin đăng, FAQ.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={refreshPrices} disabled={refreshing}
            className="flex items-center gap-2 border border-gray-200 hover:border-red-300 text-gray-700 hover:text-red-600 text-sm font-bold px-3 py-2.5 rounded-xl transition-colors disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />Làm mới dữ liệu giá
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
            <Plus className="w-4 h-4" />Khu dân cư mới
          </button>
        </div>
      </div>

      {creating && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-blue-800 text-sm">{editing ? 'Sửa khu dân cư' : 'Tạo khu dân cư'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tên *</label>
              <input value={form.name}
                onChange={e => {
                  const name = e.target.value;
                  // Chưa chạm ô slug → URL tự bám theo tên (bỏ dấu). Chạm rồi → giữ nguyên.
                  setForm(f => ({ ...f, name, slug: slugTouched ? f.slug : buildSlug(name) }));
                }}
                placeholder="Phú Hồng Thịnh 8"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Slug (URL)</label>
              <input value={form.slug}
                onChange={e => { setSlugTouched(true); setForm(f => ({ ...f, slug: buildSlug(e.target.value) })); }}
                placeholder={form.name.trim() ? buildSlug(form.name) : 'phu-hong-thinh-8'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          {previewSlug && <PublicUrlPreview path={`/khu-dan-cu/${previewSlug}`} />}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Phường/Xã</label>
              <select value={form.ward_id} onChange={e => setForm(f => ({ ...f, ward_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                <option value="">— Chọn phường/xã —</option>
                {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Ảnh đại diện</label>
              <ImageUrlInput value={form.image_url} onChange={url => setForm(f => ({ ...f, image_url: url }))}
                placeholder="Tải ảnh lên hoặc chọn từ thư viện" folder="neighborhoods" isAdmin />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Mô tả (tóm tắt tổng quan — hiển thị đầu trang)</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Meta title (SEO)</label>
              <input value={form.meta_title} onChange={e => setForm(f => ({ ...f, meta_title: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Focus keywords</label>
              <input value={form.focus_keywords} onChange={e => setForm(f => ({ ...f, focus_keywords: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Meta description (SEO)</label>
            <textarea value={form.meta_description} onChange={e => setForm(f => ({ ...f, meta_description: e.target.value }))} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.name.trim()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40">
              <Save className="w-3.5 h-3.5" />{saving ? 'Đang lưu...' : 'Lưu'}
            </button>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Hủy</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">Chưa có khu dân cư nào. Bấm "Khu dân cư mới" để tạo trang pillar đầu tiên.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(n => (
            <div key={n.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
              {n.image_url && <img src={n.image_url} alt="" className="w-14 h-10 object-cover rounded-lg flex-shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />}
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-gray-900 text-sm">{n.name}</span>
                {n.description && <p className="text-gray-400 text-xs mt-0.5 truncate">{n.description}</p>}
                <p className="text-gray-400 text-[10px] mt-0.5">/khu-dan-cu/{n.slug}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setSelected(n)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors">
                  <Edit2 className="w-3 h-3" />Soạn nội dung
                </button>
                <button onClick={() => openEdit(n)} className="text-xs font-semibold px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">Thông tin</button>
                <button onClick={async () => { if (!confirm(`Xóa khu dân cư "${n.name}"?`)) return; await adminDeleteNeighborhood(n.id); setItems(prev => prev.filter(x => x.id !== n.id)); }}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
