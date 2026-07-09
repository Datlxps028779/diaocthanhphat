import { useState, useEffect } from 'react';
import { Eye, Plus, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react';
import type { NewsArticle } from '../../../lib/supabase';
import { adminGetAllNews, createNews, updateNews, deleteNews, bulkUpdateNews, bulkDeleteNews } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { SimpleForm } from '../shared/SimpleForm';

// ─── News Tab ─────────────────────────────────────────────────────────────────
export function NewsTab() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<NewsArticle | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const CATEGORIES = ['Thị trường', 'Hạ tầng', 'Đầu tư', 'Hướng dẫn', 'Tài chính', 'Quy hoạch'];

  const load = async () => { setLoading(true); const d = await adminGetAllNews(); setArticles(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  // ─── Bulk helpers ─────────────────────────────────────────────────────────
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

  const a = editing;
  if (creating || editing) {
    return (
      <SimpleForm
        title={a ? 'Sửa bài viết' : 'Viết bài mới'}
        fields={[
          { name: 'title', label: 'Tiêu đề *', value: a?.title ?? '', required: true },
          { name: 'slug', label: 'Slug URL (để trống sẽ tự sinh từ tiêu đề)', value: a?.slug ?? '' },
          { name: 'category', label: 'Danh mục', value: a?.category ?? 'Thị trường', type: 'select', options: CATEGORIES },
          { name: 'author', label: 'Tác giả', value: a?.author ?? 'Ban biên tập' },
          { name: 'image_url', label: 'URL ảnh bìa', value: a?.image_url ?? '' },
          { name: 'excerpt', label: 'Tóm tắt', value: a?.excerpt ?? '', type: 'textarea' },
          { name: 'content', label: 'Nội dung đầy đủ', value: a?.content ?? '', type: 'textarea', rows: 8 },
        ]}
        onSave={async (data) => {
          const payload = { ...data, is_published: true };
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
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {a.is_published ? 'Đã đăng' : 'Nháp'}
                        </span>
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
