import { useState, useEffect, type ChangeEvent } from 'react';
import { Plus, Edit2, Trash2, CheckCircle, Save, ArrowDown, FileText } from 'lucide-react';
import type { ManagedPage, PageBlock } from '../../../lib/supabase';
import { adminGetAllManagedPages, adminCreateManagedPage, adminUpdateManagedPage, adminDeleteManagedPage, adminGetPageBlocks, adminSavePageBlock, adminDeletePageBlock } from '../../../lib/api';
import { PublicUrlPreview } from '../shared/PublicUrlPreview';
import { RichTextEditor } from '../shared/RichTextEditor';
import { ImageUrlInput } from '../../ImageUpload';
import {
  collectionItemIsComplete,
  getCollectionDefinition,
  getCollectionDefinitions,
  parseContentCollection,
  serializeContentCollection,
  type CollectionDefinition,
  type ContentCollectionItem,
} from '../../../lib/pageContentSchema';

// ─── Pages Tab ────────────────────────────────────────────────────────────────

const BLOCK_TYPE_LABELS: Record<string, string> = {
  text: 'Văn bản ngắn', textarea: 'Đoạn văn', html: 'Nội dung định dạng (có bảng)', image: 'Ảnh (tải lên / thư viện)',
  number: 'Số', color: 'Màu', list: 'Danh sách (mỗi dòng 1 mục)',
};

// Map slug trang quản lý → route công khai tĩnh (khớp pageToHref trong router.ts).
const PAGE_PUBLIC_PATH: Record<string, string> = {
  about: '/ve-chung-toi',
  invest: '/dau-tu',
  regions: '/khu-vuc',
  news: '/tin-tuc',
};

const SECTION_LABELS: Record<string, Record<string, string>> = {
  about: { hero: 'Hero', stats: 'Thống kê', mission: 'Sứ mệnh', vision: 'Tầm nhìn', values: 'Giá trị cốt lõi', timeline: 'Hành trình', team: 'Đội ngũ', awards: 'Giải thưởng' },
  invest: { hero: 'Hero', calculator: 'Công cụ tính ROI', opportunities: 'Cơ hội đầu tư', process: 'Quy trình', cta: 'CTA / Form tư vấn' },
  regions: { hero: 'Hero', main: 'Nội dung chính', cta: 'CTA cuối trang' },
  news: { hero: 'Hero', newsletter: 'Đăng ký nhận tin' },
};

function publicPathForPage(slug: string): string {
  return PAGE_PUBLIC_PATH[slug] ?? `/trang/${slug}`;
}

