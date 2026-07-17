import { useState, useEffect } from 'react';
import { CheckCircle, Save, Globe } from 'lucide-react';
import type { SiteContent } from '../../../lib/supabase';
import { adminGetAllSiteContent, updateSiteContent } from '../../../lib/api';
import { ImageUrlInput } from '../../ImageUpload';

// ─── CMS Content Tab ──────────────────────────────────────────────────────────
export function CmsContentTab() {
  const [items, setItems] = useState<SiteContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState('hero');
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    adminGetAllSiteContent().then(data => {
      setItems(data);
      const vals: Record<string, string> = {};
      data.forEach(item => { vals[item.id] = item.value ?? ''; });
      setEditVals(vals);
      setLoading(false);
    });
  }, []);

  const sections = [...new Set(items.map(i => i.section))];
  const sectionItems = items.filter(i => i.section === activeSection);

  const handleSave = async (id: string) => {
    setSaving(id);
    try {
      await updateSiteContent(id, editVals[id] ?? '');
      setSaved(s => ({ ...s, [id]: true }));
      setTimeout(() => setSaved(s => ({ ...s, [id]: false })), 2000);
    } catch (e) { console.error("[AdminPanel]", e); } finally { setSaving(null); }
  };

  const SECTION_LABELS: Record<string, string> = {
    navbar: 'Menu điều hướng', hero: 'Trang chủ – Hero', stats: 'Thống kê',
    featured: 'Section Nổi bật', hot: 'Section HOT', whyus: 'Tại sao chọn chúng tôi',
    cta: 'Banner CTA', footer: 'Footer',
  };

  if (loading) return <div className="text-center py-12"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Globe className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-900">Chỉnh sửa nội dung trang web</p>
          <p className="text-xs text-blue-700 mt-0.5">Mọi thay đổi sẽ hiển thị ngay trên trang web sau khi lưu. Không cần đụng vào code.</p>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2">
        {sections.map(sec => (
          <button key={sec} onClick={() => setActiveSection(sec)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeSection === sec ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-red-400'}`}>
            {SECTION_LABELS[sec] ?? sec}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
          <h3 className="font-bold text-gray-900 text-sm">{SECTION_LABELS[activeSection] ?? activeSection}</h3>
          <p className="text-gray-400 text-xs mt-0.5">{sectionItems.length} mục có thể chỉnh sửa</p>
          {activeSection === 'navbar' && (
            <p className="text-blue-600 text-xs mt-1">Các mục menu_region_* là nhãn submenu trong “Tìm theo khu vực”; link lấy theo dữ liệu khu vực hiện có.</p>
          )}
        </div>
        <div className="divide-y divide-gray-100">
          {sectionItems.map(item => (
            <div key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">{item.label}</label>
                  {item.type === 'textarea' || (editVals[item.id] ?? '').length > 80 ? (
                    <textarea
                      value={editVals[item.id] ?? ''}
                      onChange={e => setEditVals(v => ({ ...v, [item.id]: e.target.value }))}
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                  ) : item.type === 'image_url' ? (
                    <ImageUrlInput value={editVals[item.id] ?? ''} onChange={url => setEditVals(v => ({ ...v, [item.id]: url }))} />
                  ) : (
                    <input
                      type="text"
                      value={editVals[item.id] ?? ''}
                      onChange={e => setEditVals(v => ({ ...v, [item.id]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  )}
                  <p className="text-gray-400 text-[10px] mt-1">key: <code className="bg-gray-100 px-1 rounded">{item.section}.{item.key}</code></p>
                </div>
                <button
                  onClick={() => handleSave(item.id)}
                  disabled={saving === item.id}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex-shrink-0 mt-5 ${saved[item.id] ? 'bg-emerald-100 text-emerald-700' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                >
                  {saving === item.id ? <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                    : saved[item.id] ? <CheckCircle className="w-3.5 h-3.5" />
                    : <Save className="w-3.5 h-3.5" />}
                  {saved[item.id] ? 'Đã lưu' : 'Lưu'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
