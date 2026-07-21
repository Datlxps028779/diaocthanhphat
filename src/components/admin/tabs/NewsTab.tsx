import { useState, useEffect, useRef } from 'react';
import { Eye, Plus, Edit2, Trash2, CheckCircle, XCircle, Save, X, Sparkles } from 'lucide-react';
import type { NewsArticle } from '../../../lib/supabase';
import { adminGetAllNews, createNews, updateNews, deleteNews, bulkUpdateNews, bulkDeleteNews } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ImageUrlInput } from '../../ImageUpload';
import { SeoFields, parseSeoSchema, type SeoFieldsValue } from '../shared/SeoFields';
import { AiSeoDraftPanel } from '../shared/AiSeoDraftPanel';
import { RichTextEditor } from '../shared/RichTextEditor';
import { isHtmlContent, markdownToHtml, stripHtml } from '../../../lib/markdown';
import { evaluateNewsReadiness, countInternalLinks, countImagesWithoutAlt, plainTextFromContent, countWords } from '../../../lib/contentReadiness';

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
  related_ids: string[];
  geo_area: string;
  geo_entity: string;
  geo_notes: string;
};

function newsSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function buildNewsSchema(form: Pick<NewsFormState, 'title' | 'excerpt' | 'image_url' | 'author' | 'slug' | 'geo_area' | 'geo_entity' | 'geo_notes'>): Record<string, unknown> {
  const path = `/tin-tuc/${form.slug || newsSlug(form.title) || 'slug'}`;
  const geoArea = form.geo_area.trim();
  const geoEntity = form.geo_entity.trim();
  const geoNotes = form.geo_notes.trim();
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: form.title,
    description: form.excerpt || form.title,
    image: form.image_url || undefined,
    author: { '@type': 'Organization', name: form.author || 'BĐS Bình Dương' },
    mainEntityOfPage: path,
    url: path,
    ...(geoArea ? { articleSection: geoArea, contentLocation: { '@type': 'Place', name: geoArea }, spatialCoverage: { '@type': 'Place', name: geoArea } } : {}),
    ...(geoEntity ? { about: [{ '@type': 'Thing', name: geoEntity }] } : {}),
    ...(geoNotes ? { mentions: [{ '@type': 'Thing', name: geoNotes }] } : {}),
  };
}

function initialForm(article: NewsArticle | null): NewsFormState {
  const rawContent = article?.content ?? '';
  return {
    title: article?.title ?? '',
    slug: article?.slug ?? '',
    category: article?.category ?? 'Thị trường',
    author: article?.author ?? 'Ban biên tập',
    image_url: article?.image_url ?? '',
    excerpt: article?.excerpt ?? '',
    content: rawContent ? (isHtmlContent(rawContent) ? rawContent : markdownToHtml(rawContent)) : '',
    is_published: article?.is_published ?? true,
    meta_title: article?.meta_title ?? '',
    meta_description: article?.meta_description ?? '',
    focus_keywords: article?.focus_keywords ?? '',
    schema_markup: article?.schema_markup ? JSON.stringify(article.schema_markup, null, 2) : '',
    related_ids: article?.related_ids ?? [],
    geo_area: article?.geo_area ?? '',
    geo_entity: article?.geo_entity ?? '',
    geo_notes: article?.geo_notes ?? '',
  };
}