function CollectionBlockEditor({ block, definition, onSave, onDelete }: {
  block: PageBlock;
  definition: CollectionDefinition;
  onSave: (value: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [items, setItems] = useState<ContentCollectionItem[]>(() => parseContentCollection(block.value, definition));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const sourceValue = serializeContentCollection(parseContentCollection(block.value, definition), definition);
  const draftValue = serializeContentCollection(items, definition);
  const dirty = draftValue !== sourceValue;

  useEffect(() => {
    setItems(parseContentCollection(block.value, definition));
  }, [block.value, definition]);

  const updateItem = (index: number, key: string, value: string) => {
    setItems(current => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const field = definition.fields.find(candidate => candidate.key === key);
      return { ...item, [key]: field?.kind === 'list' ? value.split('\n').map(entry => entry.trim()).filter(Boolean) : value };
    }));
  };

  const save = async () => {
    if (items.some(item => !collectionItemIsComplete(item, definition))) {
      setError('Hãy điền các trường bắt buộc trước khi lưu.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(draftValue);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không lưu được nội dung.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-gray-900">{definition.label}</h4>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{definition.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {dirty && <button type="button" onClick={save} disabled={saving} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${saved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-600 text-white hover:bg-red-700'} disabled:opacity-60`}>
            {saving ? 'Đang lưu...' : saved ? 'Đã lưu' : 'Lưu'}
          </button>}
          <button type="button" onClick={onDelete} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500" title="Xóa khối nội dung"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-700">{definition.itemLabel} {index + 1}</p>
              <div className="flex gap-1">
                <button type="button" disabled={index === 0} onClick={() => setItems(current => current.map((entry, entryIndex) => entryIndex === index ? current[index - 1] : entryIndex === index - 1 ? current[index] : entry))} className="rounded px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-white disabled:opacity-30">Lên</button>
                <button type="button" disabled={index === items.length - 1} onClick={() => setItems(current => current.map((entry, entryIndex) => entryIndex === index ? current[index + 1] : entryIndex === index + 1 ? current[index] : entry))} className="rounded px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-white disabled:opacity-30">Xuống</button>
                <button type="button" onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50">Xóa</button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {definition.fields.map(field => {
                const rawValue = item[field.key];
                const value = Array.isArray(rawValue) ? rawValue.join('\n') : String(rawValue ?? '');
                const common = { value, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => updateItem(index, field.key, event.target.value), placeholder: field.placeholder ?? '', className: 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400' };
                return <label key={field.key} className={field.kind === 'textarea' || field.kind === 'list' ? 'sm:col-span-2' : ''}><span className="mb-1 block text-xs font-semibold text-gray-600">{field.label}{field.required ? ' *' : ''}</span>{field.kind === 'textarea' || field.kind === 'list' ? <textarea {...common} rows={field.kind === 'list' ? 4 : 3} /> : field.kind === 'image' ? <ImageUrlInput value={value} onChange={nextValue => updateItem(index, field.key, nextValue)} placeholder="Tải ảnh lên hoặc chọn từ thư viện" folder="pages" isAdmin /> : <input {...common} type="text" />}</label>;
              })}
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setItems(current => [...current, {}])} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"><Plus className="h-3.5 w-3.5" />Thêm {definition.itemLabel.toLowerCase()}</button>
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}

function PageBlockEditor({ block, onSave, onDelete }: {
  block: PageBlock;
  onSave: (val: string) => void;
  onDelete: () => void;
}) {
  const [val, setVal] = useState(block.value ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = val !== (block.value ?? '');

  const doSave = async () => {
    setSaving(true);
    await onSave(val);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setSaving(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-xs font-bold text-gray-800">{block.label}</span>
          <span className="ml-2 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{BLOCK_TYPE_LABELS[block.type] ?? block.type}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {dirty && (
            <button onClick={doSave} disabled={saving}
              className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${saved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-600 text-white hover:bg-red-700'}`}>
              {saving ? <div className="w-3 h-3 border border-white/50 border-t-white rounded-full animate-spin" />
                : saved ? <CheckCircle className="w-3 h-3" /> : <Save className="w-3 h-3" />}
              {saved ? 'Đã lưu' : 'Lưu'}
            </button>
          )}
          <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {block.type === 'html' ? (
        <RichTextEditor value={val} onChange={setVal} placeholder="Soạn nội dung trang..." />
      ) : block.type === 'textarea' || block.type === 'list' ? (
        <textarea value={val} onChange={e => setVal(e.target.value)} rows={block.type === 'list' ? 5 : 3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none font-mono text-xs" />
      ) : block.type === 'image' ? (
        <ImageUrlInput value={val} onChange={setVal} placeholder="Tải ảnh lên hoặc chọn từ thư viện" folder="pages" isAdmin />
      ) : block.type === 'color' ? (
        <div className="flex items-center gap-2">
          <input type="color" value={val || '#000000'} onChange={e => setVal(e.target.value)} className="w-10 h-10 rounded cursor-pointer border border-gray-200" />
          <input type="text" value={val} onChange={e => setVal(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
      ) : (
        <input type={block.type === 'number' ? 'number' : 'text'} value={val} onChange={e => setVal(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
      )}
      <p className="text-[10px] text-gray-400 mt-1">key: <code className="bg-gray-100 px-1 rounded">{block.section}/{block.key}</code></p>
    </div>
  );
}

function AddBlockForm({ pageSlug, onAdded }: { pageSlug: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState('');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const doAdd = async () => {
    if (!section.trim() || !key.trim() || !label.trim()) return;
    setSaving(true);
    try {
      await adminSavePageBlock({ page_slug: pageSlug, section: section.trim(), key: key.trim(), label: label.trim(), type, value, order_index: 999 });
      onAdded();
      setSection(''); setKey(''); setLabel(''); setType('text'); setValue('');
      setOpen(false);
    } catch (e) { alert((e as Error).message); }
    setSaving(false);
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex items-center gap-2 border-2 border-dashed border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600 rounded-xl px-4 py-3 text-sm font-semibold transition-colors w-full">
      <Plus className="w-4 h-4" />Thêm nội dung mới
    </button>
  );

  return (
    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-bold text-blue-800">Thêm khối nội dung mới</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Section (nhóm)</label>
          <input value={section} onChange={e => setSection(e.target.value)} placeholder="hero, stats, team..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Key (tên field)</label>
          <input value={key} onChange={e => setKey(e.target.value)} placeholder="title, subtitle, image..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Nhãn hiển thị</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Tiêu đề trang..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Kiểu nội dung</label>
          <select value={type} onChange={e => setType(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            {Object.entries(BLOCK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Giá trị mặc định</label>
        {type === 'html' ? (
          <RichTextEditor value={value} onChange={setValue} placeholder="Soạn nội dung mặc định..." />
        ) : type === 'textarea' || type === 'list'
          ? <textarea value={value} onChange={e => setValue(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          : <input type="text" value={value} onChange={e => setValue(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        }
      </div>
      <div className="flex gap-2">
        <button onClick={doAdd} disabled={saving || !section.trim() || !key.trim() || !label.trim()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-40">
          <Save className="w-3.5 h-3.5" />Thêm
        </button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Hủy</button>
      </div>
    </div>
  );
}

function PageContentEditor({ page, onBack }: { page: ManagedPage; onBack: () => void }) {
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => adminGetPageBlocks(page.slug).then(b => { setBlocks(b); setLoading(false); });
  useEffect(() => { load(); }, [page.slug]);

  const grouped: Record<string, PageBlock[]> = {};
  for (const b of blocks) {
    if (!grouped[b.section]) grouped[b.section] = [];
    grouped[b.section].push(b);
  }

  const sectionLabels = SECTION_LABELS[page.slug] ?? {};
  const collectionDefinitions = getCollectionDefinitions(page.slug);
  const configuredBlocks = new Set(blocks.map(block => `${block.section}/${block.key}`));
  const missingCollections = collectionDefinitions.filter(definition => !configuredBlocks.has(`${definition.section}/${definition.key}`));

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
          <ArrowDown className="w-4 h-4 rotate-90" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-gray-900">{page.title}</h2>
          <p className="text-gray-500 text-xs">Chỉnh sửa toàn bộ nội dung trang — thay đổi được lưu ngay lập tức</p>
          <PublicUrlPreview path={publicPathForPage(page.slug)} />
        </div>
        <div className={`ml-auto px-3 py-1 rounded-full text-xs font-bold ${page.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
          {page.is_active ? 'Đang hiển thị' : 'Ẩn'}
        </div>
      </div>

      {Object.entries(grouped).map(([section, sectionBlocks]) => (
        <div key={section} className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-5 bg-red-600 rounded-full" />
            <h3 className="font-bold text-gray-700 text-sm">{sectionLabels[section] ?? section}</h3>
          </div>
          {sectionBlocks.map(block => {
            const definition = getCollectionDefinition(page.slug, block.section, block.key);
            const saveBlock = async (value: string) => {
              await adminSavePageBlock({ page_slug: page.slug, section: block.section, key: block.key, label: block.label, type: block.type, value, order_index: block.order_index });
              setBlocks(prev => prev.map(candidate => candidate.id === block.id ? { ...candidate, value } : candidate));
            };
            const deleteBlock = async () => {
              if (!confirm(`Xóa trường "${block.label}"?`)) return;
              await adminDeletePageBlock(block.id);
              setBlocks(prev => prev.filter(candidate => candidate.id !== block.id));
            };
            return definition ? <CollectionBlockEditor key={block.id} block={block} definition={definition} onSave={saveBlock} onDelete={deleteBlock} /> : <PageBlockEditor key={block.id} block={block} onSave={saveBlock} onDelete={deleteBlock} />;
          })}
        </div>
      ))}

      {missingCollections.length > 0 && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-bold text-blue-900">Thêm nhóm nội dung có sẵn</h3>
          <p className="mt-1 text-xs leading-relaxed text-blue-800">Chọn mẫu để quản lý bằng biểu mẫu rõ ràng; không cần tạo section/key hoặc dùng cú pháp kỹ thuật.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {missingCollections.map(definition => <button key={`${definition.section}/${definition.key}`} type="button" onClick={async () => {
              await adminSavePageBlock({ page_slug: page.slug, section: definition.section, key: definition.key, label: definition.label, type: 'collection', value: serializeContentCollection([], definition), order_index: 999 });
              load();
            }} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-400 hover:bg-blue-100">+ {definition.label}</button>)}
          </div>
        </section>
      )}

      <details className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">Nội dung nâng cao (dành cho trường đặc biệt)</summary>
        <p className="mt-2 text-xs leading-relaxed text-gray-500">Các nhóm nội dung thông thường đã có biểu mẫu riêng bên trên. Chỉ dùng phần này khi cần thêm field ngoài mẫu.</p>
        <div className="mt-3"><AddBlockForm pageSlug={page.slug} onAdded={load} /></div>
      </details>
    </div>
  );
}

export function PagesTab() {
  const [pages, setPages] = useState<ManagedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPage, setSelectedPage] = useState<ManagedPage | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newForm, setNewForm] = useState({ slug: '', title: '', description: '', hero_image: '', is_active: true });

  // Trang container 'khu-dan-cu:<slug>' là trang nội bộ chứa page_blocks pillar/FAQ,
  // quản lý qua tab Khu dân cư — ẩn khỏi danh sách trang thường để không lộn xộn
  // và tránh xóa nhầm. Vòng đời do NeighborhoodsTab (tạo/xóa theo khu dân cư).
  const load = () => adminGetAllManagedPages().then(p => {
    setPages(p.filter(x => !x.slug.startsWith('khu-dan-cu:')));
    setLoading(false);
  });
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newForm.slug.trim() || !newForm.title.trim()) return;
    setSaving(true);
    try {
      await adminCreateManagedPage({ ...newForm, is_system: false, order_index: pages.length });
      await load();
      setCreating(false);
      setNewForm({ slug: '', title: '', description: '', hero_image: '', is_active: true });
    } catch (e) { alert((e as Error).message); }
    setSaving(false);
  };

  const toggleActive = async (page: ManagedPage) => {
    await adminUpdateManagedPage(page.id, { is_active: !page.is_active });
    setPages(prev => prev.map(p => p.id === page.id ? { ...p, is_active: !p.is_active } : p));
  };

  if (selectedPage) return <PageContentEditor page={selectedPage} onBack={() => setSelectedPage(null)} />;

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-red-600" />Quản lý trang
          </h2>
          <p className="text-gray-500 text-sm mt-1">Chỉnh sửa toàn bộ nội dung từng trang — tiêu đề, mô tả, ảnh, văn bản và thêm trang mới.</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" />Trang mới
        </button>
      </div>

      {creating && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-blue-800 text-sm">Tạo trang mới</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Slug (URL) *</label>
              <input value={newForm.slug} onChange={e => setNewForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                placeholder="ve-chung-toi, dau-tu..." className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tiêu đề trang *</label>
              <input value={newForm.title} onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Về chúng tôi" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Mô tả ngắn</label>
            <input value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả nội dung trang..." className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">URL ảnh hero</label>
            <input value={newForm.hero_image} onChange={e => setNewForm(f => ({ ...f, hero_image: e.target.value }))}
              placeholder="https://images.pexels.com/..." className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !newForm.slug.trim() || !newForm.title.trim()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40">
              <Save className="w-3.5 h-3.5" />{saving ? 'Đang tạo...' : 'Tạo trang'}
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Hủy</button>
          </div>
        </div>
      )}

      {/* System pages */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-5 bg-amber-500 rounded-full" />
          <h3 className="font-bold text-gray-700 text-sm">Trang hệ thống</h3>
          <span className="text-xs text-gray-400">({pages.filter(p => p.is_system).length} trang)</span>
        </div>
        <div className="space-y-2">
          {pages.filter(p => p.is_system).map(page => (
            <div key={page.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
              {page.hero_image && (
                <img src={page.hero_image} alt="" className="w-14 h-10 object-cover rounded-lg flex-shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm">{page.title}</span>
                  <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">Hệ thống</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${page.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {page.is_active ? 'Hiển thị' : 'Ẩn'}
                  </span>
                </div>
                {page.description && <p className="text-gray-400 text-xs mt-0.5 truncate">{page.description}</p>}
                <p className="text-gray-400 text-[10px] mt-0.5">{publicPathForPage(page.slug)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => toggleActive(page)} title={page.is_active ? 'Ẩn trang' : 'Hiện trang'}
                  className={`relative w-10 h-5 rounded-full transition-all cursor-pointer ${page.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${page.is_active ? 'left-5' : 'left-0.5'}`} />
                </button>
                <button onClick={() => setSelectedPage(page)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors">
                  <Edit2 className="w-3 h-3" />Chỉnh sửa nội dung
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom pages */}
      {pages.filter(p => !p.is_system).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-5 bg-blue-500 rounded-full" />
            <h3 className="font-bold text-gray-700 text-sm">Trang tùy chỉnh</h3>
            <span className="text-xs text-gray-400">({pages.filter(p => !p.is_system).length} trang)</span>
          </div>
          <div className="space-y-2">
            {pages.filter(p => !p.is_system).map(page => (
              <div key={page.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                {page.hero_image && (
                  <img src={page.hero_image} alt="" className="w-14 h-10 object-cover rounded-lg flex-shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{page.title}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${page.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {page.is_active ? 'Hiển thị' : 'Ẩn'}
                    </span>
                  </div>
                  {page.description && <p className="text-gray-400 text-xs mt-0.5 truncate">{page.description}</p>}
                  <p className="text-gray-400 text-[10px] mt-0.5">{publicPathForPage(page.slug)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleActive(page)}
                    className={`relative w-10 h-5 rounded-full transition-all cursor-pointer ${page.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${page.is_active ? 'left-5' : 'left-0.5'}`} />
                  </button>
                  <button onClick={() => setSelectedPage(page)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors">
                    <Edit2 className="w-3 h-3" />Chỉnh sửa
                  </button>
                  <button onClick={async () => {
                    if (!confirm(`Xóa trang "${page.title}"?`)) return;
                    await adminDeleteManagedPage(page.id);
                    setPages(prev => prev.filter(p => p.id !== page.id));
                  }} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
