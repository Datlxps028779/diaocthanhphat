import { useState, useEffect } from 'react';
import { Eye, Plus, Edit2, Trash2, CheckCircle, XCircle, Save, X } from 'lucide-react';
import type { NewsArticle } from '../../../lib/supabase';
import { adminGetAllNews, createNews, updateNews, deleteNews, bulkUpdateNews, bulkDeleteNews } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { SeoFields, parseSeoSchema, type SeoFieldsValue } from '../shared/SeoFields';

const CATEGORIES = ['Thị trường', 'Hạ tầng', 'Đầu tư', 'Hướng dẫn', 'Tài chính', 'Quy hoạch'];

type NewsFormState = SeoFieldsValue & {
  title: string;
  slug: string;
  category: string;
  author: string;
  image_url: string;
  excerpt: string;
  content: string;
  is_published: boolean;
};

function initialForm(article: NewsArticle | null): NewsFormState {
  return {
    title: article?.title ?? '',
    slug: article?.slug ?? '',
    category: article?.category ?? 'Thị trường',
    author: article?.author ?? 'Ban biên tập',
    image_url: article?.image_url ?? '',
    excerpt: article?.excerpt ?? '',
    content: article?.content ?? '',
    is_published: article?.is_published ?? true,
    meta_title: article?.meta_title ?? '',
    meta_description: article?.meta_description ?? '',
    focus_keywords: article?.focus_keywords ?? '',
    schema_markup: article?.schema_markup ? JSON.stringify(article.schema_markup, null, 2) : '',
  };
}