function NewsForm({ article, allArticles, onSave, onCancel }: { article: NewsArticle | null; allArticles: NewsArticle[]; onSave: (payload: Partial<NewsArticle>) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<NewsFormState>(() => initialForm(article));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [relatedQuery, setRelatedQuery] = useState('');
  const [relatedOpen, setRelatedOpen] = useState(false);
  const generatedSchemaRef = useRef(form.schema_markup);
  const manualSchemaRef = useRef(Boolean(form.schema_markup.trim()));
  const set = (key: keyof NewsFormState, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));

  const candidatePool = allArticles.filter(a => a.id !== article?.id);
  const byId = new Map(candidatePool.map(a => [a.id, a]));
  const internalLinks = candidatePool
    .filter(a => a.is_published && a.slug)
    .map(a => ({ title: a.title, slug: a.slug }));
  const addRelated = (id: string) => setForm(f => (f.related_ids.includes(id) ? f : { ...f, related_ids: [...f.related_ids, id] }));
  const removeRelated = (id: string) => setForm(f => ({ ...f, related_ids: f.related_ids.filter(x => x !== id) }));
  const moveRelated = (idx: number, dir: -1 | 1) => setForm(f => {
    const next = [...f.related_ids];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return f;
    [next[idx], next[j]] = [next[j], next[idx]];
    return { ...f, related_ids: next };
  });
  const q = relatedQuery.trim().toLowerCase();
  const relatedMatches = candidatePool
    .filter(a => !form.related_ids.includes(a.id) && (!q || a.title.toLowerCase().includes(q)))
    .slice(0, 8);
  const setSeo = (value: SeoFieldsValue) => {
    manualSchemaRef.current = Boolean(value.schema_markup.trim()) && value.schema_markup !== generatedSchemaRef.current;
    setForm(f => ({ ...f, ...value }));
  };

  const resolvedSlug = form.slug.trim() || newsSlug(form.title);
  const schemaState = parseSeoSchema(form.schema_markup, 'news');
  const readiness = evaluateNewsReadiness({
    title: form.title,
    slug: resolvedSlug,
    excerpt: form.excerpt,
    content: form.content,
    imageUrl: form.image_url,
    metaTitle: form.meta_title,
    metaDescription: form.meta_description,
    focusKeywords: form.focus_keywords,
    schemaError: schemaState.error,
    geoArea: form.geo_area,
    geoEntity: form.geo_entity,
    relatedCount: form.related_ids.length,
  });
  const wordCount = countWords(plainTextFromContent(form.content));
  const internalLinkCount = countInternalLinks(form.content);
  const missingAltCount = countImagesWithoutAlt(form.content);
  const readinessDisplay = [...readiness.errors, ...readiness.warnings, ...readiness.passes].slice(0, 10);

  useEffect(() => {
    const slug = form.slug.trim() || newsSlug(form.title);
    const schema = JSON.stringify(buildNewsSchema({ ...form, slug }), null, 2);
    generatedSchemaRef.current = schema;
    setForm(f => ({
      ...f,
      meta_title: f.meta_title.trim() || f.title.slice(0, 60),
      meta_description: f.meta_description.trim() || (f.excerpt || stripHtml(f.content)).slice(0, 155),
      focus_keywords: f.focus_keywords.trim() || [f.title, f.category, 'bất động sản'].filter(Boolean).join(', '),
      schema_markup: manualSchemaRef.current ? f.schema_markup : schema,
    }));
  }, [form.title, form.slug, form.category, form.author, form.image_url, form.excerpt, form.content]);

  const autoGenerateSeo = () => {
    const schema = buildNewsSchema(form);
    setForm(f => ({
      ...f,
      meta_title: f.meta_title.trim() || f.title.slice(0, 60),
      meta_description: f.meta_description.trim() || (f.excerpt || stripHtml(f.content)).slice(0, 155),
      focus_keywords: f.focus_keywords.trim() || [f.title, f.category, 'bất động sản'].filter(Boolean).join(', '),
      schema_markup: f.schema_markup.trim() || JSON.stringify(schema, null, 2),
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Vui lòng nhập tiêu đề bài viết.'); return; }
    if (form.is_published && !readiness.canPublish) {
      setError(`Bài chưa đủ chuẩn để đăng công khai: ${readiness.errors[0]?.message ?? 'thiếu thông tin SEO/GEO bắt buộc.'}`);
      return;
    }
    if (schemaState.error) { setError(schemaState.error); return; }
    setSaving(true);
    setError('');
    const bodyHtml = form.content.replace(/<p>\s*<\/p>/g, '').trim();
    try {
      await onSave({
        title: form.title.trim(),
        slug: form.slug.trim() || newsSlug(form.title),
        category: form.category,
        author: form.author.trim() || 'Ban biên tập',
        image_url: form.image_url.trim() || null,
        excerpt: form.excerpt.trim() || null,
        content: bodyHtml || null,
        is_published: form.is_published,
        meta_title: form.meta_title.trim() || null,
        meta_description: form.meta_description.trim() || null,
        focus_keywords: form.focus_keywords.trim() || null,
        schema_markup: schemaState.schema,
        related_ids: form.related_ids.length ? form.related_ids : null,
        geo_area: form.geo_area.trim() || null,
        geo_entity: form.geo_entity.trim() || null,
        geo_notes: form.geo_notes.trim() || null,
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
              <label className="mb-1 block text-xs font-semibold text-gray-700">Ảnh đại diện bài viết</label>
              <ImageUrlInput value={form.image_url} onChange={url => set('image_url', url)} placeholder="Tải ảnh lên hoặc chọn từ thư viện" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Tóm tắt</label>
            <textarea value={form.excerpt} onChange={e => set('excerpt', e.target.value)} rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="mb-3">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">GEO / AEO cho bài viết</p>
              <p className="mt-1 text-[11px] text-blue-700/80">Nhập khu vực và entity thật để Google/AI trích xuất đúng ngữ cảnh địa phương, không chỉ dùng fallback toàn site.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Khu vực mục tiêu *</label>
                <input value={form.geo_area} onChange={e => set('geo_area', e.target.value)} placeholder="VD: Dĩ An, Bình Dương"
                  className="w-full rounded-lg border border-blue-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Entity/chủ thể chính *</label>
                <input value={form.geo_entity} onChange={e => set('geo_entity', e.target.value)} placeholder="VD: tuyến Vành đai 3, khu công nghiệp VSIP"
                  className="w-full rounded-lg border border-blue-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-gray-700">Ghi chú GEO/AEO</label>
                <textarea value={form.geo_notes} onChange={e => set('geo_notes', e.target.value)} rows={2} placeholder="Các địa danh, hạ tầng, pháp lý, nguồn dữ liệu thật cần được AI hiểu đúng..."
                  className="w-full resize-none rounded-lg border border-blue-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="block text-xs font-semibold text-gray-700">Nội dung đầy đủ</label>
              <button type="button" onClick={autoGenerateSeo} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100">
                <Sparkles className="h-3.5 w-3.5" /> Tự sinh SEO/schema
              </button>
            </div>
            <RichTextEditor value={form.content} onChange={html => set('content', html)} internalLinks={internalLinks} placeholder="Viết nội dung bài viết. Dùng thanh công cụ để in đậm, nghiêng, tiêu đề, căn lề, chèn ảnh, liên kết nội bộ..." />
            <div className="mt-2 grid gap-2 text-[11px] text-gray-500 sm:grid-cols-3">
              <span className="rounded-lg bg-gray-50 px-2 py-1">{wordCount} từ</span>
              <span className="rounded-lg bg-gray-50 px-2 py-1">{internalLinkCount} link nội bộ</span>
              <span className={`rounded-lg px-2 py-1 ${missingAltCount ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>{missingAltCount} ảnh thiếu alt</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">Bôi đen đoạn văn rồi bấm Đậm/Nghiêng/Tiêu đề/căn lề để định dạng tại chỗ. Nút Ảnh mở thư viện (chọn có sẵn hoặc tải mới) và bắt buộc nhập alt. Nút Nội bộ chèn backlink tới bài khác.</p>
            <p className="text-[10px] text-gray-400">Tự sinh schema sẽ cập nhật khi tiêu đề/tóm tắt/keywords đổi và dừng khi bạn sửa ô schema tay.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Bài viết liên quan</label>
            <p className="mb-2 text-[11px] text-gray-400">Chọn tay theo thứ tự hiển thị. Còn thiếu sẽ tự bù bằng bài cùng chủ đề / trùng từ khóa / mới nhất.</p>
            {form.related_ids.length > 0 && (
              <ol className="mb-2 space-y-1.5">
                {form.related_ids.map((id, idx) => {
                  const a = byId.get(id);
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs">
                      <span className="font-semibold text-gray-400">{idx + 1}.</span>
                      <span className="flex-1 truncate text-gray-700">{a ? a.title : '(bài đã xóa)'}</span>
                      <button type="button" onClick={() => moveRelated(idx, -1)} disabled={idx === 0} className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Lên">↑</button>
                      <button type="button" onClick={() => moveRelated(idx, 1)} disabled={idx === form.related_ids.length - 1} className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Xuống">↓</button>
                      <button type="button" onClick={() => removeRelated(id)} className="text-red-500 hover:text-red-700" aria-label="Xóa"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="relative">
              <input
                value={relatedQuery}
                onChange={e => setRelatedQuery(e.target.value)}
                onFocus={() => setRelatedOpen(true)}
                onBlur={() => setTimeout(() => setRelatedOpen(false), 150)}
                placeholder="Bấm để chọn bài, hoặc gõ tiêu đề để lọc..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              {relatedOpen && relatedMatches.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                  {relatedMatches.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); addRelated(a.id); setRelatedQuery(''); }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-gray-700 hover:bg-red-50 hover:text-red-700"
                    >
                      <span className="flex-1 truncate">{a.title}</span>
                      <span className="text-[10px] text-gray-400">{a.category}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <input type="checkbox" checked={form.is_published} onChange={e => set('is_published', e.target.checked)} className="accent-red-600" />
            Đăng công khai
          </label>
        </div>

        <aside className="border-l border-gray-100 bg-gray-50 p-5 space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Trạng thái public-ready</p>
                <p className="text-sm font-black text-gray-900">{readiness.status === 'ready' ? 'Đủ chuẩn để đăng' : readiness.status === 'needs-work' ? 'Còn điểm cần chỉnh' : 'Đang bị chặn'}</p>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-bold ${readiness.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : readiness.status === 'needs-work' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                {readiness.score}/100
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${readiness.status === 'ready' ? 'bg-emerald-500' : readiness.status === 'needs-work' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${readiness.score}%` }} />
            </div>
            <div className="mt-3 space-y-2">
              {readinessDisplay.map(item => (
                <div key={item.key} className={`rounded-lg border px-3 py-2 text-xs ${item.level === 'error' ? 'border-red-100 bg-red-50 text-red-700' : item.level === 'warning' ? 'border-amber-100 bg-amber-50 text-amber-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
                  <div className="font-bold">{item.label}</div>
                  <div className="mt-0.5 leading-relaxed">{item.message}</div>
                </div>
              ))}
            </div>
            {readiness.errors.length > 0 && (
              <p className="mt-3 text-[11px] font-semibold text-red-600">{readiness.errors.length} lỗi bắt buộc phải sửa trước khi đăng công khai.</p>
            )}
          </div>

          <AiSeoDraftPanel
            targetType="news"
            targetId={article?.id}
            disabled={!article?.id}
            disabledHint="Lưu bài viết trước để AI đọc đầy đủ nội dung rồi mới sinh draft SEO/GEO."
            onApply={(draft, emptyOnly) => {
              const pick = (cur: string, next?: string) => (emptyOnly && cur.trim() ? cur : (next ?? cur));
              manualSchemaRef.current = true;
              setForm(f => ({
                ...f,
                meta_title: pick(f.meta_title, draft.meta_title),
                meta_description: pick(f.meta_description, draft.meta_description),
                focus_keywords: pick(f.focus_keywords, draft.focus_keywords),
                geo_area: pick(f.geo_area, draft.geo_area),
                geo_entity: pick(f.geo_entity, draft.geo_entity),
                geo_notes: pick(f.geo_notes, draft.geo_notes),
                schema_markup: draft.schema_markup && Object.keys(draft.schema_markup).length > 0
                  ? (emptyOnly && f.schema_markup.trim() ? f.schema_markup : JSON.stringify(draft.schema_markup, null, 2))
                  : f.schema_markup,
              }));
            }}
          />

          <SeoFields
            value={form}
            onChange={setSeo}
            target="news"
            basePath={`/tin-tuc/${form.slug || newsSlug(form.title) || 'slug'}`}
            autoSchema={buildNewsSchema({ ...form, slug: resolvedSlug })}
          />
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
        allArticles={articles}
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
