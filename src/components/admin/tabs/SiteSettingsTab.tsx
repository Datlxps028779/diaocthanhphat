import { useState, useEffect } from 'react';
import { CheckCircle, Image as ImageIcon, Save, Settings, Share2 } from 'lucide-react';
import type { SiteSetting } from '../../../lib/supabase';
import { adminGetAllSiteSettings, updateSiteSetting, upsertSiteSetting } from '../../../lib/api';
import { parseGoogleAdsConversion, parseGoogleDestination } from '../../../lib/googleTag';
import { ImageUrlInput } from '../../ImageUpload';

// ─── Site Settings Tab ────────────────────────────────────────────────────────
export function SiteSettingsTab() {
  const [settings, setSettings] = useState<SiteSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeGroup, setActiveGroup] = useState('general');

  useEffect(() => {
    adminGetAllSiteSettings().then(data => {
      setSettings(data);
      const vals: Record<string, string> = {};
      data.forEach(s => { vals[s.key] = s.value ?? ''; });
      setEditVals(vals);
    }).catch(error => {
      console.error('[AdminPanel]', error);
      setLoadError(error instanceof Error ? error.message : 'Không thể tải cài đặt trang web.');
    }).finally(() => setLoading(false));
  }, []);

  const groups = [...new Set([...settings.map(s => s.group_name), 'seo'])];
  const groupSettings = settings.filter(s => s.group_name === activeGroup && s.key !== 'og_image');
  const ogImageSetting = settings.find(setting => setting.key === 'og_image');
  const ogImageValue = editVals.og_image ?? ogImageSetting?.value ?? '';

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
      if (key === 'og_image' && !ogImageSetting) {
        await upsertSiteSetting({
          key,
          value,
          label: 'Ảnh bìa chia sẻ trang chủ',
          group_name: 'seo',
          type: 'image',
        });
        setSettings(current => [...current, {
          id: key,
          key,
          value,
          label: 'Ảnh bìa chia sẻ trang chủ',
          group_name: 'seo',
          type: 'image',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }]);
      } else {
        await updateSiteSetting(key, value);
      }
      setErrors(current => ({ ...current, [key]: '' }));
      setSavedKeys(s => ({ ...s, [key]: true }));
      if (key === 'google_analytics_id' || key === 'google_ads_id' || key === 'google_ads_lead_conversion') {
        window.alert('Đã lưu. Hãy tải lại trang công khai để Google tag nhận cấu hình mới.');
      }
      setTimeout(() => setSavedKeys(s => ({ ...s, [key]: false })), 2000);
    } catch (e) {
      console.error("[AdminPanel]", e);
      setErrors(current => ({ ...current, [key]: e instanceof Error ? e.message : 'Không thể lưu cài đặt. Vui lòng thử lại.' }));
    } finally { setSaving(null); }
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
  if (loadError) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{loadError}</div>;

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

      {activeGroup === 'seo' && (
        <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 shadow-sm">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"><Share2 className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900">Ảnh bìa chia sẻ trang chủ</p>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Dùng khi chia sẻ <strong>https://chonhaviet.com/</strong> qua Facebook, Zalo, X và ứng dụng hỗ trợ Open Graph. Ảnh này không thay ảnh nền Hero của trang chủ.</p>
              </div>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-indigo-700 shadow-sm ring-1 ring-indigo-100"><ImageIcon className="h-3.5 w-3.5" />1200 × 630 px</span>
          </div>
          <div className="border-t border-indigo-100 bg-white/70 p-5">
            <ImageUrlInput
              value={ogImageValue}
              onChange={url => setEditVals(values => ({ ...values, og_image: url }))}
              placeholder="Tải ảnh bìa lên hoặc chọn từ thư viện"
              folder="branding"
              isAdmin
            />
            {errors.og_image && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{errors.og_image}</p>}
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-sky-100 bg-sky-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-sky-900">Nên dùng ảnh ngang 1200 × 630 px, có tên thương hiệu rõ ràng và ít chữ. Facebook/Zalo có thể giữ cache ảnh cũ; sau khi lưu, hãy dùng công cụ debug hoặc chia sẻ lại để yêu cầu đọc preview mới.</p>
              <button onClick={() => handleSave('og_image')} disabled={saving === 'og_image'}
                className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${savedKeys.og_image ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'} disabled:opacity-60`}>
                {saving === 'og_image' ? <div className="h-3.5 w-3.5 animate-spin rounded-full border border-white border-t-transparent" />
                  : savedKeys.og_image ? <CheckCircle className="h-3.5 w-3.5" />
                  : <Save className="h-3.5 w-3.5" />}
                {savedKeys.og_image ? 'Đã lưu' : 'Lưu ảnh bìa'}
              </button>
            </div>
          </div>
        </section>
      )}

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