function NewsForm({ article, onSave, onCancel }: { article: NewsArticle | null; onSave: (payload: Partial<NewsArticle>) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<NewsFormState>(() => initialForm(article));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof NewsFormState, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));
  const setSeo = (value: SeoFieldsValue) => setForm(f => ({ ...f, ...value }));

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Vui lòng nhập tiêu đề bài viết.'); return; }
    const schema = parseSeoSchema(form.schema_markup, 'news');
    if (schema.error) { setError(schema.error); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        title: form.title.trim(),
        slug: form.slug.trim(),
        category: form.category,
        author: form.author.trim() || 'Ban biên tập',
        image_url: form.image_url.trim() || null,
        excerpt: form.excerpt.trim() || null,
        content: form.content.trim() || null,
        is_published: form.is_published,
        meta_title: form.meta_title.trim() || null,
        meta_description: form.meta_description.trim() || null,
        focus_keywords: form.focus_keywords.trim() || null,
        schema_markup: schema.schema,
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-5xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-6 py-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{article ? 'Sửa bài viết' : 'Viết bài mới'}</h2>
          <p className="mt-0.5 text-xs text-gray-400">Tối ưu metadata, schema NewsArticle và trạng thái index.</p>
        </div>
        <button onClick={onCancel}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4 p-6">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Tiêu đề *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Slug URL</label>
              <input value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="Để trống sẽ tự sinh"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Danh mục</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Tác giả</label>
              <input value={form.author} onChange={e => set('author', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">URL ảnh bìa</label>
              <input value={form.image_url} onChange={e => set('image_url', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Tóm tắt</label>
            <textarea value={form.excerpt} onChange={e => set('excerpt', e.target.value)} rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Nội dung đầy đủ</label>
            <textarea value={form.content} onChange={e => set('content', e.target.value)} rows={10}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <input type="checkbox" checked={form.is_published} onChange={e => set('is_published', e.target.checked)} className="accent-red-600" />
            Đăng công khai
          </label>
        </div>

        <aside className="border-l border-gray-100 bg-gray-50 p-5">
          <SeoFields value={form} onChange={setSeo} target="news" basePath={`/tin-tuc/${form.slug || 'slug'}`} />
        </aside>
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
        <button onClick={onCancel} className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50">Hủy</button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60">
          <Save className="h-4 w-4" />{saving ? 'Đang lưu...' : 'Lưu bài viết'}
        </button>
      </div>
    </div>
  );
}

export function NewsTab() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<NewsArticle | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const load = async () => { setLoading(true); const d = await adminGetAllNews(); setArticles(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allIds = articles.map(a => a.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allIds));
  const clearSelection = () => setSelected(new Set());
  const selectedIds = () => Array.from(selected);
  const runBulk = async (fn: () => Promise<number>, label: string) => {
    setBulkBusy(true);
    try {
      const n = await fn();
      clearSelection();
      await load();
      console.info(`[AdminPanel] Bulk ${label}: ${n} bài`);
    } catch (e) {
      console.error(`[AdminPanel] Bulk ${label} thất bại:`, e);
      alert(`Thao tác hàng loạt thất bại: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}`);
    } finally { setBulkBusy(false); }
  };

  if (creating || editing) {
    return (
      <NewsForm
        article={editing}
        onSave={async (payload) => {
          if (creating) await createNews(payload as Omit<NewsArticle, 'id' | 'created_at' | 'updated_at' | 'views'>);
          else if (editing) await updateNews(editing.id, payload);
          await load(); setEditing(null); setCreating(false);
        }}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />Viết bài mới
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-gray-900 text-white rounded-xl px-4 py-2.5 animate-fade-in">
          <span className="text-sm font-semibold mr-1">Đã chọn {selected.size}</span>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateNews(selectedIds(), { is_published: true }), 'đăng')}
            className="flex items-center gap-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <CheckCircle className="w-3.5 h-3.5" />Đăng
          </button>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateNews(selectedIds(), { is_published: false }), 'ẩn')}
            className="flex items-center gap-1 text-xs font-medium bg-gray-600 hover:bg-gray-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <XCircle className="w-3.5 h-3.5" />Chuyển nháp
          </button>
          <button disabled={bulkBusy} onClick={() => setConfirmBulkDelete(true)}
            className="flex items-center gap-1 text-xs font-medium bg-red-800 hover:bg-red-700 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />Xóa
          </button>
          <button onClick={clearSelection} className="ml-auto text-xs text-gray-300 hover:text-white transition-colors">Bỏ chọn</button>
        </div>
      )}

      {loading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    aria-label="Chọn tất cả" className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Tiêu đề</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 hidden md:table-cell">Danh mục</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 hidden lg:table-cell">Ngày đăng</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 hidden lg:table-cell">Lượt xem</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {articles.map(a => (
                <tr key={a.id} className={`transition-colors ${selected.has(a.id) ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)}
                      aria-label={`Chọn ${a.title}`} className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {a.image_url && <img src={a.image_url} alt="" className="w-12 h-9 object-cover rounded-lg flex-shrink-0" />}
                      <div>
                        <p className="font-medium text-gray-900 text-sm line-clamp-1 max-w-xs">{a.title}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {a.is_published ? 'Đã đăng' : 'Nháp'}
                          </span>
                          {(a.meta_title || a.meta_description || a.schema_markup) && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">SEO</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell"><span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded">{a.category}</span></td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">{new Date(a.created_at).toLocaleDateString('vi-VN')}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500 hidden lg:table-cell">
                    <span className="flex items-center justify-center gap-1"><Eye className="w-3 h-3" />{a.views}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setEditing(a)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={async () => { await updateNews(a.id, { is_published: !a.is_published }); await load(); }}
                        className={`p-1.5 rounded-lg transition-colors ${a.is_published ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                        {a.is_published ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => setConfirmDelete(a.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {articles.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Chưa có bài viết nào</div>}
        </div>
      )}
      {confirmDelete && <ConfirmDialog message="Xóa bài viết này?" onConfirm={async () => { await deleteNews(confirmDelete); setConfirmDelete(null); await load(); }} onCancel={() => setConfirmDelete(null)} />}
      {confirmBulkDelete && (
        <ConfirmDialog message={`Xóa ${selected.size} bài viết đã chọn? Thao tác không thể hoàn tác.`}
          onConfirm={() => { setConfirmBulkDelete(false); runBulk(() => bulkDeleteNews(selectedIds()), 'xóa'); }}
          onCancel={() => setConfirmBulkDelete(false)} />
      )}
    </div>
  );
}
