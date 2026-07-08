import { useState, useEffect } from 'react';
import { CheckCircle, Save, Settings } from 'lucide-react';
import type { SiteSetting } from '../../../lib/supabase';
import { adminGetAllSiteSettings, updateSiteSetting } from '../../../lib/api';

// ─── Site Settings Tab ────────────────────────────────────────────────────────
export function SiteSettingsTab() {
  const [settings, setSettings] = useState<SiteSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [activeGroup, setActiveGroup] = useState('general');

  useEffect(() => {
    adminGetAllSiteSettings().then(data => {
      setSettings(data);
      const vals: Record<string, string> = {};
      data.forEach(s => { vals[s.key] = s.value ?? ''; });
      setEditVals(vals);
      setLoading(false);
    });
  }, []);

  const groups = [...new Set(settings.map(s => s.group_name))];
  const groupSettings = settings.filter(s => s.group_name === activeGroup);

  const handleSave = async (key: string) => {
    setSaving(key);
    try {
      await updateSiteSetting(key, editVals[key] ?? '');
      setSavedKeys(s => ({ ...s, [key]: true }));
      setTimeout(() => setSavedKeys(s => ({ ...s, [key]: false })), 2000);
    } catch (e) { console.error("[AdminPanel]", e); } finally { setSaving(null); }
  };

  const GROUP_LABELS: Record<string, string> = {
    general: 'Chung', contact: 'Liên hệ', social: 'Mạng xã hội', seo: 'SEO',
    footer: 'Footer', hero: 'Hero / Banner', sections: 'Tiêu đề Section',
  };

  if (loading) return <div className="text-center py-12"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <Settings className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-900">Cài đặt trang web</p>
          <p className="text-xs text-amber-700 mt-0.5">Thay đổi tên, logo, thông tin liên hệ, SEO mà không cần sửa code.</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {groups.map(g => (
          <button key={g} onClick={() => setActiveGroup(g)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeGroup === g ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-red-400'}`}>
            {GROUP_LABELS[g] ?? g}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-gray-100">
          {groupSettings.map(setting => (
            <div key={setting.key} className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">{setting.label}</label>
                  {setting.type === 'textarea' ? (
                    <textarea
                      value={editVals[setting.key] ?? ''}
                      onChange={e => setEditVals(v => ({ ...v, [setting.key]: e.target.value }))}
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                  ) : setting.type === 'color' ? (
                    <div className="flex items-center gap-2">
                      <input type="color" value={editVals[setting.key] ?? '#dc2626'}
                        onChange={e => setEditVals(v => ({ ...v, [setting.key]: e.target.value }))}
                        className="w-10 h-10 rounded cursor-pointer border border-gray-200" />
                      <input type="text" value={editVals[setting.key] ?? ''}
                        onChange={e => setEditVals(v => ({ ...v, [setting.key]: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                    </div>
                  ) : (
                    <input
                      type={setting.type === 'url' ? 'url' : setting.type === 'phone' ? 'tel' : 'text'}
                      value={editVals[setting.key] ?? ''}
                      onChange={e => setEditVals(v => ({ ...v, [setting.key]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  )}
                  <p className="text-gray-400 text-[10px] mt-1">key: <code className="bg-gray-100 px-1 rounded">{setting.key}</code></p>
                </div>
                <button onClick={() => handleSave(setting.key)} disabled={saving === setting.key}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex-shrink-0 mt-5 ${savedKeys[setting.key] ? 'bg-emerald-100 text-emerald-700' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
                  {saving === setting.key ? <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                    : savedKeys[setting.key] ? <CheckCircle className="w-3.5 h-3.5" />
                    : <Save className="w-3.5 h-3.5" />}
                  {savedKeys[setting.key] ? 'Đã lưu' : 'Lưu'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
