import { useState, useEffect } from 'react';
import { CheckCircle, Save, Settings } from 'lucide-react';
import type { SiteSetting } from '../../../lib/supabase';
import { adminGetAllSiteSettings, updateSiteSetting } from '../../../lib/api';
import { parseGoogleAdsConversion, parseGoogleDestination } from '../../../lib/googleTag';
import { ImageUrlInput } from '../../ImageUpload';

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

  const validateSetting = (key: string, value: string): string | null => {
    if (key === 'google_analytics_id' || key === 'google_ads_id') {
      return value.trim() && !parseGoogleDestination(value) ? 'Mã phải có dạng G-... hoặc AW-... .' : null;
    }
    if (key === 'google_ads_lead_conversion') {
      return value.trim() && !parseGoogleAdsConversion(value) ? 'Mã chuyển đổi phải có dạng AW-.../label.' : null;
    }
    return null;
  };

  const handleSave = async (key: string) => {
    const value = editVals[key] ?? '';
    const validationError = validateSetting(key, value);
    if (validationError) { window.alert(validationError); return; }
    setSaving(key);
    try {
      await updateSiteSetting(key, value);
      setSavedKeys(s => ({ ...s, [key]: true }));
      if (key === 'google_analytics_id' || key === 'google_ads_id' || key === 'google_ads_lead_conversion') {
        window.alert('Đã lưu. Hãy tải lại trang công khai để Google tag nhận cấu hình mới.');
      }
      setTimeout(() => setSavedKeys(s => ({ ...s, [key]: false })), 2000);
    } catch (e) { console.error("[AdminPanel]", e); } finally { setSaving(null); }
  };

  const GROUP_LABELS: Record<string, string> = {
    general: 'Chung', contact: 'Liên hệ', social: 'Mạng xã hội', seo: 'SEO',
    footer: 'Footer', hero: 'Hero / Banner', sections: 'Tiêu đề Section', schema: 'Schema',
  };

  const isImageSetting = (setting: SiteSetting) => {
    const key = setting.key.toLowerCase();
    const label = setting.label.toLowerCase();
    return setting.type === 'image' || key.includes('image') || key.includes('logo') || key.includes('avatar') || key.includes('banner') || key.includes('og_') || key.includes('favicon') || key.includes('icon') || label.includes('ảnh') || label.includes('logo') || label.includes('favicon');
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
              {setting.key === 'google_analytics_id' && <p className="mb-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">Mã GA4 đang dùng: <strong>G-SKF33YNMZZ</strong>. Chỉ nhập mã ngắn dạng <strong>G-...</strong>, không dán nguyên thẻ script.</p>}
              {setting.key === 'google_ads_id' && <p className="mb-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">Nhập mã tài khoản Google Ads dạng <strong>AW-...</strong>. Thẻ Google sẽ được cài trên mọi trang khi mã hợp lệ.</p>}
              {setting.key === 'google_ads_lead_conversion' && <p className="mb-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">Nhập đích chuyển đổi dạng <strong>AW-.../label</strong>. Conversion chỉ gửi sau khi form lead lưu thành công.</p>}
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">{setting.label}</label>
                  {isImageSetting(setting) ? (
                    <ImageUrlInput
                      value={editVals[setting.key] ?? ''}
                      onChange={url => setEditVals(v => ({ ...v, [setting.key]: url }))}
                      placeholder="Tải ảnh lên hoặc chọn từ thư viện"
                      folder="branding"
                      isAdmin
                    />
                  ) : setting.type === 'textarea' ? (
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
